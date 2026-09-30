<?php
// Cotações: a tabela de preços (definida pelo administrador), as propostas que o consultor monta
// e o aceite do cliente pelo link público (proposta.php?t=...).
//
// Como o preço é formado:
//   mensal = plano (plataforma) + integração de cada canal/marketplace escolhido
//            + módulos fora do plano + lojas físicas além do plano − desconto
//   único  = cadastro dos produtos em cada canal (produtos × taxa do canal) + implantação

const QUOTE_STATUS = ['rascunho' => 'Rascunho', 'aprovacao' => 'Aguardando aprovação', 'enviada' => 'Enviada', 'aceita' => 'Aceita', 'recusada' => 'Recusada', 'vencida' => 'Vencida'];
// Mesmos canais do painel (wedtech-core.js): nome e tipo
const QUOTE_CHANNELS = [
    'site' => ['Site próprio', 'proprio'],
    'whats' => ['WhatsApp / Instagram', 'social'],
    'ml' => ['Mercado Livre', 'marketplace'],
    'shopee' => ['Shopee', 'marketplace'],
    'magalu' => ['Magalu', 'marketplace'],
    'amazon' => ['Amazon', 'marketplace'],
    'tiktok' => ['TikTok Shop', 'marketplace'],
    'shein' => ['Shein', 'marketplace'],
    'ifood' => ['iFood', 'delivery'],
    'rappi' => ['Rappi', 'delivery'],
    'food99' => ['99Food', 'delivery'],
];
const QUOTE_CHANNELS_BY_TYPE = [
    'moda' => ['site', 'whats', 'ml', 'shopee', 'shein', 'tiktok', 'magalu'],
    'alimentacao' => ['site', 'whats', 'ifood', 'rappi', 'food99', 'ml', 'amazon'],
    'eletronicos' => ['site', 'whats', 'ml', 'shopee', 'amazon', 'magalu', 'tiktok'],
];
const DEFAULT_PRICE_TABLE = [
    'planos' => ['basico' => 149.0, 'profissional' => 299.0, 'avancado' => 549.0],
    'canais' => [
        'site' => ['mensal' => 49.0, 'cadastro' => 0.9],
        'whats' => ['mensal' => 0.0, 'cadastro' => 0.0],
        'ml' => ['mensal' => 79.0, 'cadastro' => 4.9],
        'shopee' => ['mensal' => 69.0, 'cadastro' => 3.9],
        'magalu' => ['mensal' => 79.0, 'cadastro' => 4.9],
        'amazon' => ['mensal' => 89.0, 'cadastro' => 5.9],
        'tiktok' => ['mensal' => 59.0, 'cadastro' => 3.9],
        'shein' => ['mensal' => 69.0, 'cadastro' => 4.9],
        'ifood' => ['mensal' => 59.0, 'cadastro' => 2.9],
        'rappi' => ['mensal' => 49.0, 'cadastro' => 2.9],
        'food99' => ['mensal' => 39.0, 'cadastro' => 2.9],
    ],
    'modulos' => ['automacoes' => 79.0, 'iot' => 149.0, 'etiquetas' => 99.0],
    'loja_extra' => 99.0,
    'implantacao' => 490.0,
    'desconto_max' => 10.0,
    'validade_dias' => 7,
    // Dados da WedTech (contratada) que aparecem no contrato; o administrador completa
    'empresa' => ['razao' => 'WedTech', 'cnpj' => '', 'endereco' => '', 'email' => '', 'foro' => ''],
];

function createQuotesSchema(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        consultor_id INTEGER NOT NULL,
        lead_id INTEGER,
        business_id INTEGER,
        status TEXT NOT NULL DEFAULT 'rascunho',
        cliente_json TEXT NOT NULL DEFAULT '{}',
        config_json TEXT NOT NULL DEFAULT '{}',
        resultado_json TEXT NOT NULL DEFAULT '{}',
        plano TEXT NOT NULL DEFAULT 'profissional',
        mensal_total REAL NOT NULL DEFAULT 0,
        unico_total REAL NOT NULL DEFAULT 0,
        desconto_pct REAL NOT NULL DEFAULT 0,
        validade TEXT,
        observacoes TEXT NOT NULL DEFAULT '',
        aceite_nome TEXT NOT NULL DEFAULT '',
        recusa_motivo TEXT NOT NULL DEFAULT '',
        respondido_em DATETIME,
        enviada_em DATETIME,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_quotes_consultor ON quotes (consultor_id, status)');
    // Registro do aceite eletrônico (código derivado do endereço e do navegador de quem aceitou)
    addColumnIfMissing($db, 'quotes', 'aceite_registro', "TEXT NOT NULL DEFAULT ''");
}

// ---------------------------------------------------------------------------
// Tabela de preços
function priceTable(PDO $db): array {
    $stmt = $db->prepare("SELECT valor FROM settings WHERE chave = 'tabela_precos'");
    $stmt->execute();
    $saved = json_decode((string)$stmt->fetchColumn(), true) ?: [];
    return sanitizePriceTable($saved, DEFAULT_PRICE_TABLE);
}
function sanitizePriceTable(array $in, array $base): array {
    $money = static fn($v, $fallback) => is_numeric($v) ? max(0, min(100000, round((float)$v, 2))) : (float)$fallback;
    $out = $base;
    foreach ($base['planos'] as $k => $v) $out['planos'][$k] = $money($in['planos'][$k] ?? null, $v);
    foreach ($base['canais'] as $k => $v) {
        $out['canais'][$k] = ['mensal' => $money($in['canais'][$k]['mensal'] ?? null, $v['mensal']), 'cadastro' => $money($in['canais'][$k]['cadastro'] ?? null, $v['cadastro'])];
    }
    foreach ($base['modulos'] as $k => $v) $out['modulos'][$k] = $money($in['modulos'][$k] ?? null, $v);
    $out['loja_extra'] = $money($in['loja_extra'] ?? null, $base['loja_extra']);
    $out['implantacao'] = $money($in['implantacao'] ?? null, $base['implantacao']);
    $out['desconto_max'] = is_numeric($in['desconto_max'] ?? null) ? max(0, min(100, round((float)$in['desconto_max'], 1))) : $base['desconto_max'];
    $out['validade_dias'] = is_numeric($in['validade_dias'] ?? null) ? max(1, min(90, (int)$in['validade_dias'])) : $base['validade_dias'];
    $limits = ['razao' => 120, 'cnpj' => 20, 'endereco' => 200, 'email' => 120, 'foro' => 80];
    foreach ($limits as $k => $max) {
        $out['empresa'][$k] = isset($in['empresa'][$k]) && is_string($in['empresa'][$k]) ? cleanText($in['empresa'][$k], $max) : (string)($base['empresa'][$k] ?? '');
    }
    return $out;
}
function savePriceTable(PDO $db, array $admin, array $input): array {
    if (!isAdmin($admin)) throw new DomainException('Só o administrador altera a tabela de preços.');
    $table = sanitizePriceTable($input, priceTable($db));
    $db->prepare("INSERT INTO settings (chave, valor) VALUES ('tabela_precos', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")->execute([json_encode($table)]);
    audit($db, (int)$admin['id'], null, 'precos_alterados', 'Tabela de preços atualizada');
    return $table;
}

// ---------------------------------------------------------------------------
// Cálculo (o servidor é a fonte da verdade: a tela só mostra o que ele devolve)
function quoteChannelsFor(string $type): array {
    return QUOTE_CHANNELS_BY_TYPE[$type] ?? QUOTE_CHANNELS_BY_TYPE['moda'];
}
function isExternalChannel(string $id): bool {
    return in_array(QUOTE_CHANNELS[$id][1] ?? '', ['marketplace', 'delivery'], true);
}
function brl(float $v): string {
    return 'R$ ' . number_format($v, 2, ',', '.');
}
// Mensalidade de um plano para a necessidade informada (sem desconto)
function quoteMonthly(array $table, string $plan, array $channels, int $shops, array $modules): array {
    $lines = [['Plano ' . PLAN_NAMES[$plan] . ' (plataforma WedTech)', $table['planos'][$plan]]];
    foreach ($channels as $c) {
        $lines[] = ['Integração ' . QUOTE_CHANNELS[$c][0], $table['canais'][$c]['mensal']];
    }
    foreach ($modules as $k => $on) {
        if ($on && empty(PLAN_MODULES[$plan][$k])) $lines[] = ['Módulo ' . STORE_MODULES[$k], $table['modulos'][$k]];
    }
    $extraShops = max(0, $shops - PLAN_LIMITS[$plan]['maxShops']);
    if ($extraShops) $lines[] = [$extraShops . ($extraShops === 1 ? ' loja física extra' : ' lojas físicas extras'), round($extraShops * $table['loja_extra'], 2)];
    return $lines;
}
function quoteCompute(array $table, array $in): array {
    $type = isset(STORE_TYPES[$in['tipo'] ?? '']) ? (string)$in['tipo'] : 'moda';
    $wanted = array_map('strval', (array)($in['canais'] ?? []));
    $channels = array_values(array_filter(quoteChannelsFor($type), static fn($c) => in_array($c, $wanted, true)));
    $shops = max(0, min(50, (int)($in['lojas'] ?? 1)));
    $products = max(0, min(100000, (int)($in['produtos'] ?? 0)));
    $modules = [];
    foreach (STORE_MODULES as $k => $_) $modules[$k] = !empty($in['modulos'][$k]);
    $external = count(array_filter($channels, 'isExternalChannel'));
    $channelCount = count($channels) + ($shops > 0 ? 1 : 0);

    // Plano sugerido: o mais barato que comporta os canais e marketplaces pedidos
    $suggested = null;
    $best = INF;
    foreach (PLAN_LIMITS as $plan => $lim) {
        if ($channelCount > $lim['maxChannels'] || $external > $lim['maxMarketplaces']) continue;
        $sum = array_sum(array_column(quoteMonthly($table, $plan, $channels, $shops, $modules), 1));
        if ($sum < $best) {
            $best = $sum;
            $suggested = $plan;
        }
    }
    $suggested ??= 'avancado';
    $plan = isset(PLAN_LIMITS[$in['plano'] ?? '']) ? (string)$in['plano'] : $suggested;

    $monthly = quoteMonthly($table, $plan, $channels, $shops, $modules);
    $subtotal = round(array_sum(array_column($monthly, 1)), 2);
    $discount = max(0, min(100, round((float)($in['desconto'] ?? 0), 1)));
    $discountValue = round($subtotal * $discount / 100, 2);
    if ($discountValue > 0) $monthly[] = ['Desconto de ' . str_replace('.', ',', (string)$discount) . '% na mensalidade', -$discountValue];

    $once = [];
    if ($products > 0) {
        foreach ($channels as $c) {
            $fee = $table['canais'][$c]['cadastro'];
            if ($fee > 0) $once[] = [QUOTE_CHANNELS[$c][0] . ': cadastro de ' . $products . ($products === 1 ? ' produto' : ' produtos') . ' (' . brl($fee) . ' cada)', round($products * $fee, 2)];
        }
    }
    $setup = !array_key_exists('implantacao', $in) || !empty($in['implantacao']);
    if ($setup && $table['implantacao'] > 0) $once[] = ['Implantação e treinamento da equipe', $table['implantacao']];

    $lim = PLAN_LIMITS[$plan];
    $finalModules = [];
    foreach (STORE_MODULES as $k => $_) $finalModules[$k] = !empty(PLAN_MODULES[$plan][$k]) || $modules[$k];
    $monthlyTotal = round($subtotal - $discountValue, 2);
    $onceTotal = round(array_sum(array_column($once, 1)), 2);
    $trial = max(0, min(60, (int)($in['teste_dias'] ?? 14)));

    return [
        'config' => ['tipo' => $type, 'canais' => $channels, 'lojas' => $shops, 'produtos' => $products, 'modulos' => $modules, 'plano' => isset(PLAN_LIMITS[$in['plano'] ?? '']) ? $plan : 'auto', 'desconto' => $discount, 'implantacao' => $setup, 'teste_dias' => $trial],
        'plano' => $plan,
        'plano_sugerido' => $suggested,
        'mensal' => $monthly,
        'mensal_total' => $monthlyTotal,
        'unico' => $once,
        'unico_total' => $onceTotal,
        'primeiro_pagamento' => round(($trial ? 0 : $monthlyTotal) + $onceTotal, 2),
        'desconto' => $discount,
        'precisa_aprovacao' => $discount > $table['desconto_max'],
        'teste_dias' => $trial,
        'limites' => [
            'maxChannels' => max($lim['maxChannels'], $channelCount),
            'maxMarketplaces' => max($lim['maxMarketplaces'], $external),
            'maxShops' => max($lim['maxShops'], $shops),
        ],
        'modulos' => $finalModules,
    ];
}
// ---------------------------------------------------------------------------
// Cotações do consultor
function quoteClient(array $in): array {
    $client = [
        'nome' => cleanText($in['nome'] ?? '', 80),
        'loja' => cleanText($in['loja'] ?? '', 80),
        'email' => strtolower(cleanText($in['email'] ?? '', 120)),
        'whatsapp' => cleanText($in['whatsapp'] ?? '', 20),
        'cnpj' => cleanText($in['cnpj'] ?? '', 20),
        'endereco' => cleanText($in['endereco'] ?? '', 160),
    ];
    if (mb_strlen($client['nome']) < 2) throw new InvalidArgumentException('Informe o nome do cliente.');
    if (mb_strlen($client['loja']) < 2) throw new InvalidArgumentException('Informe o nome da loja do cliente.');
    if ($client['email'] !== '' && !filter_var($client['email'], FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('O e-mail do cliente não é válido.');
    return $client;
}
function quoteRow(PDO $db, int $id): array {
    $stmt = $db->prepare('SELECT q.*, u.nome AS consultor_nome, u.email AS consultor_email FROM quotes q LEFT JOIN users u ON u.id = q.consultor_id WHERE q.id = ?');
    $stmt->execute([$id]);
    $q = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$q) throw new DomainException('Cotação não encontrada.');
    return $q;
}
function requireQuoteAccess(array $staff, array $q): void {
    if (!isAdmin($staff) && (int)$q['consultor_id'] !== (int)$staff['id']) throw new DomainException('Esta cotação é de outro consultor.');
}
// Enviada e com a validade passada vira "vencida" (sem precisar de rotina agendada)
function quoteEffectiveStatus(array $q): string {
    return $q['status'] === 'enviada' && $q['validade'] && $q['validade'] < date('Y-m-d') ? 'vencida' : $q['status'];
}
function quotePublic(array $q): array {
    return [
        'id' => (int)$q['id'],
        'token' => $q['token'],
        'status' => quoteEffectiveStatus($q),
        'cliente' => json_decode($q['cliente_json'], true) ?: [],
        'resultado' => json_decode($q['resultado_json'], true) ?: [],
        'plano' => $q['plano'],
        'mensal_total' => (float)$q['mensal_total'],
        'unico_total' => (float)$q['unico_total'],
        'desconto_pct' => (float)$q['desconto_pct'],
        'validade' => $q['validade'],
        'observacoes' => $q['observacoes'],
        'aceite_nome' => $q['aceite_nome'],
        'aceite_registro' => $q['aceite_registro'] ?? '',
        'recusa_motivo' => $q['recusa_motivo'],
        'respondido_em' => $q['respondido_em'],
        'enviada_em' => $q['enviada_em'],
        'criado_em' => $q['criado_em'],
        'atualizado_em' => $q['atualizado_em'],
        'consultor_nome' => $q['consultor_nome'] ?? '',
        'consultor_email' => $q['consultor_email'] ?? '',
    ];
}
function listQuotes(PDO $db, array $staff): array {
    $where = isAdmin($staff) ? '' : 'WHERE q.consultor_id = ' . (int)$staff['id'];
    $rows = $db->query("SELECT q.*, u.nome AS consultor_nome, u.email AS consultor_email FROM quotes q LEFT JOIN users u ON u.id = q.consultor_id $where ORDER BY q.atualizado_em DESC, q.id DESC LIMIT 300")->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static function (array $q): array {
        $p = quotePublic($q);
        unset($p['resultado']);
        return $p + ['business_id' => $q['business_id'] ? (int)$q['business_id'] : null, 'lead_id' => $q['lead_id'] ? (int)$q['lead_id'] : null];
    }, $rows);
}
function getQuote(PDO $db, array $staff, int $id): array {
    $q = quoteRow($db, $id);
    requireQuoteAccess($staff, $q);
    return quotePublic($q) + [
        'config' => json_decode($q['config_json'], true) ?: [],
        'lead_id' => $q['lead_id'] ? (int)$q['lead_id'] : null,
        'business_id' => $q['business_id'] ? (int)$q['business_id'] : null,
    ];
}
function saveQuote(PDO $db, array $staff, int $id, array $input): array {
    $client = quoteClient((array)($input['cliente'] ?? []));
    $result = quoteCompute(priceTable($db), (array)($input['config'] ?? []));
    $notes = cleanText($input['observacoes'] ?? '', 600);
    $leadId = !empty($input['lead_id']) ? (int)$input['lead_id'] : null;
    if ($id) {
        $q = quoteRow($db, $id);
        requireQuoteAccess($staff, $q);
        if (in_array($q['status'], ['aceita', 'recusada'], true)) throw new DomainException('Esta cotação já foi respondida pelo cliente. Crie uma nova.');
        // Mudou a proposta: volta para rascunho e precisa ser enviada de novo
        $db->prepare("UPDATE quotes SET status = 'rascunho', cliente_json = ?, config_json = ?, resultado_json = ?, plano = ?, mensal_total = ?, unico_total = ?, desconto_pct = ?, observacoes = ?, validade = NULL, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
            ->execute([json_encode($client), json_encode($result['config']), json_encode($result), $result['plano'], $result['mensal_total'], $result['unico_total'], $result['desconto'], $notes, $id]);
    } else {
        $db->prepare('INSERT INTO quotes (token, consultor_id, lead_id, cliente_json, config_json, resultado_json, plano, mensal_total, unico_total, desconto_pct, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([bin2hex(random_bytes(16)), (int)$staff['id'], $leadId, json_encode($client), json_encode($result['config']), json_encode($result), $result['plano'], $result['mensal_total'], $result['unico_total'], $result['desconto'], $notes]);
        $id = (int)$db->lastInsertId();
        audit($db, (int)$staff['id'], null, 'cotacao_criada', 'Cotação #' . $id . ' · ' . $client['loja'] . ' · ' . brl($result['mensal_total']) . '/mês');
    }
    return getQuote($db, $staff, $id);
}
function sendQuote(PDO $db, array $staff, int $id): array {
    $q = quoteRow($db, $id);
    requireQuoteAccess($staff, $q);
    if (!in_array(quoteEffectiveStatus($q), ['rascunho', 'aprovacao', 'vencida'], true)) throw new DomainException('Esta cotação já foi enviada.');
    $table = priceTable($db);
    $needsApproval = (float)$q['desconto_pct'] > $table['desconto_max'];
    if ($needsApproval && !isAdmin($staff)) {
        $db->prepare("UPDATE quotes SET status = 'aprovacao', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")->execute([$id]);
        audit($db, (int)$staff['id'], null, 'cotacao_aprovacao', 'Cotação #' . $id . ' com ' . $q['desconto_pct'] . '% de desconto aguarda o administrador');
        return getQuote($db, $staff, $id);
    }
    $db->prepare("UPDATE quotes SET status = 'enviada', validade = ?, enviada_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")
        ->execute([date('Y-m-d', time() + $table['validade_dias'] * 86400), $id]);
    if ($q['lead_id']) {
        $db->prepare("UPDATE leads SET status = 'proposta', consultor_id = COALESCE(consultor_id, ?), atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('novo', 'conversa')")->execute([(int)$q['consultor_id'], (int)$q['lead_id']]);
    }
    audit($db, (int)$staff['id'], null, $q['status'] === 'aprovacao' ? 'cotacao_aprovada' : 'cotacao_enviada', 'Cotação #' . $id . ' · ' . brl((float)$q['mensal_total']) . '/mês');
    return getQuote($db, $staff, $id);
}
function quoteByToken(PDO $db, string $token): ?array {
    if (!preg_match('/^[a-f0-9]{32}$/', $token)) return null;
    $stmt = $db->prepare('SELECT q.*, u.nome AS consultor_nome, u.email AS consultor_email FROM quotes q LEFT JOIN users u ON u.id = q.consultor_id WHERE q.token = ?');
    $stmt->execute([$token]);
    $q = $stmt->fetch(PDO::FETCH_ASSOC);
    return $q ?: null;
}
// Resposta do cliente pelo link: aceitar (com o nome de quem aceita) ou recusar
function respondQuote(PDO $db, string $token, string $answer, string $name, string $reason, string $origin = ''): array {
    $q = quoteByToken($db, $token);
    if (!$q) throw new DomainException('Proposta não encontrada.');
    $status = quoteEffectiveStatus($q);
    if ($status === 'vencida') throw new DomainException('Esta proposta venceu. Peça uma nova ao seu consultor.');
    if ($status !== 'enviada') throw new DomainException('Esta proposta não está aberta para resposta.');
    if ($answer === 'aceitar') {
        $name = cleanText($name, 80);
        if (mb_strlen($name) < 3) throw new InvalidArgumentException('Escreva seu nome completo para aceitar.');
        $record = strtoupper(substr(hash('sha256', $q['token'] . '|' . $name . '|' . $origin . '|' . microtime(true)), 0, 16));
        $db->prepare("UPDATE quotes SET status = 'aceita', aceite_nome = ?, aceite_registro = ?, respondido_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")->execute([$name, $record, (int)$q['id']]);
        audit($db, (int)$q['consultor_id'], null, 'cotacao_aceita', 'Cotação #' . $q['id'] . ' aceita pelo cliente ' . $name);
    } elseif ($answer === 'recusar') {
        $db->prepare("UPDATE quotes SET status = 'recusada', recusa_motivo = ?, respondido_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")->execute([cleanText($reason, 400), (int)$q['id']]);
        audit($db, (int)$q['consultor_id'], null, 'cotacao_recusada', 'Cotação #' . $q['id'] . ' recusada pelo cliente');
    } else {
        throw new InvalidArgumentException('Resposta inválida.');
    }
    return quotePublic(quoteByToken($db, $token));
}
// Cotação aceita → a loja nasce com o que foi contratado (plano, limites e módulos)
function applyQuoteToStore(PDO $db, array $staff, int $quoteId, int $businessId): void {
    $q = quoteRow($db, $quoteId);
    requireQuoteAccess($staff, $q);
    if ($q['status'] !== 'aceita') throw new DomainException('Só dá para cadastrar a loja de uma cotação aceita.');
    if ($q['business_id']) throw new DomainException('Esta cotação já virou uma loja.');
    $result = json_decode($q['resultado_json'], true) ?: [];
    $db->prepare('UPDATE businesses SET plano = ?, limites_json = ?, modulos_json = ?, valor_mensal = ? WHERE id = ?')
        ->execute([$result['plano'] ?? $q['plano'], json_encode((object)($result['limites'] ?? [])), json_encode($result['modulos'] ?? PLAN_MODULES[$q['plano']]), (float)$q['mensal_total'], $businessId]);
    $db->prepare('UPDATE quotes SET business_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')->execute([$businessId, $quoteId]);
    if ($q['lead_id']) {
        $db->prepare("UPDATE leads SET status = 'fechado', business_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")->execute([$businessId, (int)$q['lead_id']]);
    }
}
