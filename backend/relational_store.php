<?php

require_once __DIR__ . '/db.php';

function relationalJson(mixed $value): string {
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function syncModularTables(PDO $db, int $userId, array $state, int $revision, bool $callerOwnsTransaction = false): void {
    if (($state['version'] ?? null) !== 3) {
        return;
    }
    createRelationalSchema($db);

    $ownsTransaction = !$db->inTransaction() && !$callerOwnsTransaction;
    if ($ownsTransaction) {
        $db->beginTransaction();
    }

    try {
        // O plano só entra na criação: depois quem muda é o consultor (backend/consultor.php)
        $businessStmt = $db->prepare(
            "INSERT INTO businesses (owner_user_id, tipo, nome, responsavel, tagline, cnpj, endereco, whatsapp, horario_retirada, tem_deposito, plano)
             VALUES (:user_id, :tipo, :nome, :responsavel, :tagline, :cnpj, :endereco, :whatsapp, :horario, :deposito, :plano)
             ON CONFLICT(owner_user_id) DO UPDATE SET tipo=excluded.tipo, nome=excluded.nome, responsavel=excluded.responsavel, tagline=excluded.tagline, cnpj=excluded.cnpj, endereco=excluded.endereco, whatsapp=excluded.whatsapp, horario_retirada=excluded.horario_retirada, tem_deposito=excluded.tem_deposito, atualizado_em=CURRENT_TIMESTAMP"
        );
        $store = $state['store'] ?? [];
        $businessStmt->execute([
            ':user_id' => $userId,
            ':tipo' => (string)($state['tipo'] ?? 'moda'),
            ':nome' => (string)($store['name'] ?? ''),
            ':responsavel' => (string)($store['owner'] ?? ''),
            ':tagline' => (string)($store['tagline'] ?? ''),
            ':cnpj' => (string)($store['cnpj'] ?? ''),
            ':endereco' => (string)($store['address'] ?? ''),
            ':whatsapp' => (string)($store['whatsapp'] ?? ''),
            ':horario' => (string)($store['pickupHours'] ?? ''),
            ':deposito' => !empty($store['hasDeposito']) ? 1 : 0,
            ':plano' => (string)($state['plan'] ?? 'profissional'),
        ]);
        $businessQuery = $db->prepare('SELECT id FROM businesses WHERE owner_user_id = ?');
        $businessQuery->execute([$userId]);
        $businessId = (int)$businessQuery->fetchColumn();
        $syncedRevision = $db->prepare("SELECT revision FROM relational_sync_state WHERE business_id = ? AND origem = 'modular'");
        $syncedRevision->execute([$businessId]);
        if ((int)$syncedRevision->fetchColumn() >= $revision) {
            if ($ownsTransaction) {
                $db->commit();
            }
            return;
        }

        $locationStmt = $db->prepare(
            'INSERT INTO store_locations (business_id, legacy_id, nome, endereco, tipo, principal, ativo) VALUES (:business, :legacy, :nome, :endereco, :tipo, :principal, 1) ON CONFLICT(business_id, legacy_id) DO UPDATE SET nome=excluded.nome, endereco=excluded.endereco, tipo=excluded.tipo, principal=excluded.principal, ativo=1'
        );
        $db->prepare('UPDATE store_locations SET ativo=0 WHERE business_id=?')->execute([$businessId]);
        $locationIds = [];
        $shops = $state['shops'] ?? [['id' => 'loja', 'name' => 'Loja principal', 'main' => true]];
        foreach ($shops as $shop) {
            $legacyId = (string)($shop['id'] ?? 'loja');
            $locationStmt->execute([
                ':business' => $businessId,
                ':legacy' => $legacyId,
                ':nome' => (string)($shop['name'] ?? 'Loja'),
                ':endereco' => (string)($shop['address'] ?? $store['address'] ?? ''),
                ':tipo' => 'loja',
                ':principal' => !empty($shop['main']) ? 1 : 0,
            ]);
        }
        if (!empty($store['hasDeposito'])) {
            $locationStmt->execute([
                ':business' => $businessId,
                ':legacy' => 'deposito',
                ':nome' => 'Depósito',
                ':endereco' => '',
                ':tipo' => 'deposito',
                ':principal' => 0,
            ]);
        }
        $locationQuery = $db->prepare('SELECT id, legacy_id FROM store_locations WHERE business_id = ? AND ativo = 1');
        $locationQuery->execute([$businessId]);
        foreach ($locationQuery->fetchAll() as $location) {
            $locationIds[(string)$location['legacy_id']] = (int)$location['id'];
        }

        $supplierStmt = $db->prepare(
            'INSERT INTO suppliers_rel (business_id, legacy_id, nome, cnpj, contato_email, whatsapp, prazo_dias, pedido_minimo, atributos_json, ativo) VALUES (:business, :legacy, :nome, :cnpj, :email, :whatsapp, :prazo, :minimo, :attributes, 1) ON CONFLICT(business_id, legacy_id) DO UPDATE SET nome=excluded.nome, cnpj=excluded.cnpj, contato_email=excluded.contato_email, whatsapp=excluded.whatsapp, prazo_dias=excluded.prazo_dias, pedido_minimo=excluded.pedido_minimo, atributos_json=excluded.atributos_json, ativo=1'
        );
        $db->prepare('UPDATE suppliers_rel SET ativo=0 WHERE business_id=?')->execute([$businessId]);
        foreach ($state['suppliers'] ?? [] as $supplier) {
            $supplierStmt->execute([
                ':business' => $businessId,
                ':legacy' => (string)$supplier['id'],
                ':nome' => (string)($supplier['name'] ?? ''),
                ':cnpj' => (string)($supplier['cnpj'] ?? ''),
                ':email' => (string)($supplier['contact'] ?? ''),
                ':whatsapp' => (string)($supplier['whatsapp'] ?? ''),
                ':prazo' => max(0, (int)($supplier['leadTimeDays'] ?? 0)),
                ':minimo' => max(0, (float)($supplier['minOrder'] ?? 0)),
                ':attributes' => relationalJson(array_diff_key($supplier, array_flip(['id', 'name', 'cnpj', 'contact', 'whatsapp', 'leadTimeDays', 'minOrder']))),
            ]);
        }
        $supplierQuery = $db->prepare('SELECT id, legacy_id FROM suppliers_rel WHERE business_id = ? AND ativo = 1');
        $supplierQuery->execute([$businessId]);
        $supplierIds = [];
        foreach ($supplierQuery->fetchAll() as $supplier) {
            $supplierIds[(string)$supplier['legacy_id']] = (int)$supplier['id'];
        }

        $channelIds = [];
        $channelKeys = array_unique(array_merge($state['connected'] ?? [], array_keys($state['channelPricing'] ?? [])));
        $channelStmt = $db->prepare(
            'INSERT INTO sales_channels (business_id, canal, conectado, ajuste_preco, configuracao_json) VALUES (:business, :canal, :conectado, :markup, :config) ON CONFLICT(business_id, canal) DO UPDATE SET conectado=excluded.conectado, ajuste_preco=excluded.ajuste_preco, configuracao_json=excluded.configuracao_json'
        );
        foreach ($channelKeys as $channel) {
            $channel = (string)$channel;
            $channelStmt->execute([
                ':business' => $businessId,
                ':canal' => $channel,
                ':conectado' => in_array($channel, $state['connected'] ?? [], true) ? 1 : 0,
                ':markup' => (float)(($state['channelPricing'] ?? [])[$channel] ?? 0),
                ':config' => relationalJson([]),
            ]);
        }
        $channelQuery = $db->prepare('SELECT id, canal FROM sales_channels WHERE business_id = ?');
        $channelQuery->execute([$businessId]);
        foreach ($channelQuery->fetchAll() as $channel) {
            $channelIds[(string)$channel['canal']] = (int)$channel['id'];
        }

        $oldBalanceQuery = $db->prepare('SELECT product_id, location_id, quantidade FROM stock_balances WHERE business_id = ?');
        $oldBalanceQuery->execute([$businessId]);
        $oldBalances = [];
        foreach ($oldBalanceQuery->fetchAll() as $balance) {
            $oldBalances[(int)$balance['product_id'] . ':' . (int)$balance['location_id']] = (int)$balance['quantidade'];
        }

        $productStmt = $db->prepare(
            'INSERT INTO products_rel (business_id, legacy_id, supplier_id, nome, sku, codigo_barras, categoria, descricao, emoji, preco, custo, estoque_minimo, venda_media_dia, prateleira, capacidade_prateleira, publicado, com_problema, alerta_prateleira, bloqueio_json, atributos_json, ativo) VALUES (:business, :legacy, :supplier, :nome, :sku, :barcode, :category, :description, :emoji, :price, :cost, :minimum, :daily, :shelf, :capacity, :published, :issue, :shelf_alert, :lock, :attributes, 1) ON CONFLICT(business_id, legacy_id) DO UPDATE SET supplier_id=excluded.supplier_id, nome=excluded.nome, sku=excluded.sku, codigo_barras=excluded.codigo_barras, categoria=excluded.categoria, descricao=excluded.descricao, emoji=excluded.emoji, preco=excluded.preco, custo=excluded.custo, estoque_minimo=excluded.estoque_minimo, venda_media_dia=excluded.venda_media_dia, prateleira=excluded.prateleira, capacidade_prateleira=excluded.capacidade_prateleira, publicado=excluded.publicado, com_problema=excluded.com_problema, alerta_prateleira=excluded.alerta_prateleira, bloqueio_json=excluded.bloqueio_json, atributos_json=excluded.atributos_json, ativo=1, atualizado_em=CURRENT_TIMESTAMP'
        );
        $db->prepare('UPDATE products_rel SET ativo=0 WHERE business_id=?')->execute([$businessId]);
        $productIds = [];
        $products = $state['products'] ?? [];
        foreach ($products as $product) {
            $legacyId = (string)$product['id'];
            $supplierLegacyId = (string)($product['supplierId'] ?? '');
            $explicit = ['id', 'supplierId', 'name', 'sku', 'barcode', 'category', 'description', 'emoji', 'price', 'cost', 'minStock', 'avgDaily', 'shelf', 'shelfCap', 'channels', 'stock', 'variants', 'lots', 'promo', 'esl', 'lock', 'issue', 'shelfAlert'];
            $attributes = array_diff_key($product, array_flip($explicit));
            $productStmt->execute([
                ':business' => $businessId,
                ':legacy' => $legacyId,
                ':supplier' => $supplierIds[$supplierLegacyId] ?? null,
                ':nome' => (string)($product['name'] ?? ''),
                ':sku' => (string)($product['sku'] ?? $legacyId),
                ':barcode' => (string)($product['barcode'] ?? ''),
                ':category' => (string)($product['category'] ?? ''),
                ':description' => (string)($product['description'] ?? ''),
                ':emoji' => (string)($product['emoji'] ?? ''),
                ':price' => max(0, (float)($product['price'] ?? 0)),
                ':cost' => max(0, (float)($product['cost'] ?? 0)),
                ':minimum' => max(0, (int)($product['minStock'] ?? 0)),
                ':daily' => max(0, (float)($product['avgDaily'] ?? 0)),
                ':shelf' => (string)($product['shelf'] ?? ''),
                ':capacity' => max(0, (int)($product['shelfCap'] ?? 0)),
                ':published' => !empty($product['channels']) ? 1 : 0,
                ':issue' => !empty($product['issue']) ? 1 : 0,
                ':shelf_alert' => !empty($product['shelfAlert']) ? 1 : 0,
                ':lock' => isset($product['lock']) ? relationalJson($product['lock']) : null,
                ':attributes' => relationalJson($attributes),
            ]);
        }
        $productQuery = $db->prepare('SELECT id, legacy_id FROM products_rel WHERE business_id = ? AND ativo = 1');
        $productQuery->execute([$businessId]);
        foreach ($productQuery->fetchAll() as $product) {
            $productIds[(string)$product['legacy_id']] = (int)$product['id'];
        }

        $variantStmt = $db->prepare(
            'INSERT INTO product_variants_rel (business_id, product_id, legacy_id, rotulo, sku, codigo_barras, quantidade, peso_venda, atributos_json) VALUES (:business, :product, :legacy, :label, :sku, :barcode, :quantity, :weight, :attributes) ON CONFLICT(business_id, product_id, legacy_id) DO UPDATE SET rotulo=excluded.rotulo, sku=excluded.sku, codigo_barras=excluded.codigo_barras, quantidade=excluded.quantidade, peso_venda=excluded.peso_venda, atributos_json=excluded.atributos_json'
        );
        $variantIds = [];
        foreach ($products as $product) {
            $productId = $productIds[(string)$product['id']] ?? null;
            if (!$productId) continue;
            foreach ($product['variants'] ?? [] as $variant) {
                $variantLegacyId = (string)$variant['id'];
                $variantStmt->execute([
                    ':business' => $businessId,
                    ':product' => $productId,
                    ':legacy' => $variantLegacyId,
                    ':label' => (string)($variant['label'] ?? ''),
                    ':sku' => (string)($variant['sku'] ?? ''),
                    ':barcode' => (string)($variant['barcode'] ?? ''),
                    ':quantity' => max(0, (int)($variant['qty'] ?? 0)),
                    ':weight' => max(0, (float)($variant['weight'] ?? 0)),
                    ':attributes' => relationalJson(array_diff_key($variant, array_flip(['id', 'label', 'sku', 'barcode', 'qty', 'weight']))),
                ]);
            }
        }
        $variantQuery = $db->prepare('SELECT id, product_id, legacy_id FROM product_variants_rel WHERE business_id = ?');
        $variantQuery->execute([$businessId]);
        foreach ($variantQuery->fetchAll() as $variant) {
            $variantIds[(int)$variant['product_id'] . ':' . (string)$variant['legacy_id']] = (int)$variant['id'];
        }

        $promoDelete = $db->prepare('DELETE FROM product_promotions WHERE business_id=?');
        $promoInsert = $db->prepare('INSERT INTO product_promotions (business_id, product_id, percentual, canais_json, inicia_em, termina_em) VALUES (?, ?, ?, ?, ?, ?)');
        $labelDelete = $db->prepare('DELETE FROM electronic_labels WHERE business_id=?');
        $labelInsert = $db->prepare('INSERT INTO electronic_labels (business_id, product_id, preco, percentual_promocao, desatualizada, sincronizada_em) VALUES (?, ?, ?, ?, ?, ?)');
        $promoDelete->execute([$businessId]);
        $labelDelete->execute([$businessId]);
        foreach ($products as $product) {
            $productId = $productIds[(string)$product['id']] ?? null;
            if (!$productId) continue;
            if (is_array($product['promo'] ?? null)) {
                $promo = $product['promo'];
                $promoInsert->execute([$businessId, $productId, (float)($promo['pct'] ?? 0), relationalJson($promo['channels'] ?? []), (int)($promo['started'] ?? 0), (int)($promo['until'] ?? 0)]);
            }
            if (is_array($product['esl'] ?? null)) {
                $esl = $product['esl'];
                $labelInsert->execute([$businessId, $productId, max(0, (float)($esl['price'] ?? $product['price'] ?? 0)), max(0, (float)($esl['promoPct'] ?? 0)), !empty($esl['outdated']) ? 1 : 0, isset($esl['ts']) ? (int)$esl['ts'] : null]);
            }
        }

        $publishedStmt = $db->prepare(
            'INSERT INTO product_channels (business_id, product_id, channel_id, publicado) VALUES (:business, :product, :channel, 1) ON CONFLICT(business_id, product_id, channel_id) DO UPDATE SET publicado=1'
        );
        foreach ($products as $product) {
            $productId = $productIds[(string)$product['id']] ?? null;
            if (!$productId) continue;
            foreach ($product['channels'] ?? [] as $channel) {
                if (isset($channelIds[$channel])) {
                    $publishedStmt->execute([':business' => $businessId, ':product' => $productId, ':channel' => $channelIds[$channel]]);
                }
            }
        }
        $db->prepare('UPDATE product_channels SET publicado=0 WHERE business_id=?')->execute([$businessId]);
        foreach ($products as $product) {
            $productId = $productIds[(string)$product['id']] ?? null;
            if (!$productId) continue;
            foreach ($product['channels'] ?? [] as $channel) {
                if (isset($channelIds[$channel])) {
                    $publishedStmt->execute([':business' => $businessId, ':product' => $productId, ':channel' => $channelIds[$channel]]);
                }
            }
        }

        $balanceStmt = $db->prepare(
            'INSERT INTO stock_balances (business_id, product_id, location_id, quantidade) VALUES (:business, :product, :location, :quantity) ON CONFLICT(business_id, product_id, location_id) DO UPDATE SET quantidade=excluded.quantidade, atualizado_em=CURRENT_TIMESTAMP'
        );
        $movementStmt = $db->prepare(
            'INSERT INTO inventory_movements (business_id, product_id, variant_id, location_id, tipo, quantidade, referencia_tipo, referencia_id, observacao, ocorrido_em) VALUES (:business, :product, :variant, :location, :type, :quantity, :ref_type, :ref_id, :note, :time)'
        );
        foreach ($products as $product) {
            $legacyProductId = (string)$product['id'];
            $productId = $productIds[$legacyProductId] ?? null;
            if (!$productId) continue;
            foreach ($product['stock'] ?? [] as $legacyLocationId => $quantity) {
                if (!isset($locationIds[$legacyLocationId])) continue;
                $locationId = $locationIds[$legacyLocationId];
                $quantity = max(0, (int)$quantity);
                $key = $productId . ':' . $locationId;
                $previousQuantity = $oldBalances[$key] ?? null;
                $balanceStmt->execute([
                    ':business' => $businessId,
                    ':product' => $productId,
                    ':location' => $locationId,
                    ':quantity' => $quantity,
                ]);
                if ($previousQuantity === null || $previousQuantity !== $quantity) {
                    $movementStmt->execute([
                        ':business' => $businessId,
                        ':product' => $productId,
                        ':variant' => null,
                        ':location' => $locationId,
                        ':type' => $previousQuantity === null ? 'opening_balance' : 'snapshot_sync',
                        ':quantity' => $previousQuantity === null ? $quantity : $quantity - $previousQuantity,
                        ':ref_type' => 'modular_revision',
                        ':ref_id' => (string)$revision,
                        ':note' => 'Sincronização do estado do painel com o saldo relacional.',
                        ':time' => (int)round(microtime(true) * 1000),
                    ]);
                }
                unset($oldBalances[$key]);
            }
        }
        foreach ($oldBalances as $balanceKey => $previousQuantity) {
            [$staleProductId, $staleLocationId] = array_map('intval', explode(':', $balanceKey, 2));
            $balanceStmt->execute([':business' => $businessId, ':product' => $staleProductId, ':location' => $staleLocationId, ':quantity' => 0]);
            $movementStmt->execute([
                ':business' => $businessId,
                ':product' => $staleProductId,
                ':variant' => null,
                ':location' => $staleLocationId,
                ':type' => 'snapshot_sync',
                ':quantity' => -$previousQuantity,
                ':ref_type' => 'modular_revision',
                ':ref_id' => (string)$revision,
                ':note' => 'Saldo removido da projeção após sincronização do painel.',
                ':time' => (int)round(microtime(true) * 1000),
            ]);
        }

        $lotDelete = $db->prepare('DELETE FROM product_lots WHERE business_id=?');
        $lotInsert = $db->prepare('INSERT INTO product_lots (business_id, product_id, legacy_id, codigo_lote, quantidade, vence_em) VALUES (?, ?, ?, ?, ?, ?)');
        $lotDelete->execute([$businessId]);
        foreach ($products as $product) {
            $productId = $productIds[(string)$product['id']] ?? null;
            if (!$productId) continue;
            foreach ($product['lots'] ?? [] as $lot) {
                $lotInsert->execute([$businessId, $productId, (string)$lot['id'], (string)($lot['code'] ?? ''), max(0, (int)($lot['qty'] ?? 0)), (int)($lot['expiry'] ?? 0)]);
            }
        }

        $orderStmt = $db->prepare(
            'INSERT INTO orders_rel (business_id, legacy_id, channel, tipo, cliente_nome, cliente_telefone, cliente_endereco, total, frete, status, metodo_pagamento, loja_retirada_id, marketplace_demo, dados_adicionais_json, ocorrido_em) VALUES (:business, :legacy, :channel, :type, :name, :phone, :address, :total, :shipping, :status, :payment, :pickup, :demo, :extra, :time) ON CONFLICT(business_id, legacy_id) DO UPDATE SET channel=excluded.channel, tipo=excluded.tipo, cliente_nome=excluded.cliente_nome, cliente_telefone=excluded.cliente_telefone, cliente_endereco=excluded.cliente_endereco, total=excluded.total, frete=excluded.frete, status=excluded.status, metodo_pagamento=excluded.metodo_pagamento, loja_retirada_id=excluded.loja_retirada_id, marketplace_demo=excluded.marketplace_demo, dados_adicionais_json=excluded.dados_adicionais_json, ocorrido_em=excluded.ocorrido_em, atualizado_em=CURRENT_TIMESTAMP'
        );
        $itemDelete = $db->prepare('DELETE FROM order_items_rel WHERE business_id=? AND order_id=?');
        $itemStmt = $db->prepare(
            'INSERT INTO order_items_rel (business_id, order_id, product_id, variant_id, location_id, sku_snapshot, nome_snapshot, quantidade, preco_unitario, bipado) VALUES (:business, :order, :product, :variant, :location, :sku, :name, :quantity, :price, :scanned)'
        );
        $orderItemIds = [];
        foreach ($state['orders'] ?? [] as $order) {
            $legacyOrderId = (string)$order['id'];
            $customer = $order['customer'] ?? [];
            $extra = array_diff_key($order, array_flip(['id', 'channel', 'type', 'customer', 'items', 'total', 'shipping', 'status', 'store', 'marketplaceDemo', 'ts', 'returns']));
            $orderStmt->execute([
                ':business' => $businessId,
                ':legacy' => $legacyOrderId,
                ':channel' => (string)($order['channel'] ?? ''),
                ':type' => (string)($order['type'] ?? ''),
                ':name' => (string)($customer['name'] ?? 'Cliente'),
                ':phone' => (string)($customer['phone'] ?? ''),
                ':address' => (string)($customer['address'] ?? ''),
                ':total' => max(0, (float)($order['total'] ?? 0)),
                ':shipping' => max(0, (float)($order['shipping'] ?? 0)),
                ':status' => (string)($order['status'] ?? ''),
                ':payment' => (string)($order['payment']['method'] ?? ''),
                ':pickup' => $locationIds[(string)($order['store'] ?? '')] ?? null,
                ':demo' => (string)($order['marketplaceDemo'] ?? ''),
                ':extra' => relationalJson($extra),
                ':time' => (int)($order['ts'] ?? 0),
            ]);
            $orderQuery = $db->prepare('SELECT id FROM orders_rel WHERE business_id=? AND legacy_id=?');
            $orderQuery->execute([$businessId, $legacyOrderId]);
            $orderId = (int)$orderQuery->fetchColumn();
            $itemDelete->execute([$businessId, $orderId]);
            $orderItemIds[$legacyOrderId] = [];
            foreach ($order['items'] ?? [] as $item) {
                $legacyProductId = (string)($item['productId'] ?? '');
                $productId = $productIds[$legacyProductId] ?? null;
                $variantId = $productId ? ($variantIds[$productId . ':' . (string)($item['variantId'] ?? '')] ?? null) : null;
                $itemStmt->execute([
                    ':business' => $businessId,
                    ':order' => $orderId,
                    ':product' => $productId,
                    ':variant' => $variantId,
                    ':location' => $locationIds[(string)($item['source'] ?? '')] ?? null,
                    ':sku' => (string)($item['sku'] ?? ''),
                    ':name' => (string)($item['name'] ?? 'Produto'),
                    ':quantity' => max(1, (int)($item['qty'] ?? 1)),
                    ':price' => max(0, (float)($item['price'] ?? 0)),
                    ':scanned' => !empty($item['scanned']) ? 1 : 0,
                ]);
                $orderItemIds[$legacyOrderId][] = (int)$db->lastInsertId();
            }
        }
        // Pedidos removidos do painel também saem das tabelas; itens e devoluções caem por cascata.
        $staleOrders = $db->prepare('SELECT id, legacy_id FROM orders_rel WHERE business_id=?');
        $staleOrders->execute([$businessId]);
        $orderRemove = $db->prepare('DELETE FROM orders_rel WHERE id=?');
        foreach ($staleOrders->fetchAll() as $row) {
            if (!array_key_exists((string)$row['legacy_id'], $orderItemIds)) $orderRemove->execute([(int)$row['id']]);
        }

        $reservationDelete = $db->prepare('DELETE FROM stock_reservations WHERE business_id=?');
        $reservationInsert = $db->prepare('INSERT INTO stock_reservations (business_id, order_item_id, product_id, variant_id, location_id, quantidade, status, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $reservationDelete->execute([$businessId]);
        foreach ($state['orders'] ?? [] as $order) {
            if (!in_array((string)($order['status'] ?? ''), ['novo', 'separando', 'pronto', 'separado'], true)) continue;
            $orderQuery->execute([$businessId, (string)$order['id']]);
            $relationalOrderId = (int)$orderQuery->fetchColumn();
            if (!$relationalOrderId) continue;
            foreach ($order['items'] ?? [] as $index => $item) {
                $productId = $productIds[(string)($item['productId'] ?? '')] ?? null;
                if (!$productId) continue;
                $relationalItemId = $orderItemIds[(string)$order['id']][$index] ?? 0;
                if (!$relationalItemId) continue;
                $variantId = $variantIds[$productId . ':' . (string)($item['variantId'] ?? '')] ?? null;
                $reservationInsert->execute([
                    $businessId,
                    $relationalItemId,
                    $productId,
                    $variantId,
                    $locationIds[(string)($item['source'] ?? '')] ?? null,
                    max(1, (int)($item['qty'] ?? 1)),
                    (string)$order['status'],
                    (int)($order['ts'] ?? 0),
                ]);
            }
        }

        $returnDelete = $db->prepare('DELETE FROM order_returns WHERE business_id=?');
        $returnInsert = $db->prepare('INSERT INTO order_returns (business_id, order_id, legacy_id, tipo, motivo, valor, credito_codigo, ocorrido_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $returnItemInsert = $db->prepare('INSERT INTO order_return_items (business_id, return_id, order_item_index, product_id, variant_id, quantidade, valor_unitario, voltou_estoque, custo_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $returnDelete->execute([$businessId]);
        foreach ($state['orders'] ?? [] as $order) {
            $orderQuery->execute([$businessId, (string)$order['id']]);
            $relationalOrderId = (int)$orderQuery->fetchColumn();
            if (!$relationalOrderId) continue;
            $seenReturns = [];
            foreach ($order['returns'] ?? [] as $return) {
                // Cópias antigas no navegador podem trazer a mesma devolução duas vezes.
                if (isset($seenReturns[(string)$return['id']])) continue;
                $seenReturns[(string)$return['id']] = true;
                $returnInsert->execute([$businessId, $relationalOrderId, (string)$return['id'], (string)($return['refund'] ?? 'vale'), (string)($return['reason'] ?? ''), max(0, (float)($return['value'] ?? 0)), (string)($return['creditCode'] ?? ''), (int)($return['ts'] ?? 0)]);
                $returnId = (int)$db->lastInsertId();
                foreach ($return['lines'] ?? [] as $line) {
                    $orderItem = $order['items'][(int)($line['index'] ?? -1)] ?? null;
                    if (!$orderItem) continue;
                    $productId = $productIds[(string)($orderItem['productId'] ?? '')] ?? null;
                    $variantId = $productId ? ($variantIds[$productId . ':' . (string)($orderItem['variantId'] ?? '')] ?? null) : null;
                    $returnItemInsert->execute([$businessId, $returnId, (int)($line['index'] ?? 0), $productId, $variantId, max(1, (int)($line['qty'] ?? 1)), max(0, (float)($orderItem['price'] ?? 0)), !empty($line['back']) ? 1 : 0, max(0, (float)($line['cost'] ?? 0))]);
                }
            }
        }

        $purchaseStmt = $db->prepare(
            'INSERT INTO purchase_orders_rel (business_id, legacy_id, supplier_id, status, origem_automacao, motivo, criado_em, enviado_em, previsao_entrega_em, atributos_json) VALUES (:business, :legacy, :supplier, :status, :automated, :reason, :created, :sent, :eta, :attributes) ON CONFLICT(business_id, legacy_id) DO UPDATE SET supplier_id=excluded.supplier_id, status=excluded.status, origem_automacao=excluded.origem_automacao, motivo=excluded.motivo, criado_em=excluded.criado_em, enviado_em=excluded.enviado_em, previsao_entrega_em=excluded.previsao_entrega_em, atributos_json=excluded.atributos_json'
        );
        $purchaseItemDelete = $db->prepare('DELETE FROM purchase_order_items_rel WHERE business_id=? AND purchase_order_id=?');
        $purchaseItemStmt = $db->prepare(
            'INSERT INTO purchase_order_items_rel (business_id, purchase_order_id, product_id, sku_snapshot, nome_snapshot, quantidade, recebida, custo_unitario) VALUES (:business, :order, :product, :sku, :name, :quantity, :received, :cost)'
        );
        $purchaseLegacyIds = [];
        foreach ($state['purchaseOrders'] ?? [] as $purchase) {
            $legacyPurchaseId = (string)$purchase['id'];
            $purchaseLegacyIds[$legacyPurchaseId] = true;
            $supplierId = $supplierIds[(string)($purchase['supplierId'] ?? '')] ?? null;
            $purchaseStmt->execute([
                ':business' => $businessId,
                ':legacy' => $legacyPurchaseId,
                ':supplier' => $supplierId,
                ':status' => (string)($purchase['status'] ?? ''),
                ':automated' => !empty($purchase['byAI']) ? 1 : 0,
                ':reason' => (string)($purchase['reason'] ?? ''),
                ':created' => (int)($purchase['ts'] ?? 0),
                ':sent' => isset($purchase['sentTs']) ? (int)$purchase['sentTs'] : null,
                ':eta' => isset($purchase['etaTs']) ? (int)$purchase['etaTs'] : null,
                ':attributes' => relationalJson(array_diff_key($purchase, array_flip(['id', 'supplierId', 'status', 'byAI', 'reason', 'ts', 'sentTs', 'etaTs', 'items']))),
            ]);
            $purchaseQuery = $db->prepare('SELECT id FROM purchase_orders_rel WHERE business_id=? AND legacy_id=?');
            $purchaseQuery->execute([$businessId, $legacyPurchaseId]);
            $purchaseId = (int)$purchaseQuery->fetchColumn();
            $purchaseItemDelete->execute([$businessId, $purchaseId]);
            foreach ($purchase['items'] ?? [] as $item) {
                $purchaseItemStmt->execute([
                    ':business' => $businessId,
                    ':order' => $purchaseId,
                    ':product' => $productIds[(string)($item['productId'] ?? '')] ?? null,
                    ':sku' => (string)($item['sku'] ?? ''),
                    ':name' => (string)($item['name'] ?? 'Produto'),
                    ':quantity' => max(1, (int)($item['qty'] ?? 1)),
                    ':received' => max(0, (int)($item['received'] ?? 0)),
                    ':cost' => max(0, (float)($item['cost'] ?? 0)),
                ]);
            }
        }
        $stalePurchases = $db->prepare('SELECT id, legacy_id FROM purchase_orders_rel WHERE business_id=?');
        $stalePurchases->execute([$businessId]);
        $purchaseRemove = $db->prepare('DELETE FROM purchase_orders_rel WHERE id=?');
        foreach ($stalePurchases->fetchAll() as $row) {
            if (!isset($purchaseLegacyIds[(string)$row['legacy_id']])) $purchaseRemove->execute([(int)$row['id']]);
        }

        $expenseDelete = $db->prepare('DELETE FROM expenses_rel WHERE business_id=?');
        $expenseInsert = $db->prepare('INSERT INTO expenses_rel (business_id, legacy_id, categoria, descricao, valor, data_texto, ocorrido_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $expenseDelete->execute([$businessId]);
        foreach ($state['expenses'] ?? [] as $expense) {
            $expenseInsert->execute([$businessId, (string)$expense['id'], (string)($expense['category'] ?? ''), (string)($expense['description'] ?? ''), max(0, (float)($expense['amount'] ?? 0)), (string)($expense['date'] ?? ''), isset($expense['ts']) ? (int)$expense['ts'] : null]);
        }

        $invoiceDelete = $db->prepare('DELETE FROM invoices_rel WHERE business_id=?');
        $invoiceInsert = $db->prepare('INSERT INTO invoices_rel (business_id, legacy_id, order_legacy_id, channel, chave, total, emitida_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $invoiceItemInsert = $db->prepare('INSERT INTO invoice_items_rel (business_id, invoice_id, sku_snapshot, nome_snapshot, quantidade, preco_unitario) VALUES (?, ?, ?, ?, ?, ?)');
        $invoiceDelete->execute([$businessId]);
        foreach ($state['invoices'] ?? [] as $invoice) {
            $invoiceInsert->execute([$businessId, (string)$invoice['id'], (string)($invoice['orderId'] ?? ''), (string)($invoice['channel'] ?? ''), (string)($invoice['key'] ?? ''), max(0, (float)($invoice['total'] ?? 0)), (int)($invoice['ts'] ?? 0)]);
            $invoiceId = (int)$db->lastInsertId();
            foreach ($invoice['items'] ?? [] as $item) $invoiceItemInsert->execute([$businessId, $invoiceId, (string)($item['sku'] ?? ''), (string)($item['name'] ?? ''), max(1, (int)($item['qty'] ?? 1)), max(0, (float)($item['price'] ?? 0))]);
        }

        $labelDelete = $db->prepare('DELETE FROM shipping_labels_rel WHERE business_id=?');
        $labelInsert = $db->prepare('INSERT INTO shipping_labels_rel (business_id, legacy_id, order_legacy_id, channel, codigo_rastreio, destinatario, peso, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $labelDelete->execute([$businessId]);
        foreach ($state['labels'] ?? [] as $label) $labelInsert->execute([$businessId, (string)$label['id'], (string)($label['orderId'] ?? ''), (string)($label['channel'] ?? ''), (string)($label['trackingCode'] ?? ''), (string)($label['recipient'] ?? ''), max(0, (float)($label['weight'] ?? 0)), (int)($label['ts'] ?? 0)]);

        $messageDelete = $db->prepare('DELETE FROM customer_messages WHERE business_id=?');
        $messageInsert = $db->prepare('INSERT INTO customer_messages (business_id, legacy_id, order_legacy_id, destinatario, telefone, mensagem, enviado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $messageDelete->execute([$businessId]);
        foreach ($state['messages'] ?? [] as $message) $messageInsert->execute([$businessId, (string)$message['id'], (string)($message['orderId'] ?? ''), (string)($message['to'] ?? ''), (string)($message['phone'] ?? ''), (string)($message['text'] ?? ''), (int)($message['ts'] ?? 0)]);

        $notificationDelete = $db->prepare('DELETE FROM business_notifications WHERE business_id=?');
        $notificationInsert = $db->prepare('INSERT INTO business_notifications (business_id, legacy_id, tipo, mensagem, rota, lida, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $notificationDelete->execute([$businessId]);
        foreach ($state['notifications'] ?? [] as $notification) $notificationInsert->execute([$businessId, (string)$notification['id'], (string)($notification['type'] ?? ''), (string)($notification['text'] ?? ''), (string)($notification['route'] ?? ''), !empty($notification['read']) ? 1 : 0, (int)($notification['ts'] ?? 0)]);

        $automationDelete = $db->prepare('DELETE FROM automation_logs WHERE business_id=?');
        $automationInsert = $db->prepare('INSERT INTO automation_logs (business_id, legacy_id, regra, mensagem, criado_em) VALUES (?, ?, ?, ?, ?)');
        $automationDelete->execute([$businessId]);
        foreach ($state['automationLog'] ?? [] as $log) $automationInsert->execute([$businessId, (string)$log['id'], (string)($log['rule'] ?? ''), (string)($log['text'] ?? ''), (int)($log['ts'] ?? 0)]);

        $scanDelete = $db->prepare('DELETE FROM inventory_scans WHERE business_id=?');
        $scanInsert = $db->prepare('INSERT INTO inventory_scans (business_id, legacy_id, tipo, sku, produto, local, lido_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $scanDelete->execute([$businessId]);
        foreach ($state['scanLog'] ?? [] as $scan) $scanInsert->execute([$businessId, (string)$scan['id'], (string)($scan['type'] ?? ''), (string)($scan['sku'] ?? ''), (string)($scan['product'] ?? ''), (string)($scan['location'] ?? ''), (int)($scan['ts'] ?? 0)]);

        $lossDelete = $db->prepare('DELETE FROM inventory_losses WHERE business_id=?');
        $lossInsert = $db->prepare('INSERT INTO inventory_losses (business_id, legacy_id, product_id, motivo, quantidade, valor, ocorrido_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $lossDelete->execute([$businessId]);
        foreach ($state['losses'] ?? [] as $loss) $lossInsert->execute([$businessId, (string)($loss['id'] ?? $loss['code'] ?? ''), $productIds[(string)($loss['productId'] ?? '')] ?? null, (string)($loss['reason'] ?? ''), max(0, (int)($loss['qty'] ?? 0)), max(0, (float)($loss['value'] ?? 0)), (int)($loss['ts'] ?? 0)]);

        $creditDelete = $db->prepare('DELETE FROM store_credits WHERE business_id=?');
        $creditInsert = $db->prepare('INSERT INTO store_credits (business_id, codigo, cliente, order_legacy_id, valor_inicial, saldo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $creditDelete->execute([$businessId]);
        foreach ($state['credits'] ?? [] as $credit) $creditInsert->execute([$businessId, (string)$credit['code'], (string)($credit['customer'] ?? ''), (string)($credit['orderId'] ?? ''), max(0, (float)($credit['value'] ?? 0)), max(0, (float)($credit['balance'] ?? 0)), (int)($credit['ts'] ?? 0)]);

        $eventDelete = $db->prepare('DELETE FROM seasonal_events WHERE business_id=?');
        $eventInsert = $db->prepare('INSERT INTO seasonal_events (business_id, legacy_id, nome, data_evento, multiplicador, dias_janela, atributos_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $eventDelete->execute([$businessId]);
        foreach ($state['customEvents'] ?? [] as $event) $eventInsert->execute([$businessId, (string)$event['id'], (string)($event['name'] ?? ''), (string)($event['date'] ?? ''), (float)($event['mult'] ?? 1), max(1, (int)($event['windowDays'] ?? 1)), relationalJson(array_diff_key($event, array_flip(['id', 'name', 'date', 'mult', 'windowDays'])))]);

        $reportDelete = $db->prepare('DELETE FROM seasonal_reports WHERE business_id=?');
        $reportInsert = $db->prepare('INSERT INTO seasonal_reports (business_id, legacy_id, nome, dados_json) VALUES (?, ?, ?, ?)');
        $reportDelete->execute([$businessId]);
        foreach ($state['eventReports'] ?? [] as $report) $reportInsert->execute([$businessId, (string)($report['id'] ?? ''), (string)($report['name'] ?? ''), relationalJson($report)]);

        $preferences = [
            'onboarding' => $state['onboarding'] ?? [],
            'automations' => $state['automations'] ?? [],
            'channelPricing' => $state['channelPricing'] ?? [],
            'channelFees' => $state['channelFees'] ?? [],
            'minMargin' => $state['minMargin'] ?? 10,
            'cashRegisters' => $state['cashRegisters'] ?? [],
            'returnRequests' => $state['returnRequests'] ?? [],
            'eventsPrepared' => $state['eventsPrepared'] ?? [],
            'eventLearning' => $state['eventLearning'] ?? [],
            'clock' => $state['clock'] ?? 0,
            'sequences' => $state['seq'] ?? [],
        ];
        $preferenceStmt = $db->prepare(
            "INSERT INTO business_preferences (business_id, chave, valor, tipo_valor) VALUES (:business, :key, :value, :type) ON CONFLICT(business_id, chave) DO UPDATE SET valor=excluded.valor, tipo_valor=excluded.tipo_valor, atualizado_em=CURRENT_TIMESTAMP"
        );
        foreach ($preferences as $key => $value) {
            $preferenceStmt->execute([
                ':business' => $businessId,
                ':key' => $key,
                ':value' => relationalJson($value),
                ':type' => is_array($value) ? 'json' : gettype($value),
            ]);
        }

        $syncStmt = $db->prepare(
            "INSERT INTO relational_sync_state (business_id, origem, revision) VALUES (?, 'modular', ?) ON CONFLICT(business_id, origem) DO UPDATE SET revision=excluded.revision, atualizado_em=CURRENT_TIMESTAMP"
        );
        $syncStmt->execute([$businessId, $revision]);

        if ($ownsTransaction) {
            $db->commit();
        }
    } catch (Throwable $e) {
        if ($ownsTransaction && $db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

function loadModularStateFromTables(PDO $db, int $userId, array $fallback): array {
    $businessQuery = $db->prepare('SELECT * FROM businesses WHERE owner_user_id = ?');
    $businessQuery->execute([$userId]);
    $business = $businessQuery->fetch();
    if (!$business) {
        return $fallback;
    }
    $businessId = (int)$business['id'];

    $fallback['tipo'] = (string)$business['tipo'];
    $fallback['plan'] = (string)$business['plano'];
    $fallback['store'] = array_merge($fallback['store'] ?? [], [
        'name' => (string)$business['nome'],
        'owner' => (string)$business['responsavel'],
        'tagline' => (string)$business['tagline'],
        'cnpj' => (string)$business['cnpj'],
        'address' => (string)$business['endereco'],
        'whatsapp' => (string)$business['whatsapp'],
        'pickupHours' => (string)$business['horario_retirada'],
        'hasDeposito' => (bool)$business['tem_deposito'],
    ]);

    $locationsQuery = $db->prepare('SELECT legacy_id, nome, endereco, principal, tipo FROM store_locations WHERE business_id=? AND ativo=1 ORDER BY principal DESC, id');
    $locationsQuery->execute([$businessId]);
    $locations = $locationsQuery->fetchAll();
    $locationLegacyById = [];
    $fallback['shops'] = [];
    foreach ($locations as $location) {
        $legacyId = (string)$location['legacy_id'];
        if ($location['tipo'] === 'deposito') continue;
        $fallback['shops'][] = [
            'id' => $legacyId,
            'name' => (string)$location['nome'],
            'address' => (string)$location['endereco'],
            'main' => (bool)$location['principal'],
        ];
    }
    $locationIdQuery = $db->prepare('SELECT id, legacy_id FROM store_locations WHERE business_id=?');
    $locationIdQuery->execute([$businessId]);
    foreach ($locationIdQuery->fetchAll() as $location) {
        $locationLegacyById[(int)$location['id']] = (string)$location['legacy_id'];
    }

    $supplierQuery = $db->prepare('SELECT legacy_id, nome, cnpj, contato_email, whatsapp, prazo_dias, pedido_minimo, atributos_json FROM suppliers_rel WHERE business_id=? AND ativo=1 ORDER BY id');
    $supplierQuery->execute([$businessId]);
    $fallback['suppliers'] = array_map(static fn(array $supplier): array => array_merge(json_decode((string)($supplier['atributos_json'] ?? '{}'), true) ?: [], [
        'id' => (string)$supplier['legacy_id'],
        'name' => (string)$supplier['nome'],
        'cnpj' => (string)$supplier['cnpj'],
        'contact' => (string)$supplier['contato_email'],
        'whatsapp' => (string)$supplier['whatsapp'],
        'leadTimeDays' => (int)$supplier['prazo_dias'],
        'minOrder' => (float)$supplier['pedido_minimo'],
    ]), $supplierQuery->fetchAll());

    $channelQuery = $db->prepare('SELECT id, canal, conectado, ajuste_preco FROM sales_channels WHERE business_id=? ORDER BY id');
    $channelQuery->execute([$businessId]);
    $channels = $channelQuery->fetchAll();
    $channelLegacyById = [];
    $fallback['connected'] = [];
    $fallback['channelPricing'] = [];
    foreach ($channels as $channel) {
        $channelId = (int)$channel['id'];
        $channelLegacyById[$channelId] = (string)$channel['canal'];
        if ((int)$channel['conectado'] === 1) $fallback['connected'][] = (string)$channel['canal'];
        $fallback['channelPricing'][(string)$channel['canal']] = (float)$channel['ajuste_preco'];
    }

    $productQuery = $db->prepare('SELECT * FROM products_rel WHERE business_id=? AND ativo=1 ORDER BY id');
    $productQuery->execute([$businessId]);
    $productRows = $productQuery->fetchAll();
    $productLegacyById = [];
    $productIdByLegacy = [];
    foreach ($productRows as $product) {
        $productLegacyById[(int)$product['id']] = (string)$product['legacy_id'];
        $productIdByLegacy[(string)$product['legacy_id']] = (int)$product['id'];
    }

    $stockQuery = $db->prepare('SELECT product_id, location_id, quantidade FROM stock_balances WHERE business_id=?');
    $stockQuery->execute([$businessId]);
    $stocks = [];
    foreach ($stockQuery->fetchAll() as $balance) {
        $productLegacyId = $productLegacyById[(int)$balance['product_id']] ?? null;
        $locationLegacyId = $locationLegacyById[(int)$balance['location_id']] ?? null;
        if ($productLegacyId !== null && $locationLegacyId !== null) {
            $stocks[$productLegacyId][$locationLegacyId] = (int)$balance['quantidade'];
        }
    }

    $productChannelsQuery = $db->prepare('SELECT product_id, channel_id, publicado FROM product_channels WHERE business_id=?');
    $productChannelsQuery->execute([$businessId]);
    $productChannels = [];
    foreach ($productChannelsQuery->fetchAll() as $entry) {
        if ((int)$entry['publicado'] !== 1) continue;
        $productLegacyId = $productLegacyById[(int)$entry['product_id']] ?? null;
        $channelLegacyId = $channelLegacyById[(int)$entry['channel_id']] ?? null;
        if ($productLegacyId !== null && $channelLegacyId !== null) $productChannels[$productLegacyId][] = $channelLegacyId;
    }

    $variantsQuery = $db->prepare('SELECT id, product_id, legacy_id, rotulo, sku, codigo_barras, quantidade, peso_venda, atributos_json FROM product_variants_rel WHERE business_id=? ORDER BY id');
    $variantsQuery->execute([$businessId]);
    $variantLegacyById = [];
    $variants = [];
    foreach ($variantsQuery->fetchAll() as $variant) {
        $variantId = (int)$variant['id'];
        $productLegacyId = $productLegacyById[(int)$variant['product_id']] ?? null;
        if ($productLegacyId === null) continue;
        $variantLegacyById[$variantId] = (string)$variant['legacy_id'];
        $variantAttributes = json_decode((string)$variant['atributos_json'], true) ?: [];
        $variants[$productLegacyId][] = array_merge($variantAttributes, [
            'id' => (string)$variant['legacy_id'],
            'label' => (string)$variant['rotulo'],
            'sku' => (string)$variant['sku'],
            'barcode' => (string)$variant['codigo_barras'],
            'qty' => (int)$variant['quantidade'],
            'weight' => (float)$variant['peso_venda'],
        ]);
    }

    $fallback['products'] = [];
    $productIndexByLegacy = [];
    foreach ($productRows as $product) {
        $legacyId = (string)$product['legacy_id'];
        $attributes = json_decode((string)$product['atributos_json'], true) ?: [];
        $productData = array_merge($attributes, [
            'id' => $legacyId,
            'supplierId' => $product['supplier_id'] ? (string)($db->query('SELECT legacy_id FROM suppliers_rel WHERE id=' . (int)$product['supplier_id'])->fetchColumn() ?: '') : '',
            'name' => (string)$product['nome'],
            'sku' => (string)$product['sku'],
            'barcode' => (string)$product['codigo_barras'],
            'category' => (string)$product['categoria'],
            'description' => (string)$product['descricao'],
            'emoji' => (string)$product['emoji'],
            'price' => (float)$product['preco'],
            'cost' => (float)$product['custo'],
            'minStock' => (int)$product['estoque_minimo'],
            'avgDaily' => (float)$product['venda_media_dia'],
            'shelf' => (string)$product['prateleira'],
            'shelfCap' => (int)$product['capacidade_prateleira'],
            'channels' => $productChannels[$legacyId] ?? [],
            'stock' => $stocks[$legacyId] ?? [],
            'variants' => $variants[$legacyId] ?? [],
            'issue' => (bool)$product['com_problema'],
            'shelfAlert' => (bool)$product['alerta_prateleira'],
            'lock' => $product['bloqueio_json'] ? (json_decode((string)$product['bloqueio_json'], true) ?: null) : null,
        ]);
        if (!$productData['variants']) unset($productData['variants'], $productData['variantKind']);
        $productIndexByLegacy[$legacyId] = count($fallback['products']);
        $fallback['products'][] = $productData;
    }

    $promoQuery = $db->prepare('SELECT product_id, percentual, canais_json, inicia_em, termina_em FROM product_promotions WHERE business_id=? ORDER BY id DESC');
    $promoQuery->execute([$businessId]);
    foreach ($promoQuery->fetchAll() as $promo) {
        $legacyProductId = $productLegacyById[(int)$promo['product_id']] ?? null;
        if ($legacyProductId === null || !isset($productIndexByLegacy[$legacyProductId])) continue;
        $fallback['products'][$productIndexByLegacy[$legacyProductId]]['promo'] = [
            'pct' => (float)$promo['percentual'],
            'channels' => json_decode((string)$promo['canais_json'], true) ?: [],
            'started' => (int)$promo['inicia_em'],
            'until' => (int)$promo['termina_em'],
        ];
    }
    $eslQuery = $db->prepare('SELECT product_id, preco, percentual_promocao, desatualizada, sincronizada_em FROM electronic_labels WHERE business_id=?');
    $eslQuery->execute([$businessId]);
    foreach ($eslQuery->fetchAll() as $esl) {
        $legacyProductId = $productLegacyById[(int)$esl['product_id']] ?? null;
        if ($legacyProductId === null || !isset($productIndexByLegacy[$legacyProductId])) continue;
        $fallback['products'][$productIndexByLegacy[$legacyProductId]]['esl'] = [
            'price' => (float)$esl['preco'],
            'promoPct' => (float)$esl['percentual_promocao'],
            'outdated' => (bool)$esl['desatualizada'],
            'ts' => $esl['sincronizada_em'] === null ? null : (int)$esl['sincronizada_em'],
        ];
    }

    $orderQuery = $db->prepare('SELECT * FROM orders_rel WHERE business_id=? ORDER BY ocorrido_em DESC, id DESC');
    $orderQuery->execute([$businessId]);
    $orderRows = $orderQuery->fetchAll();
    $orderLegacyById = [];
    foreach ($orderRows as $order) $orderLegacyById[(int)$order['id']] = (string)$order['legacy_id'];
    $itemQuery = $db->prepare('SELECT * FROM order_items_rel WHERE business_id=? ORDER BY id');
    $itemQuery->execute([$businessId]);
    $orderItems = [];
    foreach ($itemQuery->fetchAll() as $item) {
        $legacyOrderId = $orderLegacyById[(int)$item['order_id']] ?? null;
        if ($legacyOrderId === null) continue;
        $legacyProductId = $item['product_id'] ? ($productLegacyById[(int)$item['product_id']] ?? null) : null;
        $legacyVariantId = $item['variant_id'] ? ($variantLegacyById[(int)$item['variant_id']] ?? null) : null;
        $orderItems[$legacyOrderId][] = [
            'productId' => $legacyProductId,
            'variantId' => $legacyVariantId,
            'sku' => (string)$item['sku_snapshot'],
            'name' => (string)$item['nome_snapshot'],
            'qty' => (int)$item['quantidade'],
            'price' => (float)$item['preco_unitario'],
            'source' => $locationLegacyById[(int)$item['location_id']] ?? 'loja',
            'scanned' => (bool)$item['bipado'],
        ];
    }
    $fallback['orders'] = [];
    foreach ($orderRows as $order) {
        $legacyId = (string)$order['legacy_id'];
        $extra = json_decode((string)$order['dados_adicionais_json'], true) ?: [];
        unset($extra['returns']); // devoluções vêm só de order_returns; versões antigas também as gravavam aqui
        $fallback['orders'][] = array_merge($extra, [
            'id' => $legacyId,
            'channel' => (string)$order['channel'],
            'type' => (string)$order['tipo'],
            'customer' => ['name' => (string)$order['cliente_nome'], 'phone' => (string)$order['cliente_telefone'], 'address' => (string)$order['cliente_endereco']],
            'items' => $orderItems[$legacyId] ?? [],
            'total' => (float)$order['total'],
            'shipping' => (float)$order['frete'],
            'status' => (string)$order['status'],
            'ts' => (int)$order['ocorrido_em'],
            'store' => $locationLegacyById[(int)$order['loja_retirada_id']] ?? null,
            'marketplaceDemo' => (string)$order['marketplace_demo'],
        ]);
    }

    $returnQuery = $db->prepare('SELECT r.id, r.order_id, r.legacy_id, r.tipo, r.motivo, r.valor, r.credito_codigo, r.ocorrido_em FROM order_returns r WHERE r.business_id=? ORDER BY r.ocorrido_em, r.id');
    $returnQuery->execute([$businessId]);
    $returnItemQuery = $db->prepare('SELECT order_item_index, product_id, variant_id, quantidade, voltou_estoque, custo_total FROM order_return_items WHERE business_id=? AND return_id=? ORDER BY id');
    $ordersByLegacy = [];
    foreach ($orderRows as $order) $ordersByLegacy[(string)$order['legacy_id']] = (int)$order['id'];
    foreach ($returnQuery->fetchAll() as $return) {
        $legacyOrderId = $orderLegacyById[(int)$return['order_id']] ?? null;
        if ($legacyOrderId === null) continue;
        $returnItemQuery->execute([$businessId, (int)$return['id']]);
        $lines = [];
        foreach ($returnItemQuery->fetchAll() as $line) {
            $lines[] = [
                'index' => (int)$line['order_item_index'],
                'qty' => (int)$line['quantidade'],
                'name' => '',
                'back' => (bool)$line['voltou_estoque'],
                'cost' => (float)$line['custo_total'],
            ];
        }
        $returnData = [
            'id' => (string)$return['legacy_id'],
            'lines' => $lines,
            'value' => (float)$return['valor'],
            'reason' => (string)$return['motivo'],
            'refund' => (string)$return['tipo'],
            'ts' => (int)$return['ocorrido_em'],
        ];
        if ((string)$return['credito_codigo'] !== '') $returnData['creditCode'] = (string)$return['credito_codigo'];
        $orderIndex = null;
        foreach ($fallback['orders'] as $index => $candidate) {
            if ($candidate['id'] === $legacyOrderId) { $orderIndex = $index; break; }
        }
        if ($orderIndex !== null) $fallback['orders'][$orderIndex]['returns'][] = $returnData;
    }

    $purchaseQuery = $db->prepare('SELECT * FROM purchase_orders_rel WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $purchaseQuery->execute([$businessId]);
    $purchaseRows = $purchaseQuery->fetchAll();
    $purchaseLegacyById = [];
    foreach ($purchaseRows as $purchase) $purchaseLegacyById[(int)$purchase['id']] = (string)$purchase['legacy_id'];
    $purchaseItemsQuery = $db->prepare('SELECT * FROM purchase_order_items_rel WHERE business_id=? ORDER BY id');
    $purchaseItemsQuery->execute([$businessId]);
    $purchaseItems = [];
    foreach ($purchaseItemsQuery->fetchAll() as $item) {
        $legacyPurchaseId = $purchaseLegacyById[(int)$item['purchase_order_id']] ?? null;
        if ($legacyPurchaseId === null) continue;
        $purchaseItems[$legacyPurchaseId][] = [
            'productId' => $item['product_id'] ? ($productLegacyById[(int)$item['product_id']] ?? null) : null,
            'sku' => (string)$item['sku_snapshot'],
            'name' => (string)$item['nome_snapshot'],
            'qty' => (int)$item['quantidade'],
            'received' => (int)$item['recebida'],
            'cost' => (float)$item['custo_unitario'],
        ];
    }
    $fallback['purchaseOrders'] = [];
    foreach ($purchaseRows as $purchase) {
        $legacyId = (string)$purchase['legacy_id'];
        $extra = json_decode((string)$purchase['atributos_json'], true) ?: [];
        $supplierLegacyQuery = $purchase['supplier_id'] ? $db->prepare('SELECT legacy_id FROM suppliers_rel WHERE id=?') : null;
        if ($supplierLegacyQuery) $supplierLegacyQuery->execute([(int)$purchase['supplier_id']]);
        $fallback['purchaseOrders'][] = array_merge($extra, [
            'id' => $legacyId,
            'supplierId' => $supplierLegacyQuery ? (string)$supplierLegacyQuery->fetchColumn() : '',
            'status' => (string)$purchase['status'],
            'byAI' => (bool)$purchase['origem_automacao'],
            'reason' => (string)$purchase['motivo'],
            'ts' => (int)$purchase['criado_em'],
            'sentTs' => $purchase['enviado_em'] === null ? null : (int)$purchase['enviado_em'],
            'etaTs' => $purchase['previsao_entrega_em'] === null ? null : (int)$purchase['previsao_entrega_em'],
            'items' => $purchaseItems[$legacyId] ?? [],
        ]);
    }

    $lotsQuery = $db->prepare('SELECT product_id, legacy_id, codigo_lote, quantidade, vence_em FROM product_lots WHERE business_id=? ORDER BY vence_em');
    $lotsQuery->execute([$businessId]);
    foreach ($lotsQuery->fetchAll() as $lot) {
        $productLegacyId = $productLegacyById[(int)$lot['product_id']] ?? null;
        if ($productLegacyId !== null && isset($productIndexByLegacy[$productLegacyId])) $fallback['products'][$productIndexByLegacy[$productLegacyId]]['lots'][] = [
            'id' => (string)$lot['legacy_id'], 'code' => (string)$lot['codigo_lote'], 'qty' => (int)$lot['quantidade'], 'expiry' => (int)$lot['vence_em'],
        ];
    }

    $expenseQuery = $db->prepare('SELECT legacy_id, categoria, descricao, valor, data_texto, ocorrido_em FROM expenses_rel WHERE business_id=? ORDER BY id');
    $expenseQuery->execute([$businessId]);
    $fallback['expenses'] = array_map(static fn(array $row): array => [
        'id' => (string)$row['legacy_id'], 'category' => (string)$row['categoria'], 'description' => (string)$row['descricao'],
        'amount' => (float)$row['valor'], 'date' => (string)$row['data_texto'], 'ts' => $row['ocorrido_em'] === null ? null : (int)$row['ocorrido_em'],
    ], $expenseQuery->fetchAll());

    $invoiceQuery = $db->prepare('SELECT * FROM invoices_rel WHERE business_id=? ORDER BY emitida_em DESC, id DESC');
    $invoiceQuery->execute([$businessId]);
    $fallback['invoices'] = [];
    $invoiceItemsQuery = $db->prepare('SELECT sku_snapshot, nome_snapshot, quantidade, preco_unitario FROM invoice_items_rel WHERE business_id=? AND invoice_id=? ORDER BY id');
    foreach ($invoiceQuery->fetchAll() as $invoice) {
        $invoiceItemsQuery->execute([$businessId, (int)$invoice['id']]);
        $fallback['invoices'][] = [
            'id' => (string)$invoice['legacy_id'], 'orderId' => (string)$invoice['order_legacy_id'], 'channel' => (string)$invoice['channel'],
            'key' => (string)$invoice['chave'], 'total' => (float)$invoice['total'], 'ts' => (int)$invoice['emitida_em'],
            'items' => array_map(static fn(array $item): array => ['sku' => (string)$item['sku_snapshot'], 'name' => (string)$item['nome_snapshot'], 'qty' => (int)$item['quantidade'], 'price' => (float)$item['preco_unitario']], $invoiceItemsQuery->fetchAll()),
        ];
    }

    $labelQuery = $db->prepare('SELECT legacy_id, order_legacy_id, channel, codigo_rastreio, destinatario, peso, criado_em FROM shipping_labels_rel WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $labelQuery->execute([$businessId]);
    $fallback['labels'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'orderId' => (string)$row['order_legacy_id'], 'channel' => (string)$row['channel'], 'trackingCode' => (string)$row['codigo_rastreio'], 'recipient' => (string)$row['destinatario'], 'weight' => (float)$row['peso'], 'ts' => (int)$row['criado_em']], $labelQuery->fetchAll());

    $messageQuery = $db->prepare('SELECT legacy_id, order_legacy_id, destinatario, telefone, mensagem, enviado_em FROM customer_messages WHERE business_id=? ORDER BY enviado_em DESC, id DESC');
    $messageQuery->execute([$businessId]);
    $fallback['messages'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'orderId' => (string)$row['order_legacy_id'], 'to' => (string)$row['destinatario'], 'phone' => (string)$row['telefone'], 'text' => (string)$row['mensagem'], 'ts' => (int)$row['enviado_em']], $messageQuery->fetchAll());

    $notificationQuery = $db->prepare('SELECT legacy_id, tipo, mensagem, rota, lida, criado_em FROM business_notifications WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $notificationQuery->execute([$businessId]);
    $fallback['notifications'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'type' => (string)$row['tipo'], 'text' => (string)$row['mensagem'], 'route' => (string)$row['rota'], 'read' => (bool)$row['lida'], 'ts' => (int)$row['criado_em']], $notificationQuery->fetchAll());

    $automationQuery = $db->prepare('SELECT legacy_id, regra, mensagem, criado_em FROM automation_logs WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $automationQuery->execute([$businessId]);
    $fallback['automationLog'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'rule' => (string)$row['regra'], 'text' => (string)$row['mensagem'], 'ts' => (int)$row['criado_em']], $automationQuery->fetchAll());

    $scanQuery = $db->prepare('SELECT legacy_id, tipo, sku, produto, local, lido_em FROM inventory_scans WHERE business_id=? ORDER BY lido_em DESC, id DESC');
    $scanQuery->execute([$businessId]);
    $fallback['scanLog'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'type' => (string)$row['tipo'], 'sku' => (string)$row['sku'], 'product' => (string)$row['produto'], 'location' => (string)$row['local'], 'ts' => (int)$row['lido_em']], $scanQuery->fetchAll());

    $lossQuery = $db->prepare('SELECT legacy_id, product_id, motivo, quantidade, valor, ocorrido_em FROM inventory_losses WHERE business_id=? ORDER BY ocorrido_em DESC, id DESC');
    $lossQuery->execute([$businessId]);
    $fallback['losses'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'productId' => $row['product_id'] ? ($productLegacyById[(int)$row['product_id']] ?? null) : null, 'reason' => (string)$row['motivo'], 'qty' => (int)$row['quantidade'], 'value' => (float)$row['valor'], 'ts' => (int)$row['ocorrido_em']], $lossQuery->fetchAll());

    $creditQuery = $db->prepare('SELECT codigo, cliente, order_legacy_id, valor_inicial, saldo, criado_em FROM store_credits WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $creditQuery->execute([$businessId]);
    $fallback['credits'] = array_map(static fn(array $row): array => ['code' => (string)$row['codigo'], 'customer' => (string)$row['cliente'], 'orderId' => (string)$row['order_legacy_id'], 'value' => (float)$row['valor_inicial'], 'balance' => (float)$row['saldo'], 'ts' => (int)$row['criado_em']], $creditQuery->fetchAll());

    $eventQuery = $db->prepare('SELECT legacy_id, nome, data_evento, multiplicador, dias_janela, atributos_json FROM seasonal_events WHERE business_id=? ORDER BY id');
    $eventQuery->execute([$businessId]);
    $fallback['customEvents'] = array_map(static fn(array $row): array => array_merge(json_decode((string)$row['atributos_json'], true) ?: [], ['id' => (string)$row['legacy_id'], 'name' => (string)$row['nome'], 'date' => (string)$row['data_evento'], 'mult' => (float)$row['multiplicador'], 'windowDays' => (int)$row['dias_janela']]), $eventQuery->fetchAll());

    $reportQuery = $db->prepare('SELECT dados_json FROM seasonal_reports WHERE business_id=? ORDER BY id');
    $reportQuery->execute([$businessId]);
    $fallback['eventReports'] = array_values(array_filter(array_map(static fn(array $row): mixed => json_decode((string)$row['dados_json'], true), $reportQuery->fetchAll()), 'is_array'));

    $invoiceQuery = $db->prepare('SELECT * FROM invoices_rel WHERE business_id=? ORDER BY emitida_em DESC, id DESC');
    $invoiceQuery->execute([$businessId]);
    $invoiceRows = $invoiceQuery->fetchAll();
    $invoiceItemsQuery = $db->prepare('SELECT sku_snapshot, nome_snapshot, quantidade, preco_unitario FROM invoice_items_rel WHERE business_id=? AND invoice_id=? ORDER BY id');
    $fallback['invoices'] = [];
    foreach ($invoiceRows as $invoice) {
        $invoiceItemsQuery->execute([$businessId, (int)$invoice['id']]);
        $fallback['invoices'][] = [
            'id' => (string)$invoice['legacy_id'], 'orderId' => (string)$invoice['order_legacy_id'], 'channel' => (string)$invoice['channel'],
            'key' => (string)$invoice['chave'], 'total' => (float)$invoice['total'], 'ts' => (int)$invoice['emitida_em'],
            'items' => array_map(static fn(array $item): array => ['sku' => (string)$item['sku_snapshot'], 'name' => (string)$item['nome_snapshot'], 'qty' => (int)$item['quantidade'], 'price' => (float)$item['preco_unitario']], $invoiceItemsQuery->fetchAll()),
        ];
    }

    $labelQuery = $db->prepare('SELECT legacy_id, order_legacy_id, channel, codigo_rastreio, destinatario, peso, criado_em FROM shipping_labels_rel WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $labelQuery->execute([$businessId]);
    $fallback['labels'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'orderId' => (string)$row['order_legacy_id'], 'channel' => (string)$row['channel'], 'trackingCode' => (string)$row['codigo_rastreio'], 'recipient' => (string)$row['destinatario'], 'weight' => (float)$row['peso'], 'ts' => (int)$row['criado_em']], $labelQuery->fetchAll());

    $messageQuery = $db->prepare('SELECT legacy_id, order_legacy_id, destinatario, telefone, mensagem, enviado_em FROM customer_messages WHERE business_id=? ORDER BY enviado_em DESC, id DESC');
    $messageQuery->execute([$businessId]);
    $fallback['messages'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'orderId' => (string)$row['order_legacy_id'], 'to' => (string)$row['destinatario'], 'phone' => (string)$row['telefone'], 'text' => (string)$row['mensagem'], 'ts' => (int)$row['enviado_em']], $messageQuery->fetchAll());

    $notificationQuery = $db->prepare('SELECT legacy_id, tipo, mensagem, rota, lida, criado_em FROM business_notifications WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $notificationQuery->execute([$businessId]);
    $fallback['notifications'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'type' => (string)$row['tipo'], 'text' => (string)$row['mensagem'], 'route' => (string)$row['rota'], 'read' => (bool)$row['lida'], 'ts' => (int)$row['criado_em']], $notificationQuery->fetchAll());

    $automationQuery = $db->prepare('SELECT legacy_id, regra, mensagem, criado_em FROM automation_logs WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $automationQuery->execute([$businessId]);
    $fallback['automationLog'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'rule' => (string)$row['regra'], 'text' => (string)$row['mensagem'], 'ts' => (int)$row['criado_em']], $automationQuery->fetchAll());

    $scanQuery = $db->prepare('SELECT legacy_id, tipo, sku, produto, local, lido_em FROM inventory_scans WHERE business_id=? ORDER BY lido_em DESC, id DESC');
    $scanQuery->execute([$businessId]);
    $fallback['scanLog'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'type' => (string)$row['tipo'], 'sku' => (string)$row['sku'], 'product' => (string)$row['produto'], 'location' => (string)$row['local'], 'ts' => (int)$row['lido_em']], $scanQuery->fetchAll());

    $lossQuery = $db->prepare('SELECT legacy_id, product_id, motivo, quantidade, valor, ocorrido_em FROM inventory_losses WHERE business_id=? ORDER BY ocorrido_em DESC, id DESC');
    $lossQuery->execute([$businessId]);
    $fallback['losses'] = array_map(static fn(array $row): array => ['id' => (string)$row['legacy_id'], 'productId' => $row['product_id'] ? ($productLegacyById[(int)$row['product_id']] ?? null) : null, 'reason' => (string)$row['motivo'], 'qty' => (int)$row['quantidade'], 'value' => (float)$row['valor'], 'ts' => (int)$row['ocorrido_em']], $lossQuery->fetchAll());

    $creditQuery = $db->prepare('SELECT codigo, cliente, order_legacy_id, valor_inicial, saldo, criado_em FROM store_credits WHERE business_id=? ORDER BY criado_em DESC, id DESC');
    $creditQuery->execute([$businessId]);
    $fallback['credits'] = array_map(static fn(array $row): array => ['code' => (string)$row['codigo'], 'customer' => (string)$row['cliente'], 'orderId' => (string)$row['order_legacy_id'], 'value' => (float)$row['valor_inicial'], 'balance' => (float)$row['saldo'], 'ts' => (int)$row['criado_em']], $creditQuery->fetchAll());

    $eventQuery = $db->prepare('SELECT legacy_id, nome, data_evento, multiplicador, dias_janela, atributos_json FROM seasonal_events WHERE business_id=? ORDER BY id');
    $eventQuery->execute([$businessId]);
    $fallback['customEvents'] = array_map(static fn(array $row): array => array_merge(json_decode((string)$row['atributos_json'], true) ?: [], ['id' => (string)$row['legacy_id'], 'name' => (string)$row['nome'], 'date' => (string)$row['data_evento'], 'mult' => (float)$row['multiplicador'], 'windowDays' => (int)$row['dias_janela']]), $eventQuery->fetchAll());

    $reportQuery = $db->prepare('SELECT dados_json FROM seasonal_reports WHERE business_id=? ORDER BY id');
    $reportQuery->execute([$businessId]);
    $fallback['eventReports'] = array_values(array_filter(array_map(static fn(array $row): mixed => json_decode((string)$row['dados_json'], true), $reportQuery->fetchAll()), 'is_array'));

    $preferenceQuery = $db->prepare('SELECT chave, valor FROM business_preferences WHERE business_id=?');
    $preferenceQuery->execute([$businessId]);
    foreach ($preferenceQuery->fetchAll() as $preference) {
        $key = (string)$preference['chave'];
        $value = json_decode((string)$preference['valor'], true) ?? $preference['valor'];
        $fallback[$key === 'sequences' ? 'seq' : $key] = $value;
    }

    return alignStateSequences($fallback);
}

// Garante que os contadores nunca fiquem atrás de um número já usado (ex.: após recriar os dados de exemplo).
function alignStateSequences(array $state): array {
    foreach (['order' => ['orders', 'PED-'], 'po' => ['purchaseOrders', 'PC-']] as $key => [$list, $prefix]) {
        $highest = (int)($state['seq'][$key] ?? 0);
        foreach ($state[$list] ?? [] as $entry) {
            $id = (string)($entry['id'] ?? '');
            if (str_starts_with($id, $prefix) && ctype_digit(substr($id, strlen($prefix)))) {
                $highest = max($highest, (int)substr($id, strlen($prefix)));
            }
        }
        if ($highest > 0) $state['seq'][$key] = $highest;
    }
    return $state;
}
