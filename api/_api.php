<?php
// api/_api.php - Base comum da API JSON (usada pela homepage)
require_once __DIR__ . '/../auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder(array $dados, int $status = 200): void {
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function exigir_metodo(string $metodo): void {
    if ($_SERVER['REQUEST_METHOD'] !== $metodo) {
        header('Allow: ' . $metodo);
        responder(['ok' => false, 'erro' => 'Método não permitido.'], 405);
    }
}

// Aceita JSON (fetch) ou formulário comum
function ler_corpo(): array {
    $tipo = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($tipo, 'application/json') !== false) {
        $dados = json_decode(file_get_contents('php://input'), true);
        return is_array($dados) ? $dados : [];
    }
    return $_POST;
}

function usuario_publico(?array $u): ?array {
    if (!$u) return null;
    return ['nome' => $u['nome'], 'email' => $u['email'], 'cargo' => $u['cargo'], 'papel' => $u['papel'] ?? 'lojista'];
}
