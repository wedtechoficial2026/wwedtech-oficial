<?php
// api/suporte.php - Suporte do lojista: seus chamados, abrir chamado e responder.
// GET → { consultor, chamados }   GET ?pulso=1 → { sig, nao_lidas, novas }
// POST ?acao=abrir {assunto, mensagem} | ?acao=responder&id= {texto} | ?acao=lido&id=
require_once __DIR__ . '/_api.php';
require_once __DIR__ . '/../backend/app_state.php';

if (!is_logged_in()) {
    responder(['ok' => false, 'erro' => 'Faça login para continuar.'], 401);
}
$user = get_logged_user();
$context = panelContext($user);
if (!$context) {
    responder(['ok' => false, 'erro' => 'Os chamados das lojas ficam na área do consultor.'], 403);
}
$db = getDb();
$ownerId = $context['owner_id'];

try {
    $business = $db->prepare('SELECT id FROM businesses WHERE owner_user_id = ?');
    $business->execute([$ownerId]);
    $businessId = (int)$business->fetchColumn();
    // Consulta leve a cada poucos segundos: respostas novas do consultor viram aviso no painel
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['pulso'])) {
        responder(['ok' => true, 'dados' => $businessId ? ownerSupportPulse($db, $ownerId) : ['sig' => '', 'nao_lidas' => 0, 'novas' => []]]);
    }
    if (!$businessId) {
        throw new DomainException('Abra o painel da loja uma vez antes de pedir suporte.');
    }
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        responder(['ok' => true, 'dados' => ['consultor' => businessContract($db, $ownerId)['consultant'], 'chamados' => ownerTickets($db, $ownerId)]]);
    }
    exigir_metodo('POST');
    if ($context['readonly']) {
        throw new DomainException('Modo suporte: responda os chamados pela área do consultor.');
    }
    $corpo = ler_corpo();
    $acao = (string)($_GET['acao'] ?? '');
    if ($acao === 'abrir') {
        $ticketId = openTicket($db, $user, $businessId, (string)($corpo['assunto'] ?? ''), (string)($corpo['mensagem'] ?? ''));
        responder(['ok' => true, 'dados' => ticketForUser($db, $user, $ticketId)], 201);
    }
    if ($acao === 'lido') {
        $ticketId = (int)($_GET['id'] ?? 0);
        ticketForUser($db, $user, $ticketId);
        markTicketSeen($db, $user, $ticketId);
        responder(['ok' => true, 'dados' => true]);
    }
    if ($acao === 'responder') {
        $ticketId = (int)($_GET['id'] ?? 0);
        replyTicket($db, $user, $ticketId, (string)($corpo['texto'] ?? ''));
        responder(['ok' => true, 'dados' => ticketForUser($db, $user, $ticketId)]);
    }
    throw new InvalidArgumentException('Ação inválida.');
} catch (InvalidArgumentException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 422);
} catch (DomainException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 403);
} catch (Throwable $e) {
    error_log('Falha no suporte: ' . $e->getMessage());
    responder(['ok' => false, 'erro' => 'Não foi possível concluir. Tente novamente.'], 500);
}
