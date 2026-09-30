<?php
require_once __DIR__ . '/../backend/marketplace_storefront.php';

function assertMarketplace(bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function requestId(int $number): string {
    return sprintf('00000000-0000-4000-8000-%012d', $number);
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA foreign_keys = ON;');
createSchema($db);
$db->exec("INSERT INTO users (id, nome, email, senha) VALUES (1, 'Demonstração', 'admin@wedtech.com', 'hash')");

$state = [
    'version' => 3,
    'store' => ['name' => 'Loja Teste', 'tagline' => 'Produtos locais', 'hasDeposito' => true],
    'shops' => [['id' => 'loja', 'name' => 'Loja principal']],
    'connected' => ['loja', 'ml', 'amazon', 'shopee'],
    'products' => [[
        'id' => 'p1',
        'name' => 'Produto Teste',
        'sku' => 'TEST-001',
        'emoji' => '📦',
        'category' => 'Teste',
        'description' => 'Descrição de teste',
        'price' => 100,
        'stock' => ['loja' => 2, 'deposito' => 3],
        'channels' => ['ml', 'amazon', 'shopee'],
        'variants' => [],
        'lock' => null,
    ], [
        'id' => 'p2',
        'name' => 'Camisa com tamanho',
        'sku' => 'TEST-002',
        'emoji' => '👕',
        'category' => 'Teste',
        'description' => 'Produto com variações',
        'price' => 50,
        'stock' => ['loja' => 1, 'deposito' => 1],
        'channels' => ['ml', 'amazon', 'shopee'],
        'variantKind' => 'Tamanho',
        'variants' => [
            ['id' => 'v-p', 'label' => 'P', 'sku' => 'TEST-002-P', 'qty' => 1],
            ['id' => 'v-m', 'label' => 'M', 'sku' => 'TEST-002-M', 'qty' => 1],
        ],
        'lock' => null,
    ]],
    'channelPricing' => ['ml' => 10, 'amazon' => 0, 'shopee' => 0],
    'orders' => [],
    'notifications' => [],
    'seq' => ['order' => 1000, 'notif' => 0],
    'clock' => 0,
];
$payload = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
$insert = $db->prepare("INSERT INTO app_states (user_id, app_key, revision, payload) VALUES (1, 'modular', 1, ?)");
$insert->execute([$payload]);
$customer = ['name' => 'Cliente Exemplo', 'phone' => '(11) 99999-0000', 'address' => 'Rua de Teste, 123'];

$catalog = marketplaceCatalog($db, 1, 'mercado-livre');
$businessId = (int)$db->query('SELECT id FROM businesses WHERE owner_user_id = 1')->fetchColumn();
$balances = $db->query("SELECT sl.legacy_id, sb.quantidade FROM stock_balances sb JOIN store_locations sl ON sl.id=sb.location_id WHERE sb.business_id=$businessId AND sb.product_id=(SELECT id FROM products_rel WHERE business_id=$businessId AND legacy_id='p1') ORDER BY sl.legacy_id")->fetchAll(PDO::FETCH_KEY_PAIR);
assertMarketplace((int)($balances['loja'] ?? 0) === 2 && (int)($balances['deposito'] ?? 0) === 3, 'A projeção deve gravar estoque por cada local: ' . json_encode($balances));
$plainProduct = array_values(array_filter($catalog['products'], static fn(array $product): bool => $product['id'] === 'p1'))[0];
assertMarketplace(count($catalog['products']) === 2, 'O catálogo público deve conter apenas produtos disponíveis.');
assertMarketplace(abs($plainProduct['price'] - 110.9) < 0.001, 'O preço do canal deve ser calculado no servidor.');
assertMarketplace(!array_key_exists('cost', $plainProduct), 'O catálogo público não deve expor o custo.');

$ml = createMarketplaceOrder($db, 1, 'mercado-livre', [
    'request_id' => requestId(1),
    'customer' => $customer,
    'items' => [['product_id' => 'p1', 'quantity' => 2]],
], hash('sha256', 'test-client'));
assertMarketplace($ml['order_id'] === 'PED-1001' && abs($ml['total'] - 221.8) < 0.001, 'O pedido ML deve usar preço e sequência do servidor.');

$duplicate = createMarketplaceOrder($db, 1, 'mercado-livre', [
    'request_id' => requestId(1),
    'customer' => $customer,
    'items' => [['product_id' => 'p1', 'quantity' => 2]],
], hash('sha256', 'test-client'));
assertMarketplace($duplicate['duplicate'] && $duplicate['order_id'] === $ml['order_id'], 'Repetir uma chave deve retornar o pedido original.');

$amazon = createMarketplaceOrder($db, 1, 'amazon', [
    'request_id' => requestId(2),
    'customer' => $customer,
    'items' => [['product_id' => 'p1', 'quantity' => 1]],
], hash('sha256', 'test-client'));
$shopee = createMarketplaceOrder($db, 1, 'shopee', [
    'request_id' => requestId(3),
    'customer' => $customer,
    'items' => [['product_id' => 'p1', 'quantity' => 1]],
], hash('sha256', 'test-client'));
$variantOrder = createMarketplaceOrder($db, 1, 'amazon', [
    'request_id' => requestId(4),
    'customer' => $customer,
    'items' => [['product_id' => 'p2', 'variant_id' => 'v-p', 'quantity' => 1]],
], hash('sha256', 'test-client'));
assertMarketplace($amazon['order_id'] === 'PED-1002' && $shopee['order_id'] === 'PED-1003' && $variantOrder['order_id'] === 'PED-1004', 'Cada vitrine deve criar pedidos na sequência compartilhada.');

$stored = loadAppState($db, 1, 'modular');
assertMarketplace($stored['revision'] === 5, 'Cada checkout novo deve avançar a revisão do estado.');
assertMarketplace(count($stored['data']['orders']) === 4, 'A repetição idempotente não pode duplicar pedidos.');
assertMarketplace($stored['data']['orders'][0]['channel'] === 'amazon', 'O canal deve ser definido pela rota do servidor.');
assertMarketplace($stored['data']['orders'][3]['channel'] === 'ml', 'O pedido deve aparecer com o canal correto.');
assertMarketplace($stored['data']['orders'][0]['items'][0]['variantId'] === 'v-p', 'A variação selecionada deve ficar salva no pedido.');

try {
    createMarketplaceOrder($db, 1, 'amazon', [
        'request_id' => requestId(5),
        'customer' => $customer,
        'items' => [['product_id' => 'p1', 'quantity' => 20]],
    ], hash('sha256', 'test-client'));
    throw new RuntimeException('O checkout deveria rejeitar estoque insuficiente.');
} catch (DomainException $e) {
    assertMarketplace(str_contains($e->getMessage(), 'estoque insuficiente'), 'A mensagem deve explicar a falta de estoque.');
}

try {
    createMarketplaceOrder($db, 1, 'amazon', [
        'request_id' => requestId(6),
        'customer' => $customer,
        'items' => [['product_id' => 'p2', 'variant_id' => 'v-m', 'quantity' => 2]],
    ], hash('sha256', 'test-client'));
    throw new RuntimeException('O checkout deveria rejeitar estoque insuficiente da variação.');
} catch (DomainException $e) {
    assertMarketplace(str_contains($e->getMessage(), 'variação sem estoque'), 'A recusa deve identificar a variação sem estoque.');
}

$afterFailure = loadAppState($db, 1, 'modular');
assertMarketplace(count($afterFailure['data']['orders']) === 4, 'Um checkout recusado não pode alterar pedidos.');

// Painel recria os dados com contador atrasado: pedidos removidos saem das tabelas e o próximo número não repete.
$reset = $afterFailure['data'];
$reset['orders'] = array_values(array_filter($reset['orders'], static fn(array $order): bool => $order['id'] !== 'PED-1002'));
$reset['seq']['order'] = 1000;
$saved = saveAppState($db, 1, 'modular', $reset, $afterFailure['revision']);
assertMarketplace(empty($saved['conflict']), 'O painel deve conseguir salvar o estado recriado.');
$remaining = $db->query("SELECT legacy_id FROM orders_rel WHERE business_id=$businessId ORDER BY legacy_id")->fetchAll(PDO::FETCH_COLUMN);
assertMarketplace($remaining === ['PED-1001', 'PED-1003', 'PED-1004'], 'Pedidos removidos do painel devem sair das tabelas: ' . json_encode($remaining));
$afterReset = createMarketplaceOrder($db, 1, 'shopee', [
    'request_id' => requestId(7),
    'customer' => $customer,
    'items' => [['product_id' => 'p1', 'quantity' => 1]],
], hash('sha256', 'test-client'));
assertMarketplace($afterReset['order_id'] === 'PED-1005', 'O próximo pedido deve continuar após o maior número existente: ' . $afterReset['order_id']);

// Status para o comprador: só responde a chaves do próprio canal e reflete mudanças feitas no painel.
$tracking = marketplaceOrderStatus($db, 1, 'shopee', [requestId(7), requestId(1), 'chave-invalida']);
assertMarketplace(count($tracking) === 1 && $tracking[0]['order_id'] === 'PED-1005' && $tracking[0]['status_label'] === 'Pedido recebido', 'A consulta deve devolver só os pedidos do canal: ' . json_encode($tracking));
assertMarketplace(!array_key_exists('customer', $tracking[0]), 'A consulta não deve expor dados do cliente.');
$panel = loadAppState($db, 1, 'modular');
foreach ($panel['data']['orders'] as &$panelOrder) {
    if ($panelOrder['id'] === 'PED-1005') $panelOrder['status'] = 'enviado';
}
unset($panelOrder);
saveAppState($db, 1, 'modular', $panel['data'], $panel['revision']);
$tracking = marketplaceOrderStatus($db, 1, 'shopee', [requestId(7)]);
assertMarketplace($tracking[0]['status_label'] === 'Enviado', 'O status alterado no painel deve aparecer na vitrine.');

// Devolução aberta pelo comprador: só depois da entrega, dentro do prazo e uma de cada vez.
try {
    marketplaceRequestReturn($db, 1, 'shopee', ['request_id' => requestId(3), 'reason' => 'arrependimento']);
    throw new RuntimeException('Pedido não entregue não pode ser devolvido.');
} catch (DomainException $e) {
    assertMarketplace(str_contains($e->getMessage(), 'depois que o pedido for entregue'), 'A recusa deve explicar que o pedido não foi entregue: ' . $e->getMessage());
}
$devolucao = marketplaceRequestReturn($db, 1, 'shopee', ['request_id' => requestId(7), 'reason' => 'arrependimento']);
assertMarketplace(str_starts_with($devolucao['id'], 'DV-') && str_starts_with($devolucao['reverse_code'], 'LR-'), 'A devolução deve ser aprovada com código de postagem.');
$afterReturn = loadAppState($db, 1, 'modular')['data'];
assertMarketplace($afterReturn['returnRequests'][0]['status'] === 'aprovada' && $afterReturn['returnRequests'][0]['orderId'] === 'PED-1005', 'A solicitação deve chegar ao painel já aprovada pelo marketplace.');
$tracking = marketplaceOrderStatus($db, 1, 'shopee', [requestId(7)]);
assertMarketplace($tracking[0]['return']['id'] === $devolucao['id'] && $tracking[0]['can_return'] === false, 'A vitrine deve mostrar a devolução em andamento e esconder o botão.');
try {
    marketplaceRequestReturn($db, 1, 'shopee', ['request_id' => requestId(7), 'reason' => 'defeito']);
    throw new RuntimeException('Não pode abrir duas devoluções do mesmo pedido ao mesmo tempo.');
} catch (DomainException $e) {
    assertMarketplace(str_contains($e->getMessage(), 'em andamento'), 'A segunda devolução deve ser recusada.');
}
try {
    marketplaceRequestReturn($db, 1, 'mercado-livre', ['request_id' => requestId(7), 'reason' => 'arrependimento']);
    throw new RuntimeException('A chave de outro canal não pode abrir devolução.');
} catch (DomainException $e) {
    assertMarketplace(str_contains($e->getMessage(), 'não encontrado'), 'Outro canal não enxerga o pedido.');
}
// Fora dos 7 dias o arrependimento é recusado, mas defeito (garantia de 90 dias) ainda vale
$old = loadAppState($db, 1, 'modular');
foreach ($old['data']['orders'] as &$oldOrder) {
    if ($oldOrder['id'] === 'PED-1001') { $oldOrder['status'] = 'enviado'; $oldOrder['ts'] -= 10 * 86400000; }
}
unset($oldOrder);
saveAppState($db, 1, 'modular', $old['data'], $old['revision']);
try {
    marketplaceRequestReturn($db, 1, 'mercado-livre', ['request_id' => requestId(1), 'reason' => 'arrependimento']);
    throw new RuntimeException('Arrependimento fora de 7 dias deve ser recusado.');
} catch (DomainException $e) {
    assertMarketplace(str_contains($e->getMessage(), 'CDC art. 49'), 'A recusa deve citar o prazo de arrependimento: ' . $e->getMessage());
}
$defeito = marketplaceRequestReturn($db, 1, 'mercado-livre', ['request_id' => requestId(1), 'reason' => 'defeito']);
assertMarketplace(str_starts_with($defeito['id'], 'DV-'), 'Defeito dentro da garantia legal deve ser aceito.');

// Vitrine obedece ao painel: produto despublicado some e canal desconectado não vende.
$panel = loadAppState($db, 1, 'modular');
foreach ($panel['data']['products'] as &$panelProduct) { if ($panelProduct['id'] === 'p2') $panelProduct['channels'] = ['loja', 'ml', 'shopee']; } unset($panelProduct);
$panel['data']['connected'] = ['loja', 'ml', 'shopee'];
saveAppState($db, 1, 'modular', $panel['data'], $panel['revision']);
$mlCatalog = marketplaceCatalog($db, 1, 'mercado-livre');
assertMarketplace($mlCatalog['connected'] && count($mlCatalog['products']) === 2, 'Canal conectado continua exibindo seus produtos.');
$amazonCatalog = marketplaceCatalog($db, 1, 'amazon');
assertMarketplace(!$amazonCatalog['connected'] && $amazonCatalog['products'] === [], 'Canal desconectado não deve exibir produtos.');
try {
    createMarketplaceOrder($db, 1, 'amazon', [
        'request_id' => requestId(8),
        'customer' => $customer,
        'items' => [['product_id' => 'p1', 'quantity' => 1]],
    ], hash('sha256', 'test-client-2'));
    throw new RuntimeException('O checkout deveria recusar canal desconectado.');
} catch (DomainException $e) {
    assertMarketplace(str_contains($e->getMessage(), 'não está vendendo'), 'A recusa deve explicar que o canal está desligado.');
}
$panel = loadAppState($db, 1, 'modular');
foreach ($panel['data']['products'] as &$panelProduct) { if ($panelProduct['id'] === 'p2') $panelProduct['channels'] = ['loja', 'shopee']; } unset($panelProduct);
saveAppState($db, 1, 'modular', $panel['data'], $panel['revision']);
$mlCatalog = marketplaceCatalog($db, 1, 'mercado-livre');
assertMarketplace(array_column($mlCatalog['products'], 'id') === ['p1'], 'Produto despublicado do canal deve sumir da vitrine.');
echo "marketplace_checkout_test: OK", PHP_EOL;
