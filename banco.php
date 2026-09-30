<?php
// banco.php - Gerenciador Web do Banco de Dados SQLite (Estilo phpMyAdmin via Adminer)
error_reporting(E_ALL & ~E_WARNING & ~E_NOTICE & ~E_DEPRECATED);

// Ferramenta de desenvolvimento: abre o banco inteiro sem senha, então só responde para quem
// está no próprio computador do servidor. Em qualquer outro endereço, a página não existe.
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(404);
    exit('Página não encontrada.');
}
function adminer_object() {
    class AdminerCustom extends Adminer {
        function name() {
            return 'WedTech · Gerenciador de Banco de Dados';
        }
        function credentials() {
            return ['localhost', '', ''];
        }
        function database() {
            return 'database.sqlite';
        }
        function login($login, $password) {
            return true;
        }
        function databases($flush = true) {
            return ['database.sqlite'];
        }
    }
    return new AdminerCustom;
}

// Redireciona diretamente para o banco SQLite do projeto
if (!isset($_GET['sqlite']) && !isset($_GET['file'])) {
    header('Location: banco.php?sqlite=&username=&db=database.sqlite');
    exit;
}

include __DIR__ . '/vendor/php/adminer.php';
