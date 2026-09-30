<?php
require_once __DIR__ . '/_api.php';
require_once __DIR__ . '/../backend/app_state.php';

if (!is_logged_in()) {
    responder(['ok' => false, 'erro' => 'Faça login para acessar os dados.'], 401);
}

$metodo = $_SERVER['REQUEST_METHOD'];
if (!in_array($metodo, ['GET', 'PUT'], true)) {
    header('Allow: GET, PUT');
    responder(['ok' => false, 'erro' => 'Método não permitido.'], 405);
}

$corpo = $metodo === 'PUT' ? ler_corpo() : [];
$appKey = (string)($metodo === 'GET' ? ($_GET['app'] ?? '') : ($corpo['app'] ?? ''));
if (!in_array($appKey, ['legacy', 'modular'], true)) {
    responder(['ok' => false, 'erro' => 'Painel inválido.'], 422);
}

// Consultor em modo suporte lê a loja escolhida, mas nunca grava; sem modo suporte, não há painel
$context = panelContext(get_logged_user());
if (!$context) {
    responder(['ok' => false, 'erro' => 'Abra uma loja pela área do consultor para ver o painel dela.'], 403);
}
if ($metodo === 'PUT' && $context['readonly']) {
    responder(['ok' => false, 'erro' => 'Modo suporte: você está só olhando o painel desta loja. Nada foi alterado.'], 403);
}
if ($appKey === 'legacy' && $context['readonly']) {
    responder(['ok' => false, 'erro' => 'O painel clássico não abre em modo suporte.'], 403);
}

try {
    $db = getDb();
    $userId = $context['owner_id'];

    // Consulta leve para a atualização em tempo real: só o número da versão salva
    if ($metodo === 'GET' && isset($_GET['revisao'])) {
        $stmt = $db->prepare('SELECT revision FROM app_states WHERE user_id = ? AND app_key = ?');
        $stmt->execute([$userId, $appKey]);
        // Mudança feita pelo consultor (plano, módulos, situação) não muda a versão: vai como assinatura
        $contract = $appKey === 'modular' ? businessContract($db, $userId) : null;
        responder(['ok' => true, 'revision' => (int)$stmt->fetchColumn(), 'contrato' => $contract ? substr(md5(json_encode($contract)), 0, 12) : '']);
    }
    if ($metodo === 'GET') {
        $state = loadAppState($db, $userId, $appKey);
        if ($appKey === 'modular' && $state) {
            if (!$context['readonly']) syncModularTables($db, $userId, $state['data'], $state['revision']);
        }
        responder(['ok' => true, 'user_id' => $userId, 'state' => $state]);
    }

    $revision = filter_var($corpo['revision'] ?? null, FILTER_VALIDATE_INT);
    $data = $corpo['data'] ?? null;
    if ($revision === false || $revision === null || $revision < 0 || !is_array($data)) {
        responder(['ok' => false, 'erro' => 'Dados ou revisão inválidos.'], 422);
    }

    $result = saveAppState($db, $userId, $appKey, $data, $revision);
    if ($result['conflict']) {
        responder(['ok' => false, 'erro' => 'Os dados mudaram em outra aba. Recarregue antes de continuar.', 'state' => $result['state']], 409);
    }

    responder(['ok' => true, 'revision' => $result['revision']]);
} catch (LengthException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 413);
} catch (JsonException | UnexpectedValueException $e) {
    responder(['ok' => false, 'erro' => 'Não foi possível processar os dados salvos.'], 500);
} catch (Throwable $e) {
    error_log('Falha ao persistir estado WedTech: ' . $e->getMessage());
    responder(['ok' => false, 'erro' => 'Não foi possível salvar no banco de dados.'], 500);
}