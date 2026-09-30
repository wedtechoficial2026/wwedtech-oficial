<?php
// POST api/logout.php - Encerra a sessão
require_once __DIR__ . '/_api.php';
exigir_metodo('POST');

logout();
responder(['ok' => true]);
