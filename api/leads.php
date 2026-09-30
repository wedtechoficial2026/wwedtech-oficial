<?php
require_once __DIR__ . '/_api.php';
require_once __DIR__ . '/../backend/db.php';

exigir_metodo('POST');
$lead = ler_corpo();
$nome = trim((string)($lead['nome'] ?? ''));
$email = trim((string)($lead['email'] ?? ''));
$whatsapp = trim((string)($lead['whatsapp'] ?? ''));
$origem = (string)($lead['origem'] ?? '');
$clientId = (string)($lead['client_id'] ?? '');
$telefone = preg_replace('/\D/', '', $whatsapp);
if ($nome === '' && $origem === 'ia') {
    $nome = 'Lead IA';
}

if (
    mb_strlen($nome) < 2 || mb_strlen($nome) > 120 ||
    ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) ||
    ($origem !== 'ia' && (strlen($telefone) < 10 || strlen($telefone) > 15)) ||
    !in_array($origem, ['consultor', 'vendedor', 'ia'], true) ||
    !preg_match('/^[a-f0-9-]{36}$/i', $clientId)
) {
    responder(['ok' => false, 'erro' => 'Os dados do contato são inválidos.'], 422);
}

// Dados da loja (pedido de proposta): nome, ramo, CNPJ, cidade, lojas físicas e produtos
$cnpj = trim((string)($lead['cnpj'] ?? ''));
if ($cnpj !== '' && !cnpjValid($cnpj)) {
    responder(['ok' => false, 'erro' => 'Confira o CNPJ informado.'], 422);
}
if ($origem === 'consultor' && mb_strlen(trim((string)($lead['loja'] ?? ''))) < 2) {
    responder(['ok' => false, 'erro' => 'Informe o nome da loja.'], 422);
}
if (isset($lead['lojas']) && (!is_numeric($lead['lojas']) || $lead['lojas'] < 0 || $lead['lojas'] > 50)) {
    responder(['ok' => false, 'erro' => 'Número de lojas físicas inválido.'], 422);
}
foreach (['loja' => 80, 'cidade' => 80, 'observacoes' => 500, 'ramo' => 20] as $campo => $max) {
    if (isset($lead[$campo])) $lead[$campo] = mb_substr(trim((string)$lead[$campo]), 0, $max);
}
$dados = json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
if (strlen($dados) > 262144) {
    responder(['ok' => false, 'erro' => 'O formulário excede o limite permitido.'], 413);
}

try {
    $db = getDb();
    $stmt = $db->prepare(
        'INSERT OR IGNORE INTO leads (client_id, origem, nome, email, whatsapp, dados) VALUES (:client_id, :origem, :nome, :email, :whatsapp, :dados)'
    );
    $stmt->execute([
        ':client_id' => $clientId,
        ':origem' => $origem,
        ':nome' => $nome,
        ':email' => $email !== '' ? $email : null,
        ':whatsapp' => $whatsapp,
        ':dados' => $dados,
    ]);
    responder(['ok' => true], 201);
} catch (Throwable $e) {
    error_log('Falha ao salvar contato WedTech: ' . $e->getMessage());
    responder(['ok' => false, 'erro' => 'Não foi possível salvar o contato.'], 500);
}