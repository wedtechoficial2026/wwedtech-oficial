<?php
// POST api/cadastro.php - Desativado: as contas das lojas são criadas pelo consultor WedTech
// (backend/consultor.php, createStore). Quem ainda não tem acesso fala com um consultor pelo site.
require_once __DIR__ . '/_api.php';

responder([
    'ok'   => false,
    'erro' => 'O cadastro é feito pelo seu consultor WedTech. Clique em "Falar com um consultor" e ele cria o seu acesso.',
], 403);
