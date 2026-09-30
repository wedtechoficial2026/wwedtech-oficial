<?php

require_once __DIR__ . '/app_state.php';

const MARKETPLACE_DEMOS = [
    'mercado-livre' => ['channel' => 'ml', 'name' => 'Mercado Livre'],
    'amazon' => ['channel' => 'amazon', 'name' => 'Amazon'],
    'shopee' => ['channel' => 'shopee', 'name' => 'Shopee'],
];

function marketplaceDemoOwner(PDO $db): int {
    $email = getenv('WEDTECH_MARKETPLACE_DEMO_EMAIL') ?: 'admin@wedtech.com';
    $stmt = $db->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1');
    $stmt->execute([':email' => $email]);
    $userId = $stmt->fetchColumn();
    if (!$userId) {
        throw new RuntimeException('A conta proprietária das vitrines de demonstração não está configurada.');
    }
    return (int)$userId;
}

function marketplaceState(PDO $db, int $userId): array {
    $saved = loadAppState($db, $userId, 'modular');
    if (!$saved || ($saved['data']['version'] ?? null) !== 3) {
        throw new RuntimeException('A conta da demonstração ainda não inicializou o painel modular. Entre no painel uma vez e tente novamente.');
    }
    syncModularTables($db, $userId, $saved['data'], $saved['revision']);
    return $saved;
}

// A vitrine só vende se o canal estiver conectado no painel e o produto publicado nele.
function marketplaceConnected(array $state, string $channel): bool {
    return in_array($channel, $state['connected'] ?? [], true);
}

function marketplaceListed(array $product, string $channel): bool {
    return in_array($channel, $product['channels'] ?? [], true);
}

function marketplaceReserved(array $state, string $productId, ?string $variantId = null): int {
    $reserved = 0;
    foreach ($state['orders'] ?? [] as $order) {
        if (!in_array($order['status'] ?? '', ['novo', 'separando', 'pronto', 'separado'], true)) {
            continue;
        }
        foreach ($order['items'] ?? [] as $item) {
            if (($item['productId'] ?? null) === $productId && ($variantId === null || ($item['variantId'] ?? null) === $variantId)) {
                $reserved += (int)($item['qty'] ?? 0);
            }
        }
    }
    return $reserved;
}

function marketplacePrice(array $state, array $product, string $channel): float {
    $price = (float)($product['price'] ?? 0);
    $markup = (float)($state['channelPricing'][$channel] ?? 0);
    if ($markup) {
        $price = max(0.9, ceil($price * (1 + $markup / 100)) - 0.1);
    }
    $promo = $product['promo'] ?? null;
    if (is_array($promo) && (int)($promo['until'] ?? 0) > (int)round(microtime(true) * 1000) && in_array($channel, $promo['channels'] ?? [], true)) {
        $price = max(0.9, ceil($price * (1 - ((float)$promo['pct'] / 100))) - 0.1);
    }
    return round($price, 2);
}

function marketplaceCatalog(PDO $db, int $userId, string $platform): array {
    $demo = MARKETPLACE_DEMOS[$platform] ?? null;
    if (!$demo) {
        throw new InvalidArgumentException('Marketplace de demonstração inválido.');
    }
    $state = marketplaceState($db, $userId)['data'];
    $channel = $demo['channel'];
    $connected = marketplaceConnected($state, $channel);
    $products = [];

    foreach ($connected ? $state['products'] ?? [] : [] as $product) {
        if (!empty($product['lock']) || !marketplaceListed($product, $channel)) {
            continue;
        }

        $reserved = marketplaceReserved($state, (string)$product['id']);
        $stock = 0;
        foreach ($product['stock'] ?? [] as $quantity) {
            $stock += max(0, (int)$quantity);
        }
        $available = max(0, $stock - $reserved);
        if ($available < 1) {
            continue;
        }

        $variants = [];
        foreach ($product['variants'] ?? [] as $variant) {
            $variantAvailable = max(0, (int)($variant['qty'] ?? 0) - marketplaceReserved($state, (string)$product['id'], (string)$variant['id']));
            if ($variantAvailable > 0) {
                $variants[] = [
                    'id' => (string)$variant['id'],
                    'label' => (string)$variant['label'],
                    'sku' => (string)($variant['sku'] ?? ''),
                    'stock' => $variantAvailable,
                ];
            }
        }

        $products[] = [
            'id' => (string)$product['id'],
            'name' => (string)$product['name'],
            'sku' => (string)($product['sku'] ?? ''),
            'emoji' => (string)($product['emoji'] ?? '📦'),
            'category' => (string)($product['category'] ?? 'Produtos'),
            'description' => (string)($product['description'] ?? ''),
            'price' => marketplacePrice($state, $product, $channel),
            'stock' => $available,
            'variantKind' => (string)($product['variantKind'] ?? ''),
            'variants' => $variants,
        ];
    }

    return [
        'platform' => $platform,
        'marketplace' => $demo['name'],
        'connected' => $connected,
        'store' => [
            'name' => (string)($state['store']['name'] ?? $demo['name'] . ' Demo'),
            'tagline' => (string)($state['store']['tagline'] ?? ''),
        ],
        'products' => $products,
    ];
}

function createMarketplaceOrder(PDO $db, int $userId, string $platform, array $input, string $ipHash): array {
    $demo = MARKETPLACE_DEMOS[$platform] ?? null;
    if (!$demo) {
        throw new InvalidArgumentException('Marketplace de demonstração inválido.');
    }

    $requestId = strtolower(trim((string)($input['request_id'] ?? '')));
    if (!preg_match('/^[a-f0-9-]{36}$/', $requestId)) {
        throw new InvalidArgumentException('Identificador do pedido inválido.');
    }

    $name = trim((string)($input['customer']['name'] ?? ''));
    $phone = trim((string)($input['customer']['phone'] ?? ''));
    $address = trim((string)($input['customer']['address'] ?? ''));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 100) {
        throw new InvalidArgumentException('Informe um nome entre 2 e 100 caracteres.');
    }
    $phoneDigits = preg_replace('/\D/', '', $phone);
    if (strlen($phoneDigits) < 10 || strlen($phoneDigits) > 15 || mb_strlen($phone) > 24) {
        throw new InvalidArgumentException('Informe um telefone válido com DDD.');
    }
    if (mb_strlen($address) < 5 || mb_strlen($address) > 180) {
        throw new InvalidArgumentException('Informe um endereço de entrega válido.');
    }

    $items = $input['items'] ?? null;
    if (!is_array($items) || count($items) < 1 || count($items) > 20) {
        throw new InvalidArgumentException('O carrinho precisa ter entre 1 e 20 itens.');
    }
    $normalizedItems = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            throw new InvalidArgumentException('Item de carrinho inválido.');
        }
        $productId = (string)($item['product_id'] ?? '');
        $variantId = isset($item['variant_id']) && $item['variant_id'] !== '' ? (string)$item['variant_id'] : null;
        $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT);
        if (!preg_match('/^p[1-9][0-9]*$/', $productId) || $quantity === false || $quantity < 1 || $quantity > 20) {
            throw new InvalidArgumentException('Produto ou quantidade inválida.');
        }
        $key = $productId . '|' . ($variantId ?? '');
        $normalizedItems[$key] = ($normalizedItems[$key] ?? ['product_id' => $productId, 'variant_id' => $variantId, 'quantity' => 0]);
        $normalizedItems[$key]['quantity'] += $quantity;
        if ($normalizedItems[$key]['quantity'] > 20) {
            throw new InvalidArgumentException('A quantidade máxima por produto é 20.');
        }
    }

    $db->exec('BEGIN IMMEDIATE TRANSACTION');
    try {
        $existing = $db->prepare('SELECT user_id, channel, order_id FROM marketplace_order_requests WHERE request_id = :request_id');
        $existing->execute([':request_id' => $requestId]);
        $existingRequest = $existing->fetch();
        if ($existingRequest) {
            $db->exec('COMMIT');
            if ((int)$existingRequest['user_id'] !== $userId || $existingRequest['channel'] !== $demo['channel']) {
                throw new DomainException('A chave do pedido já foi usada em outro canal. Atualize a página e tente novamente.');
            }
            return ['order_id' => (string)$existingRequest['order_id'], 'duplicate' => true];
        }
        $db->exec('COMMIT');

        $db->exec('BEGIN IMMEDIATE TRANSACTION');
        $limits = $db->prepare('SELECT COUNT(*) FROM marketplace_request_limits WHERE ip_hash = :ip_hash AND criado_em >= :since');
        $limits->execute([':ip_hash' => $ipHash, ':since' => time() - 60]);
        if ((int)$limits->fetchColumn() >= 8) {
            throw new OverflowException('Muitas tentativas. Aguarde um minuto e tente novamente.');
        }
        $insertLimit = $db->prepare('INSERT INTO marketplace_request_limits (ip_hash, criado_em) VALUES (:ip_hash, :now)');
        $insertLimit->execute([':ip_hash' => $ipHash, ':now' => time()]);
        $db->exec('DELETE FROM marketplace_request_limits WHERE criado_em < ' . (time() - 3600));
        $db->exec('COMMIT');

        $db->exec('BEGIN IMMEDIATE TRANSACTION');
        $existing->execute([':request_id' => $requestId]);
        $existingRequest = $existing->fetch();
        if ($existingRequest) {
            $db->exec('COMMIT');
            if ((int)$existingRequest['user_id'] !== $userId || $existingRequest['channel'] !== $demo['channel']) {
                throw new DomainException('A chave do pedido já foi usada em outro canal. Atualize a página e tente novamente.');
            }
            return ['order_id' => (string)$existingRequest['order_id'], 'duplicate' => true];
        }

        $saved = loadAppState($db, $userId, 'modular');
        if (!$saved || ($saved['data']['version'] ?? null) !== 3) {
            throw new RuntimeException('A conta da demonstração ainda não inicializou o painel modular.');
        }
        $state = $saved['data'];
        $channel = $demo['channel'];
        if (!marketplaceConnected($state, $channel)) {
            throw new DomainException('Esta loja não está vendendo no ' . $demo['name'] . ' no momento.');
        }
        $openStatuses =['novo', 'separando', 'pronto', 'separado'];
        $locationIds = array_map(static fn(array $shop): string => (string)$shop['id'], $state['shops'] ?? [['id' => 'loja']]);
        if (!in_array('loja', $locationIds, true)) {
            $locationIds[] = 'loja';
        }
        $lines = [];

        foreach ($normalizedItems as $item) {
            $product = null;
            foreach ($state['products'] ?? [] as $candidate) {
                if (($candidate['id'] ?? null) === $item['product_id']) {
                    $product = $candidate;
                    break;
                }
            }
            if (!$product || !empty($product['lock']) || !marketplaceListed($product, $channel)) {
                throw new DomainException('Um produto do carrinho não está disponível neste canal.');
            }

            $variant = null;
            $variantId = $item['variant_id'];
            if (!empty($product['variants'])) {
                foreach ($product['variants'] as $candidate) {
                    if ($variantId !== null && ($candidate['id'] ?? null) === $variantId) {
                        $variant = $candidate;
                        break;
                    }
                }
                if (!$variant && $variantId === null) {
                    foreach ($product['variants'] as $candidate) {
                        $available = max(0, (int)($candidate['qty'] ?? 0) - marketplaceReserved($state, $item['product_id'], (string)$candidate['id']));
                        if ($available >= $item['quantity'] && (!$variant || $available > $variant['qty'])) {
                            $variant = $candidate;
                        }
                    }
                }
                if (!$variant) {
                    throw new DomainException('Selecione uma variação disponível para ' . (string)$product['name'] . '.');
                }
                $variantAvailable = max(0, (int)($variant['qty'] ?? 0) - marketplaceReserved($state, $item['product_id'], (string)$variant['id']));
                if ($variantAvailable < $item['quantity']) {
                    throw new DomainException((string)$product['name'] . ': variação sem estoque suficiente.');
                }
            } elseif ($variantId !== null) {
                throw new DomainException('Variação inválida para ' . (string)$product['name'] . '.');
            }

            $reservedByLocation = [];
            foreach ($state['orders'] ?? [] as $order) {
                if (!in_array($order['status'] ?? '', $openStatuses, true)) continue;
                foreach ($order['items'] ?? [] as $reservedItem) {
                    if (($reservedItem['productId'] ?? null) === $item['product_id']) {
                        $source = (string)($reservedItem['source'] ?? 'loja');
                        $reservedByLocation[$source] = ($reservedByLocation[$source] ?? 0) + (int)($reservedItem['qty'] ?? 0);
                    }
                }
            }

            $availableByLocation = [];
            foreach (['deposito', ...$locationIds] as $locationId) {
                if (isset($availableByLocation[$locationId])) continue;
                $locationStock = (int)($product['stock'][$locationId] ?? 0);
                $locationReserved = (int)($reservedByLocation[$locationId] ?? 0);
                $availableByLocation[$locationId] = max(0, $locationStock - $locationReserved);
            }
            $availableTotal = array_sum($availableByLocation);
            if ($availableTotal < $item['quantity']) {
                throw new DomainException((string)$product['name'] . ': estoque insuficiente. Disponível: ' . $availableTotal . '.');
            }

            $parts = [];
            $remaining = $item['quantity'];
            foreach (['deposito', 'loja', ...array_values(array_diff($locationIds, ['loja']))] as $locationId) {
                $take = min((int)($availableByLocation[$locationId] ?? 0), $remaining);
                if ($take > 0) {
                    $parts[] = ['source' => $locationId, 'quantity' => $take];
                    $remaining -= $take;
                }
                if ($remaining === 0) break;
            }

            $unitPrice = marketplacePrice($state, $product, $channel);
            foreach ($parts as $part) {
                $lines[] = [
                    'productId' => $item['product_id'],
                    'variantId' => $variant['id'] ?? null,
                    'sku' => (string)($variant['sku'] ?? $product['sku'] ?? ''),
                    'name' => (string)$product['name'] . (!empty($variant['label']) ? ' · ' . $variant['label'] : ''),
                    'emoji' => (string)($product['emoji'] ?? '📦'),
                    'qty' => $part['quantity'],
                    'price' => $unitPrice,
                    'source' => $part['source'],
                    'scanned' => false,
                ];
            }
        }

        $timestamp = (int)round(microtime(true) * 1000) + (int)($state['clock'] ?? 0);
        $state = alignStateSequences($state);
        $sequence = (int)($state['seq']['order'] ?? 1000) + 1;
        $state['seq']['order'] = $sequence;
        $orderId = 'PED-' . $sequence;
        $total = round(array_reduce($lines, static fn(float $sum, array $line): float => $sum + $line['price'] * $line['qty'], 0.0), 2);
        $order = [
            'id' => $orderId,
            'channel' => $channel,
            'type' => 'entrega',
            'customer' => ['name' => $name, 'phone' => $phone, 'address' => $address],
            'items' => $lines,
            'total' => $total,
            'shipping' => 0,
            'status' => 'novo',
            'ts' => $timestamp,
            'marketplaceDemo' => $platform,
        ];
        array_unshift($state['orders'], $order);
        $notifSequence = (int)($state['seq']['notif'] ?? 0) + 1;
        $state['seq']['notif'] = $notifSequence;
        array_unshift($state['notifications'], [
            'id' => 'NT-' . $notifSequence,
            'type' => 'pedido',
            'text' => 'Novo pedido de demonstração no ' . $demo['name'] . ': ' . $orderId,
            'ts' => $timestamp,
            'read' => false,
            'route' => 'pedidos',
        ]);
        $state['notifications'] = array_slice($state['notifications'], 0, 40);

        $payload = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if (strlen($payload) > 4 * 1024 * 1024) {
            throw new LengthException('O estado da loja excede o limite de armazenamento.');
        }
        $revision = (int)$saved['revision'] + 1;
        $update = $db->prepare("UPDATE app_states SET revision = :revision, payload = :payload, atualizado_em = CURRENT_TIMESTAMP WHERE user_id = :user_id AND app_key = 'modular' AND revision = :previous_revision");
        $update->execute([
            ':revision' => $revision,
            ':payload' => $payload,
            ':user_id' => $userId,
            ':previous_revision' => (int)$saved['revision'],
        ]);
        if ($update->rowCount() !== 1) {
            throw new RuntimeException('A loja foi atualizada em outra operação. Atualize o catálogo e tente novamente.');
        }
        syncModularTables($db, $userId, $state, $revision, true);

        $saveRequest = $db->prepare('INSERT INTO marketplace_order_requests (request_id, user_id, channel, order_id) VALUES (:request_id, :user_id, :channel, :order_id)');
        $saveRequest->execute([':request_id' => $requestId, ':user_id' => $userId, ':channel' => $channel, ':order_id' => $orderId]);
        $db->exec('COMMIT');
        return ['order_id' => $orderId, 'total' => $total, 'duplicate' => false];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        } else {
            try { $db->exec('ROLLBACK'); } catch (Throwable) {}
        }
        throw $e;
    }
}
const MARKETPLACE_ORDER_STATUS = [
    'novo' => 'Pedido recebido',
    'separando' => 'Em separação',
    'separado' => 'Pronto para envio',
    'pronto' => 'Pronto para retirada',
    'enviado' => 'Enviado',
    'retirado' => 'Retirado',
    'concluido' => 'Entregue',
    'expirado' => 'Cancelado',
];

// Status dos pedidos para o comprador; a chave do checkout funciona como senha do pedido.
function marketplaceOrderStatus(PDO $db, int $userId, string $platform, array $requestIds): array {
    $demo = MARKETPLACE_DEMOS[$platform] ?? null;
    if (!$demo) {
        throw new InvalidArgumentException('Marketplace de demonstração inválido.');
    }
    $requestIds = array_values(array_unique(array_filter(
        array_map(static fn(mixed $id): string => strtolower(trim((string)$id)), $requestIds),
        static fn(string $id): bool => (bool)preg_match('/^[a-f0-9-]{36}$/', $id),
    )));
    if (!$requestIds || count($requestIds) > 20) {
        throw new InvalidArgumentException('Informe de 1 a 20 pedidos para consultar.');
    }

    $placeholders = implode(',', array_fill(0, count($requestIds), '?'));
    $lookup = $db->prepare("SELECT request_id, order_id FROM marketplace_order_requests WHERE user_id = ? AND channel = ? AND request_id IN ($placeholders)");
    $lookup->execute([$userId, $demo['channel'], ...$requestIds]);
    $orderIds = $lookup->fetchAll(PDO::FETCH_KEY_PAIR);
    if (!$orderIds) {
        return [];
    }

    $state = loadAppState($db, $userId, 'modular')['data'];
    $orders = [];
    foreach ($state['orders'] ?? [] as $order) {
        $orders[(string)$order['id']] = $order;
    }
    $nowMs = (int)round(microtime(true) * 1000) + (int)($state['clock'] ?? 0);

    $result = [];
    foreach ($orderIds as $requestId => $orderId) {
        $order = $orders[$orderId] ?? null;
        $status = $order ? (string)($order['status'] ?? 'novo') : 'cancelado';
        $return = $order ? marketplaceLatestReturn($state, $orderId) : null;
        $result[] = [
            'return' => $return ? [
                'id' => (string)$return['id'],
                'status' => (string)$return['status'],
                'status_label' => MARKETPLACE_RETURN_STATUS[$return['status']] ?? 'Em andamento',
                'reverse_code' => (string)($return['reverseCode'] ?? ''),
            ] : null,
            'can_return' => $order !== null && marketplaceCanReturn($state, $order, $nowMs),
            'request_id' => $requestId,
            'order_id' => $orderId,
            'status' => $status,
            'status_label' => MARKETPLACE_ORDER_STATUS[$status] ?? 'Cancelado pela loja',
            'total' => $order ? (float)($order['total'] ?? 0) : 0.0,
            'ts' => $order ? (int)($order['ts'] ?? 0) : 0,
            'items' => $order ? array_map(static fn(array $item): array => ['name' => (string)($item['name'] ?? 'Produto'), 'qty' => (int)($item['qty'] ?? 1)], $order['items'] ?? []) : [],
        ];
    }
    return $result;
}

// ---------------------------------------------------------------------------
// Devolução aberta pelo comprador na vitrine, como nos marketplaces reais: dentro do prazo
// o marketplace aprova sozinho e gera o código de postagem (logística reversa). As regras
// espelham requestReturn() do painel (frontend/js/modulos/core/wedtech-core.js).
const MARKETPLACE_RETURN_REASONS = [
    'arrependimento' => 'Desistiu da compra',
    'troca' => 'Quer trocar tamanho ou modelo',
    'defeito' => 'Produto com defeito',
    'errado' => 'Chegou produto errado ou diferente',
];
const MARKETPLACE_RETURN_STATUS = [
    'aberta' => 'Em análise',
    'aprovada' => 'Aprovada · poste o produto com o código',
    'recebida' => 'Produto recebido pela loja',
    'contestada' => 'Em análise pelo marketplace',
    'concluida' => 'Devolução concluída',
    'recusada' => 'Recusada',
];
const MARKETPLACE_RETURN_OPEN = ['aberta', 'aprovada', 'recebida', 'contestada'];
const MARKETPLACE_DELIVERED = ['retirado', 'enviado', 'concluido'];

function marketplaceLatestReturn(array $state, string $orderId): ?array {
    foreach ($state['returnRequests'] ?? [] as $request) {
        if (($request['orderId'] ?? null) === $orderId) {
            return $request;
        }
    }
    return null;
}

// Prazo contado desde a compra: arrependimento 7 dias (CDC art. 49); defeito 30/90 dias (CDC art. 26)
function marketplaceReturnWindow(array $state, array $order, string $reason, int $nowMs): array {
    $days = intdiv(max(0, $nowMs - (int)($order['ts'] ?? 0)), 86400000);
    $perishable = false;
    foreach ($order['items'] ?? [] as $item) {
        foreach ($state['products'] ?? [] as $product) {
            if (($product['id'] ?? null) === ($item['productId'] ?? null) && !empty($product['shelfLifeDays'])) {
                $perishable = true;
            }
        }
    }
    if ($reason === 'defeito' || $reason === 'errado') {
        $limit = $perishable ? 30 : 90;
        $rule = 'Garantia legal por defeito: ' . $limit . ' dias (CDC art. 26)';
    } else {
        $limit = 7;
        $rule = 'Direito de arrependimento em compras online: 7 dias (CDC art. 49)';
    }
    return ['days' => $days, 'limit' => $limit, 'within' => $days <= $limit, 'rule' => $rule];
}

// Unidades de cada item que ainda podem ser devolvidas (descontando devoluções feitas e em andamento)
function marketplaceReturnableLines(array $state, array $order): array {
    $lines = [];
    foreach ($order['items'] ?? [] as $index => $item) {
        $used = 0;
        foreach ($order['returns'] ?? [] as $done) {
            foreach ($done['lines'] ?? [] as $line) {
                if ((int)($line['index'] ?? -1) === $index) $used += (int)($line['qty'] ?? 0);
            }
        }
        foreach ($state['returnRequests'] ?? [] as $request) {
            if (($request['orderId'] ?? null) !== $order['id'] || !in_array($request['status'] ?? '', MARKETPLACE_RETURN_OPEN, true)) continue;
            foreach ($request['lines'] ?? [] as $line) {
                if ((int)($line['index'] ?? -1) === $index) $used += (int)($line['qty'] ?? 0);
            }
        }
        $left = (int)($item['qty'] ?? 0) - $used;
        if ($left > 0) {
            $lines[] = ['index' => $index, 'qty' => $left, 'name' => (string)($item['name'] ?? 'Produto'), 'price' => (float)($item['price'] ?? 0)];
        }
    }
    return $lines;
}

function marketplaceCanReturn(array $state, array $order, int $nowMs): bool {
    if (!in_array($order['status'] ?? '', MARKETPLACE_DELIVERED, true)) return false;
    $open = marketplaceLatestReturn($state, (string)$order['id']);
    if ($open && in_array($open['status'] ?? '', MARKETPLACE_RETURN_OPEN, true)) return false;
    if (!marketplaceReturnableLines($state, $order)) return false;
    return marketplaceReturnWindow($state, $order, 'defeito', $nowMs)['within'];
}

function marketplaceRequestReturn(PDO $db, int $userId, string $platform, array $input): array {
    $demo = MARKETPLACE_DEMOS[$platform] ?? null;
    if (!$demo) {
        throw new InvalidArgumentException('Marketplace de demonstração inválido.');
    }
    $requestId = strtolower(trim((string)($input['request_id'] ?? '')));
    if (!preg_match('/^[a-f0-9-]{36}$/', $requestId)) {
        throw new InvalidArgumentException('Pedido inválido.');
    }
    $reason = (string)($input['reason'] ?? '');
    if (!isset(MARKETPLACE_RETURN_REASONS[$reason])) {
        throw new InvalidArgumentException('Escolha o motivo da devolução.');
    }
    $note = mb_substr(trim((string)($input['note'] ?? '')), 0, 200);

    $db->exec('BEGIN IMMEDIATE TRANSACTION');
    try {
        $lookup = $db->prepare('SELECT order_id FROM marketplace_order_requests WHERE request_id = ? AND user_id = ? AND channel = ?');
        $lookup->execute([$requestId, $userId, $demo['channel']]);
        $orderId = $lookup->fetchColumn();
        if (!$orderId) {
            throw new DomainException('Pedido não encontrado.');
        }
        $saved = loadAppState($db, $userId, 'modular');
        $state = $saved['data'];
        $order = null;
        foreach ($state['orders'] ?? [] as $candidate) {
            if (($candidate['id'] ?? null) === $orderId) $order = $candidate;
        }
        if (!$order) {
            throw new DomainException('Este pedido foi cancelado pela loja.');
        }
        if (!in_array($order['status'] ?? '', MARKETPLACE_DELIVERED, true)) {
            throw new DomainException('A devolução fica disponível depois que o pedido for entregue.');
        }
        $open = marketplaceLatestReturn($state, (string)$orderId);
        if ($open && in_array($open['status'] ?? '', MARKETPLACE_RETURN_OPEN, true)) {
            throw new DomainException('Já existe uma devolução em andamento para este pedido.');
        }
        $nowMs = (int)round(microtime(true) * 1000) + (int)($state['clock'] ?? 0);
        $window = marketplaceReturnWindow($state, $order, $reason, $nowMs);
        if (!$window['within']) {
            throw new DomainException('O prazo para devolução terminou. ' . $window['rule'] . '.');
        }
        $lines = marketplaceReturnableLines($state, $order);
        if (!$lines) {
            throw new DomainException('Todos os itens deste pedido já foram devolvidos.');
        }

        $sequence = (int)($state['seq']['dv'] ?? 0) + 1;
        $state['seq']['dv'] = $sequence;
        $id = 'DV-' . $sequence;
        $reverseCode = 'LR-' . str_pad((string)random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
        $value = round(array_reduce($lines, static fn(float $sum, array $line): float => $sum + $line['price'] * $line['qty'], 0.0), 2);
        $request = [
            'id' => $id,
            'orderId' => (string)$orderId,
            'channel' => $demo['channel'],
            'customer' => (string)($order['customer']['name'] ?? 'Cliente'),
            'origin' => 'marketplace',
            'inPerson' => false,
            'reasonType' => $reason,
            'note' => $note,
            'lines' => $lines,
            'value' => $value,
            'window' => $window,
            'createdAt' => $nowMs,
            'status' => 'aprovada',
            'reverseCode' => $reverseCode,
            'history' => [
                ['status' => 'aberta', 'text' => 'Cliente abriu a devolução no ' . $demo['name'], 'ts' => $nowMs],
                ['status' => 'aprovada', 'text' => $demo['name'] . ' aprovou e enviou ao cliente o código de postagem ' . $reverseCode, 'ts' => $nowMs],
            ],
        ];
        $state['returnRequests'] = [$request, ...($state['returnRequests'] ?? [])];
        $notifSequence = (int)($state['seq']['notif'] ?? 0) + 1;
        $state['seq']['notif'] = $notifSequence;
        $state['notifications'] = array_slice([[
            'id' => 'NT-' . $notifSequence,
            'type' => 'venda',
            'text' => 'Devolução ' . $id . ' do pedido ' . $orderId . ': ' . mb_strtolower(MARKETPLACE_RETURN_REASONS[$reason]),
            'ts' => $nowMs,
            'read' => false,
            'route' => 'devolucoes',
        ], ...($state['notifications'] ?? [])], 0, 40);

        $revision = (int)$saved['revision'] + 1;
        $update = $db->prepare("UPDATE app_states SET revision = :revision, payload = :payload, atualizado_em = CURRENT_TIMESTAMP WHERE user_id = :user_id AND app_key = 'modular' AND revision = :previous_revision");
        $update->execute([
            ':revision' => $revision,
            ':payload' => json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ':user_id' => $userId,
            ':previous_revision' => (int)$saved['revision'],
        ]);
        if ($update->rowCount() !== 1) {
            throw new RuntimeException('A loja foi atualizada em outra operação. Tente novamente.');
        }
        syncModularTables($db, $userId, $state, $revision, true);
        $db->exec('COMMIT');
        return ['id' => $id, 'reverse_code' => $reverseCode, 'status_label' => MARKETPLACE_RETURN_STATUS['aprovada']];
    } catch (Throwable $e) {
        try { $db->exec('ROLLBACK'); } catch (Throwable) {}
        throw $e;
    }
}
