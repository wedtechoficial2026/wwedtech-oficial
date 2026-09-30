<?php
// GET api/sessao.php - Informa se há usuário logado
require_once __DIR__ . '/_api.php';
exigir_metodo('GET');

$usuario = get_logged_user();
responder([
    'logado'  => is_logged_in(),
    'usuario' => usuario_publico($usuario),
    'painel'  => home_path_for($usuario),
]);
