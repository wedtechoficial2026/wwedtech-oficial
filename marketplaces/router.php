<?php
$siteRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
$projectRoot = realpath(dirname(__DIR__));
if (!$siteRoot || !$projectRoot || !in_array(basename($siteRoot), ['mercado-livre', 'amazon', 'shopee'], true)) {
    http_response_code(500);
    exit('Vitrine nao configurada.');
}

$requestPath = rawurldecode((string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'));
if (str_contains($requestPath, "\0") || preg_match('~(^|/)\.\.(/|$)~', $requestPath)) {
    http_response_code(400);
    exit('Caminho invalido.');
}

if ($requestPath === '/' || $requestPath === '/index.php') {
    require $siteRoot . DIRECTORY_SEPARATOR . 'index.php';
    exit;
}

if ($requestPath === '/api/marketplace.php') {
    require $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'marketplace.php';
    exit;
}

if (str_starts_with($requestPath, '/frontend/')) {
    $relativePath = substr($requestPath, 1);
    $filePath = realpath($projectRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath));
    $frontendRoot = realpath($projectRoot . DIRECTORY_SEPARATOR . 'frontend');
    if (!$filePath || !$frontendRoot || !str_starts_with($filePath, $frontendRoot . DIRECTORY_SEPARATOR) || !is_file($filePath)) {
        http_response_code(404);
        exit('Recurso nao encontrado.');
    }

    $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $contentTypes = [
        'css' => 'text/css; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
    ];
    header('Content-Type: ' . ($contentTypes[$extension] ?? 'application/octet-stream'));
    header('Cache-Control: no-cache');
    readfile($filePath);
    exit;
}

http_response_code(404);
exit('Rota nao encontrada.');
