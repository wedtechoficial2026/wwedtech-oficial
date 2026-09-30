<?php
require_once __DIR__ . '/../backend/app_state.php';

function expect(bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('PRAGMA foreign_keys = ON;');
createSchema($db);

$insertUser = $db->prepare('INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)');
$insertUser->execute(['Conta Um', 'um@example.test', 'hash']);
$userOne = (int)$db->lastInsertId();
$insertUser->execute(['Conta Dois', 'dois@example.test', 'hash']);
$userTwo = (int)$db->lastInsertId();

$firstData = ['produtos' => [['nome' => 'Camiseta', 'qtd' => 7]]];
$firstSave = saveAppState($db, $userOne, 'legacy', $firstData, 0);
expect(!$firstSave['conflict'] && $firstSave['revision'] === 1, 'A primeira gravação deve criar a revisão 1.');
expect(loadAppState($db, $userOne, 'legacy')['data'] === $firstData, 'A leitura deve retornar os dados gravados.');

$staleSave = saveAppState($db, $userOne, 'legacy', ['produtos' => []], 0);
expect($staleSave['conflict'] && $staleSave['state']['revision'] === 1, 'Uma revisão antiga deve gerar conflito.');

$updatedData = ['produtos' => [['nome' => 'Camiseta', 'qtd' => 6]]];
$updatedSave = saveAppState($db, $userOne, 'legacy', $updatedData, 1);
expect(!$updatedSave['conflict'] && $updatedSave['revision'] === 2, 'Uma gravação atual deve avançar a revisão.');
expect(loadAppState($db, $userOne, 'legacy')['data'] === $updatedData, 'A atualização deve substituir somente o estado da própria conta.');
expect(loadAppState($db, $userTwo, 'legacy') === null, 'Uma conta diferente não deve enxergar o estado.');
expect(loadAppState($db, $userOne, 'modular') === null, 'Os estados dos dois painéis devem ficar separados.');

$modularData = [
    'version' => 3,
    'tipo' => 'moda',
    'plan' => 'basico',
    'store' => ['name' => 'Loja Relacional', 'owner' => 'Conta Um', 'hasDeposito' => true],
    'shops' => [['id' => 'loja', 'name' => 'Loja principal', 'address' => 'Rua A', 'main' => true]],
    'suppliers' => [['id' => 'sup-1', 'name' => 'Fornecedor A', 'leadTimeDays' => 4, 'minOrder' => 100]],
    'connected' => ['loja', 'ml'],
    'channelPricing' => ['ml' => 10],
    'products' => [[
        'id' => 'p1', 'supplierId' => 'sup-1', 'name' => 'Camiseta', 'sku' => 'CAM-1',
        'barcode' => '7891234567890', 'category' => 'Roupas', 'description' => 'Algodão',
        'emoji' => '👕', 'price' => 59.9, 'cost' => 25, 'minStock' => 3, 'avgDaily' => 1.2,
        'shelf' => 'A1', 'shelfCap' => 10, 'channels' => ['loja', 'ml'],
        'stock' => ['loja' => 2, 'deposito' => 5],
        'variants' => [['id' => 'v-m', 'label' => 'M', 'sku' => 'CAM-1-M', 'barcode' => '', 'qty' => 4, 'weight' => 1]],
        'lots' => [['id' => 'L-1', 'code' => 'LOTE-1', 'qty' => 7, 'expiry' => 2000]],
        'lock' => null, 'issue' => false, 'shelfAlert' => false,
        'promo' => ['pct' => 10, 'channels' => ['site'], 'started' => 900, 'until' => 3000],
        'esl' => ['price' => 54.9, 'promoPct' => 10, 'outdated' => false, 'ts' => 1000],
    ]],
    'orders' => [[
        'id' => 'PED-1', 'channel' => 'ml', 'type' => 'entrega',
        'customer' => ['name' => 'Cliente', 'phone' => '11999990000', 'address' => 'Rua B, 2'],
        'items' => [['productId' => 'p1', 'variantId' => 'v-m', 'sku' => 'CAM-1-M', 'name' => 'Camiseta M', 'qty' => 1, 'price' => 59.9, 'source' => 'deposito', 'scanned' => false]],
        'total' => 59.9, 'shipping' => 0, 'status' => 'novo', 'ts' => 1000, 'marketplaceDemo' => 'mercado-livre',
        'returns' => [['id' => 'DEV-1', 'lines' => [['index' => 0, 'qty' => 1, 'name' => 'Camiseta M', 'back' => true]], 'value' => 59.9, 'reason' => 'Troca', 'refund' => 'vale', 'creditCode' => 'VALE-1', 'ts' => 1100]],
    ]],
    'purchaseOrders' => [],
    'invoices' => [['id' => 'NF-1', 'orderId' => 'PED-1', 'channel' => 'ml', 'key' => 'CHAVE', 'total' => 59.9, 'ts' => 1200, 'items' => [['name' => 'Camiseta M', 'sku' => 'CAM-1-M', 'qty' => 1, 'price' => 59.9]]]],
    'labels' => [['id' => 'ETQ-1', 'orderId' => 'PED-1', 'channel' => 'ml', 'trackingCode' => 'WT123', 'recipient' => 'Cliente · Rua B', 'weight' => 0.35, 'ts' => 1200]],
    'messages' => [['id' => 'MSG-1', 'orderId' => 'PED-1', 'to' => 'Cliente', 'phone' => '11999990000', 'text' => 'Pedido recebido', 'ts' => 1200]],
    'notifications' => [['id' => 'NT-1', 'type' => 'pedido', 'text' => 'Pedido novo', 'route' => 'pedidos', 'read' => false, 'ts' => 1200]],
    'automationLog' => [['id' => 'AUT-1', 'rule' => 'aviso', 'text' => 'Estoque baixo', 'ts' => 1200]],
    'scanLog' => [['id' => 'SC-1', 'type' => 'entrada', 'sku' => 'CAM-1', 'product' => 'Camiseta', 'location' => 'Depósito', 'ts' => 1200]],
    'expenses' => [['id' => 'DES-1', 'category' => 'Aluguel', 'description' => 'Aluguel mensal', 'amount' => 80, 'date' => 'Hoje', 'ts' => 1200]],
    'losses' => [['id' => 'PER-1', 'productId' => 'p1', 'reason' => 'Avaria', 'qty' => 1, 'value' => 25, 'ts' => 1200]],
    'credits' => [['code' => 'VALE-1', 'customer' => 'Cliente', 'orderId' => 'PED-1', 'value' => 59.9, 'balance' => 59.9, 'ts' => 1200]],
    'customEvents' => [['id' => 'EV-1', 'name' => 'Evento local', 'date' => '2026-12-01', 'mult' => 1.2, 'windowDays' => 3]],
    'eventReports' => [['id' => 'EVR-1', 'name' => 'Relatório sazonal', 'revenue' => 100]],
    'onboarding' => ['hidden' => false], 'automations' => ['avisarCliente' => true], 'seq' => ['order' => 1],
];
$modularSave = saveAppState($db, $userOne, 'modular', $modularData, 0);
expect(!$modularSave['conflict'] && $modularSave['revision'] === 1, 'A primeira gravação modular deve ser salva.');
$business = $db->query("SELECT id, nome FROM businesses WHERE owner_user_id = $userOne")->fetch();
expect($business['nome'] === 'Loja Relacional', 'A configuração da loja deve ter colunas próprias.');
$product = $db->query("SELECT id, sku, preco, estoque_minimo FROM products_rel WHERE business_id = {$business['id']}")->fetch();
expect($product['sku'] === 'CAM-1' && (float)$product['preco'] === 59.9 && (int)$product['estoque_minimo'] === 3, 'Produto deve ser gravado em colunas relacionais.');
$balanceQuery = $db->prepare('SELECT quantidade FROM stock_balances WHERE business_id=? AND product_id=? AND location_id=(SELECT id FROM store_locations WHERE business_id=? AND legacy_id=?)');
$balanceQuery->execute([$business['id'], $product['id'], $business['id'], 'deposito']);
expect((int)$balanceQuery->fetchColumn() === 5, 'Saldo do depósito deve ser uma linha por produto e local.');
expect((int)$db->query("SELECT COUNT(*) FROM inventory_movements WHERE business_id = {$business['id']} AND tipo='opening_balance'")->fetchColumn() === 2, 'Saldos iniciais devem gerar movimentos auditáveis.');
expect((int)$db->query("SELECT COUNT(*) FROM orders_rel WHERE business_id = {$business['id']} AND channel='ml'")->fetchColumn() === 1, 'Pedido deve ter canal, status e cliente em colunas próprias.');
expect((int)$db->query("SELECT COUNT(*) FROM order_items_rel WHERE business_id = {$business['id']} AND sku_snapshot='CAM-1-M'")->fetchColumn() === 1, 'Item deve manter snapshot de SKU e variação.');
expect((int)$db->query("SELECT COUNT(*) FROM stock_reservations WHERE business_id = {$business['id']} AND status='novo'")->fetchColumn() === 1, 'Pedido aberto deve ter uma reserva explícita.');
expect((int)$db->query("SELECT COUNT(*) FROM product_lots WHERE business_id = {$business['id']} AND codigo_lote='LOTE-1'")->fetchColumn() === 1, 'Lotes de estoque devem ser registros próprios.');
expect((int)$db->query("SELECT COUNT(*) FROM product_promotions WHERE business_id = {$business['id']} AND percentual=10")->fetchColumn() === 1, 'Promoções devem ter percentual e validade em tabela própria.');
expect((int)$db->query("SELECT COUNT(*) FROM electronic_labels WHERE business_id = {$business['id']}")->fetchColumn() === 1, 'Etiqueta eletrônica deve ter preço/estado em tabela própria.');
expect((int)$db->query("SELECT COUNT(*) FROM expenses_rel WHERE business_id = {$business['id']} AND categoria='Aluguel'")->fetchColumn() === 1, 'Despesas devem ter colunas próprias.');
expect((int)$db->query("SELECT COUNT(*) FROM invoices_rel WHERE business_id = {$business['id']} AND chave='CHAVE'")->fetchColumn() === 1, 'Notas devem ter chave/valor em tabela própria.');
expect((int)$db->query("SELECT COUNT(*) FROM invoice_items_rel WHERE business_id = {$business['id']}")->fetchColumn() === 1, 'Itens da nota devem ter tabela filha.');
expect((int)$db->query("SELECT COUNT(*) FROM customer_messages WHERE business_id = {$business['id']}")->fetchColumn() === 1, 'Mensagens devem ser registros próprios.');
expect((int)$db->query("SELECT COUNT(*) FROM business_notifications WHERE business_id = {$business['id']}")->fetchColumn() === 1, 'Notificações devem ser registros próprios.');
expect((int)$db->query("SELECT COUNT(*) FROM automation_logs WHERE business_id = {$business['id']}")->fetchColumn() === 1, 'Logs de automação devem ser registros próprios.');
expect((int)$db->query("SELECT COUNT(*) FROM order_returns WHERE business_id = {$business['id']}")->fetchColumn() === 1, 'Devoluções devem ser registros próprios.');
expect((int)$db->query("SELECT COUNT(*) FROM businesses WHERE owner_user_id = $userTwo")->fetchColumn() === 0, 'A projeção relacional não pode misturar contas.');

$reloaded = loadAppState($db, $userOne, 'modular')['data'];
expect($reloaded['products'][0]['stock']['deposito'] === 5, 'O painel deve ler o saldo da tabela relacional.');
expect($reloaded['products'][0]['lots'][0]['code'] === 'LOTE-1', 'O painel deve ler lotes da tabela relacional.');
expect($reloaded['expenses'][0]['amount'] === 80.0, 'O painel deve ler despesas da tabela relacional.');
expect($reloaded['invoices'][0]['key'] === 'CHAVE', 'O painel deve ler notas da tabela relacional.');
expect($reloaded['orders'][0]['returns'][0]['id'] === 'DEV-1', 'O painel deve ler devoluções da tabela relacional.');

$modularData['products'][0]['stock']['deposito'] = 3;
$modularUpdate = saveAppState($db, $userOne, 'modular', $modularData, 1);
expect(!$modularUpdate['conflict'] && $modularUpdate['revision'] === 2, 'A revisão modular deve avançar junto das tabelas.');
$balanceQuery->execute([$business['id'], $product['id'], $business['id'], 'deposito']);
expect((int)$balanceQuery->fetchColumn() === 3, 'Alteração de estoque deve atualizar o saldo relacional.');
expect((int)$db->query("SELECT COUNT(*) FROM inventory_movements WHERE business_id = {$business['id']} AND tipo='snapshot_sync' AND quantidade=-2")->fetchColumn() === 1, 'Alteração de estoque deve registrar diferença e revisão de origem.');

// Fluxo real do painel: carregar, alterar e salvar de novo sem duplicar devoluções.
for ($round = 0; $round < 2; $round++) {
    $current = loadAppState($db, $userOne, 'modular');
    expect(count($current['data']['orders'][0]['returns']) === 1, 'Cada devolução deve ser carregada uma única vez.');
    $saveAgain = saveAppState($db, $userOne, 'modular', $current['data'], $current['revision']);
    expect(!$saveAgain['conflict'], 'Salvar o estado recarregado não pode falhar por devolução duplicada.');
}
// Cópia antiga do navegador com a devolução repetida ainda deve ser aceita, gravando uma só.
$current = loadAppState($db, $userOne, 'modular');
$staleCopy = $current['data'];
$staleCopy['orders'][0]['returns'][] = $staleCopy['orders'][0]['returns'][0];
expect(!saveAppState($db, $userOne, 'modular', $staleCopy, $current['revision'])['conflict'], 'Cópia com devolução repetida deve ser salva.');
expect(count(loadAppState($db, $userOne, 'modular')['data']['orders'][0]['returns']) === 1, 'A devolução repetida deve ser gravada uma única vez.');

echo "app_state_test: OK", PHP_EOL;