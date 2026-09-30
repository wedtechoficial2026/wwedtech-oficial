<?php
require_once __DIR__ . '/_api.php';
require_once __DIR__ . '/../backend/marketplace_storefront.php';

$db = getDb();
$platform = strtolower(trim((string)($_GET['platform'] ?? '')));
if (!isset(MARKETPLACE_DEMOS[$platform])) {
    responder(['ok' => false, 'erro' => 'Marketplace de demonstração inválido.'], 404);
}

try {
    $ownerId = marketplaceDemoOwner($db);
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['pedidos'])) {
        responder(['ok' => true, 'pedidos' => marketplaceOrderStatus($db, $ownerId, $platform, explode(',', (string)$_GET['pedidos']))]);
    }
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        responder(['ok' => true, 'catalog' => marketplaceCatalog($db, $ownerId, $platform)]);
    }
    exigir_metodo('POST');

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST);
        $requestHost = explode(':', (string)($_SERVER['HTTP_HOST'] ?? ''))[0];
        if (!is_string($originHost) || !hash_equals(strtolower($requestHost), strtolower($originHost))) {
            responder(['ok' => false, 'erro' => 'Origem da solicitação inválida.'], 403);
        }
    }

    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === false) {
        responder(['ok' => false, 'erro' => 'O checkout aceita apenas solicitações JSON.'], 415);
    }
    $rawBody = file_get_contents('php://input');
    if (strlen($rawBody) > 32768) {
        responder(['ok' => false, 'erro' => 'A solicitação excede o limite permitido.'], 413);
    }
    $input = json_decode($rawBody, true);
    if (!is_array($input)) {
        responder(['ok' => false, 'erro' => 'O corpo JSON da solicitação é inválido.'], 400);
    }

    if (($_GET['acao'] ?? '') === 'devolucao') {
        responder(['ok' => true, 'devolucao' => marketplaceRequestReturn($db, $ownerId, $platform, $input)], 201);
    }

    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $ipHash = hash_hmac('sha256', $ip, (string)($_SERVER['SERVER_NAME'] ?? 'wedtech-local'));
    $result = createMarketplaceOrder($db, $ownerId, $platform, $input, $ipHash);
    responder(['ok' => true, 'pedido' => $result], $result['duplicate'] ? 200 : 201);
} catch (InvalidArgumentException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 422);
} catch (DomainException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 409);
} catch (OverflowException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 429);
} catch (RuntimeException $e) {
    responder(['ok' => false, 'erro' => $e->getMessage()], 503);
} catch (Throwable $e) {
    error_log('Falha no checkout de demonstração: ' . $e->getMessage());
    responder(['ok' => false, 'erro' => 'Não foi possível concluir o pedido. Tente novamente.'], 500);
}