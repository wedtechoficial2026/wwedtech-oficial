<?php
// POST api/login.php - Autentica { email, senha } e abre a sessão do painel
require_once __DIR__ . '/_api.php';
exigir_metodo('POST');

$corpo = ler_corpo();
$res = attempt_login((string)($corpo['email'] ?? ''), (string)($corpo['senha'] ?? ''));

if (!$res['success']) {
    responder(['ok' => false, 'erro' => $res['message']], 401);
}

responder([
    'ok'       => true,
    'usuario'  => usuario_publico($res['user']),
    'redirect' => '../' . home_path_for($res['user']),
]);
