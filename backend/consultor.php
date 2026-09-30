<?php
// Área do consultor WedTech: perfis de acesso, cadastro de lojas pelo consultor, contrato
// (plano, limites, módulos, situação), contatos do site, chamados de suporte, modo suporte
// (somente leitura) e registro de ações.
//
// Perfis (users.papel): "lojista" usa o painel da loja; "consultor" atende as lojas dele;
// "admin" vê todas as lojas e cadastra consultores.

const USER_ROLES = ['lojista', 'consultor', 'admin'];
const STORE_STATUS = ['teste' => 'Em teste', 'ativa' => 'Ativa', 'suspensa' => 'Suspensa', 'cancelada' => 'Cancelada'];
const LEAD_STATUS = ['novo' => 'Novo', 'conversa' => 'Em conversa', 'proposta' => 'Proposta enviada', 'fechado' => 'Fechado', 'perdido' => 'Perdido'];
const TICKET_STATUS = ['aberto' => 'Aberto', 'em_atendimento' => 'Em atendimento', 'resolvido' => 'Resolvido'];
const STORE_TYPES = ['moda' => 'Moda e calçados', 'alimentacao' => 'Alimentação e empório', 'eletronicos' => 'Eletrônicos e acessórios'];
const PLAN_NAMES = ['basico' => 'Básico', 'profissional' => 'Profissional', 'avancado' => 'Avançado'];
// Limites padrão de cada plano (espelham "plans" do painel) e módulos incluídos
const PLAN_LIMITS = [
    'basico' => ['maxChannels' => 3, 'maxMarketplaces' => 1, 'maxShops' => 1],
    'profissional' => ['maxChannels' => 6, 'maxMarketplaces' => 3, 'maxShops' => 2],
    'avancado' => ['maxChannels' => 8, 'maxMarketplaces' => 5, 'maxShops' => 5],
];
const STORE_MODULES = ['automacoes' => 'Automações com IA', 'iot' => 'Dispositivos (IoT)', 'etiquetas' => 'Etiquetas eletrônicas'];
const PLAN_MODULES = [
    'basico' => ['automacoes' => false, 'iot' => false, 'etiquetas' => false],
    'profissional' => ['automacoes' => true, 'iot' => false, 'etiquetas' => false],
    'avancado' => ['automacoes' => true, 'iot' => true, 'etiquetas' => true],
];
require_once __DIR__ . '/cotacoes.php';
const DEMO_ADMIN_EMAIL = 'adm@wedtech.com';
const DEMO_ADMIN_PASSWORD = 'adm123';

function tableColumns(PDO $db, string $table): array {
    return array_column($db->query('PRAGMA table_info(' . $table . ')')->fetchAll(PDO::FETCH_ASSOC), 'name');
}
function addColumnIfMissing(PDO $db, string $table, string $column, string $definition): void {
    if (!in_array($column, tableColumns($db, $table), true)) {
        $db->exec("ALTER TABLE $table ADD COLUMN $column $definition");
    }
}

// Versão 3 do banco: perfis, contrato da loja, funil de contatos, chamados e auditoria
function createConsultorSchema(PDO $db): void {
    addColumnIfMissing($db, 'users', 'papel', "TEXT NOT NULL DEFAULT 'lojista'");
    addColumnIfMissing($db, 'users', 'trocar_senha', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing($db, 'users', 'ativo', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing($db, 'users', 'ultimo_acesso', 'DATETIME');
    $newBusinessColumns = !in_array('situacao', tableColumns($db, 'businesses'), true);
    addColumnIfMissing($db, 'businesses', 'situacao', "TEXT NOT NULL DEFAULT 'ativa'");
    addColumnIfMissing($db, 'businesses', 'consultor_id', 'INTEGER');
    addColumnIfMissing($db, 'businesses', 'valor_mensal', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing($db, 'businesses', 'teste_ate', 'TEXT');
    addColumnIfMissing($db, 'businesses', 'limites_json', "TEXT NOT NULL DEFAULT '{}'");
    addColumnIfMissing($db, 'businesses', 'modulos_json', "TEXT NOT NULL DEFAULT '{}'");
    addColumnIfMissing($db, 'businesses', 'observacoes', "TEXT NOT NULL DEFAULT ''");
    if ($newBusinessColumns) {
        // Lojas que já existiam antes da área do consultor mantêm tudo liberado
        $db->exec('UPDATE businesses SET modulos_json = \'{"automacoes":true,"iot":true,"etiquetas":true}\'');
    }
    addColumnIfMissing($db, 'leads', 'status', "TEXT NOT NULL DEFAULT 'novo'");
    addColumnIfMissing($db, 'leads', 'consultor_id', 'INTEGER');
    addColumnIfMissing($db, 'leads', 'notas', "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing($db, 'leads', 'business_id', 'INTEGER');
    addColumnIfMissing($db, 'leads', 'atualizado_em', 'DATETIME');
    $db->exec("CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER NOT NULL,
        aberto_por INTEGER NOT NULL,
        assunto TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'aberto',
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS support_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        autor_id INTEGER NOT NULL,
        autor_papel TEXT NOT NULL,
        texto TEXT NOT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ator_id INTEGER NOT NULL,
        business_id INTEGER,
        acao TEXT NOT NULL,
        detalhe TEXT NOT NULL DEFAULT '',
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_tickets_business ON support_tickets (business_id, status)');
    $db->exec('CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_log (business_id, criado_em DESC)');
    // Conta de administrador para a demonstração
    $hasAdmin = (int)$db->query("SELECT COUNT(*) FROM users WHERE papel = 'admin'")->fetchColumn();
    if (!$hasAdmin) {
        $stmt = $db->prepare("INSERT OR IGNORE INTO users (nome, email, senha, cargo, papel) VALUES ('Administrador WedTech', :email, :senha, 'Administrador WedTech', 'admin')");
        $stmt->execute([':email' => DEMO_ADMIN_EMAIL, ':senha' => password_hash(DEMO_ADMIN_PASSWORD, PASSWORD_DEFAULT)]);
    }
    // Loja sem consultor (criada antes desta área ou pelo próprio painel) fica com o administrador
    $db->exec("UPDATE businesses SET consultor_id = (SELECT MIN(id) FROM users WHERE papel = 'admin') WHERE consultor_id IS NULL");
    $db->exec('INSERT OR IGNORE INTO schema_migrations (version) VALUES (3)');
    // Versão 4: última mensagem que cada lado viu (não lidas) e cotações
    $newSeenColumns = !in_array('visto_staff', tableColumns($db, 'support_tickets'), true);
    addColumnIfMissing($db, 'support_tickets', 'visto_lojista', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing($db, 'support_tickets', 'visto_staff', 'INTEGER NOT NULL DEFAULT 0');
    if ($newSeenColumns) {
        // Conversas anteriores contam como lidas: só mensagens novas acendem o aviso
        $db->exec('UPDATE support_tickets SET visto_lojista = COALESCE((SELECT MAX(id) FROM support_messages m WHERE m.ticket_id = support_tickets.id), 0), visto_staff = COALESCE((SELECT MAX(id) FROM support_messages m WHERE m.ticket_id = support_tickets.id), 0)');
    }
    createQuotesSchema($db);
    $db->exec('INSERT OR IGNORE INTO schema_migrations (version) VALUES (4)');
}

// ---------------------------------------------------------------------------
// Perfis e escopo
function isStaff(?array $user): bool {
    return in_array($user['papel'] ?? '', ['consultor', 'admin'], true);
}
function isAdmin(?array $user): bool {
    return ($user['papel'] ?? '') === 'admin';
}
// A loja precisa existir; consultor só mexe nas lojas dele e o administrador em todas
function requireBusinessAccess(PDO $db, array $staff, int $businessId): void {
    $stmt = $db->prepare('SELECT consultor_id FROM businesses WHERE id = ?');
    $stmt->execute([$businessId]);
    $consultantId = $stmt->fetchColumn();
    if ($consultantId === false) {
        throw new DomainException('Loja não encontrada.');
    }
    if (!isAdmin($staff) && (int)$consultantId !== (int)$staff['id']) {
        throw new DomainException('Esta loja é atendida por outro consultor.');
    }
}
function audit(PDO $db, int $actorId, ?int $businessId, string $action, string $detail = ''): void {
    $stmt = $db->prepare('INSERT INTO audit_log (ator_id, business_id, acao, detalhe) VALUES (?, ?, ?, ?)');
    $stmt->execute([$actorId, $businessId, $action, mb_substr($detail, 0, 400)]);
}
function temporaryPassword(): string {
    $chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    $out = '';
    for ($i = 0; $i < 8; $i++) $out .= $chars[random_int(0, strlen($chars) - 1)];
    return $out;
}
// CNPJ com 14 dígitos e dígitos verificadores corretos (aceita com ou sem pontuação)
function cnpjValid(string $value): bool {
    $d = preg_replace('/\D/', '', $value);
    if (strlen($d) !== 14 || preg_match('/^(\d)\1{13}$/', $d)) return false;
    foreach ([12 => [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], 13 => [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]] as $pos => $weights) {
        $sum = 0;
        foreach ($weights as $i => $w) $sum += $w * (int)$d[$i];
        $rest = $sum % 11;
        if ((int)$d[$pos] !== ($rest < 2 ? 0 : 11 - $rest)) return false;
    }
    return true;
}
function cleanText(mixed $value, int $max): string {
    return mb_substr(trim(preg_replace('/\s+/', ' ', (string)$value)), 0, $max);
}

// ---------------------------------------------------------------------------
// Contrato da loja: o que o consultor liberou vale mais do que o estado salvo pelo painel
function businessContract(PDO $db, int $ownerUserId): ?array {
    $stmt = $db->prepare('SELECT b.*, u.nome AS consultor_nome, u.email AS consultor_email FROM businesses b LEFT JOIN users u ON u.id = b.consultor_id WHERE b.owner_user_id = ?');
    $stmt->execute([$ownerUserId]);
    $b = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$b) return null;
    $plan = isset(PLAN_LIMITS[$b['plano']]) ? $b['plano'] : 'profissional';
    $limits = array_merge(PLAN_LIMITS[$plan], array_map('intval', array_intersect_key(json_decode($b['limites_json'] ?: '{}', true) ?: [], PLAN_LIMITS[$plan])));
    $modules = array_merge(PLAN_MODULES[$plan], array_map('boolval', array_intersect_key(json_decode($b['modulos_json'] ?: '{}', true) ?: [], STORE_MODULES)));
    return [
        'businessId' => (int)$b['id'],
        'plan' => $plan,
        'limits' => $limits,
        'modules' => $modules,
        'status' => $b['situacao'],
        'trialUntil' => $b['teste_ate'],
        'consultant' => $b['consultor_id'] ? ['name' => $b['consultor_nome'], 'email' => $b['consultor_email']] : null,
    ];
}
function applyBusinessContract(PDO $db, int $ownerUserId, array $data): array {
    $contract = businessContract($db, $ownerUserId);
    if (!$contract) return $data;
    $data['plan'] = $contract['plan'];
    $data['planLimits'] = $contract['limits'];
    $data['modules'] = $contract['modules'];
    $data['account'] = ['status' => $contract['status'], 'trialUntil' => $contract['trialUntil'], 'consultant' => $contract['consultant']];
    return $data;
}
// Loja cadastrada pelo consultor e ainda não aberta: o painel já começa com os dados dela
function businessProvision(PDO $db, int $ownerUserId): ?array {
    $stmt = $db->prepare('SELECT tipo, nome, responsavel, cnpj, endereco, whatsapp, plano FROM businesses WHERE owner_user_id = ?');
    $stmt->execute([$ownerUserId]);
    $b = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$b) return null;
    return ['tipo' => $b['tipo'], 'plan' => $b['plano'], 'store' => ['name' => $b['nome'], 'owner' => $b['responsavel'], 'cnpj' => $b['cnpj'], 'address' => $b['endereco'], 'whatsapp' => $b['whatsapp']]];
}

// ---------------------------------------------------------------------------
// Lojas
function listStores(PDO $db, array $staff): array {
    $where = isAdmin($staff) ? '' : 'WHERE b.consultor_id = ' . (int)$staff['id'];
    $since = time() * 1000 - 7 * 86400000;
    $rows = $db->query(
        "SELECT b.id, b.nome, b.tipo, b.plano, b.situacao, b.valor_mensal, b.teste_ate, b.consultor_id, c.nome AS consultor_nome,
                o.email AS dono_email, o.nome AS dono_nome, o.ultimo_acesso,
                (SELECT COUNT(*) FROM sales_channels sc WHERE sc.business_id = b.id AND sc.conectado = 1) AS canais,
                (SELECT COUNT(*) FROM orders_rel r WHERE r.business_id = b.id AND r.ocorrido_em >= $since) AS pedidos_7d,
                (SELECT COALESCE(SUM(r.total), 0) FROM orders_rel r WHERE r.business_id = b.id AND r.ocorrido_em >= $since) AS vendas_7d,
                (SELECT COUNT(*) FROM support_tickets t WHERE t.business_id = b.id AND t.status <> 'resolvido') AS chamados_abertos
         FROM businesses b JOIN users o ON o.id = b.owner_user_id LEFT JOIN users c ON c.id = b.consultor_id $where ORDER BY b.nome"
    )->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn(array $r): array => $r + ['saude' => storeHealth($r)], $rows);
}
// Termômetro simples: vendeu na semana, tem chamado aberto, acessou recentemente
function storeHealth(array $r): string {
    if (in_array($r['situacao'], ['suspensa', 'cancelada'], true)) return 'parada';
    if ((int)$r['chamados_abertos'] > 0 || !$r['ultimo_acesso'] || strtotime($r['ultimo_acesso']) < time() - 7 * 86400) return 'atencao';
    return (int)$r['pedidos_7d'] > 0 ? 'boa' : 'atencao';
}
function getStore(PDO $db, array $staff, int $businessId): array {
    requireBusinessAccess($db, $staff, $businessId);
    $stmt = $db->prepare('SELECT b.*, o.id AS dono_id, o.nome AS dono_nome, o.email AS dono_email, o.ultimo_acesso, o.trocar_senha, c.nome AS consultor_nome FROM businesses b JOIN users o ON o.id = b.owner_user_id LEFT JOIN users c ON c.id = b.consultor_id WHERE b.id = ?');
    $stmt->execute([$businessId]);
    $b = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$b) throw new DomainException('Loja não encontrada.');
    $contract = businessContract($db, (int)$b['dono_id']);
    $tickets = $db->prepare('SELECT id, assunto, status, criado_em, atualizado_em FROM support_tickets WHERE business_id = ? ORDER BY atualizado_em DESC LIMIT 20');
    $tickets->execute([$businessId]);
    $history = $db->prepare('SELECT a.acao, a.detalhe, a.criado_em, u.nome AS ator FROM audit_log a LEFT JOIN users u ON u.id = a.ator_id WHERE a.business_id = ? ORDER BY a.id DESC LIMIT 30');
    $history->execute([$businessId]);
    $today = $db->prepare('SELECT COUNT(*), COALESCE(SUM(total), 0) FROM orders_rel WHERE business_id = ? AND ocorrido_em >= ?');
    $today->execute([$businessId, strtotime('today') * 1000]);
    [$ordersToday, $salesToday] = $today->fetch(PDO::FETCH_NUM);
    $channels = $db->prepare('SELECT canal FROM sales_channels WHERE business_id = ? AND conectado = 1');
    $channels->execute([$businessId]);
    unset($b['limites_json'], $b['modulos_json']);
    return $b + [
        'limites' => $contract['limits'],
        'modulos' => $contract['modules'],
        'pedidos_hoje' => (int)$ordersToday,
        'vendas_hoje' => round((float)$salesToday, 2),
        'canais_conectados' => $channels->fetchAll(PDO::FETCH_COLUMN),
        'chamados' => $tickets->fetchAll(PDO::FETCH_ASSOC),
        'historico' => $history->fetchAll(PDO::FETCH_ASSOC),
    ];
}
function createStore(PDO $db, array $staff, array $input): array {
    $name = cleanText($input['nome'] ?? '', 80);
    $owner = cleanText($input['responsavel'] ?? '', 80);
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $type = (string)($input['tipo'] ?? '');
    $plan = (string)($input['plano'] ?? '');
    if (mb_strlen($name) < 2) throw new InvalidArgumentException('Informe o nome da loja.');
    if (mb_strlen($owner) < 2) throw new InvalidArgumentException('Informe o nome do responsável.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Informe um e-mail válido para o acesso do lojista.');
    if (!isset(STORE_TYPES[$type])) throw new InvalidArgumentException('Escolha o ramo da loja.');
    if (!isset(PLAN_LIMITS[$plan])) throw new InvalidArgumentException('Escolha o plano.');
    $trialDays = max(0, min(60, (int)($input['teste_dias'] ?? 0)));
    $price = max(0, round((float)($input['valor_mensal'] ?? 0), 2));
    $consultantId = isAdmin($staff) && !empty($input['consultor_id']) ? (int)$input['consultor_id'] : (int)$staff['id'];
    $exists = $db->prepare('SELECT 1 FROM users WHERE LOWER(email) = ?');
    $exists->execute([$email]);
    if ($exists->fetchColumn()) throw new DomainException('Já existe um acesso com este e-mail.');

    $password = temporaryPassword();
    $db->beginTransaction();
    try {
        $db->prepare("INSERT INTO users (nome, email, senha, cargo, papel, trocar_senha) VALUES (?, ?, ?, 'Lojista', 'lojista', 1)")
            ->execute([$owner, $email, password_hash($password, PASSWORD_DEFAULT)]);
        $userId = (int)$db->lastInsertId();
        $db->prepare('INSERT INTO businesses (owner_user_id, tipo, nome, responsavel, cnpj, endereco, whatsapp, plano, situacao, consultor_id, valor_mensal, teste_ate, observacoes, modulos_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([
                $userId, $type, $name, $owner,
                cleanText($input['cnpj'] ?? '', 20), cleanText($input['endereco'] ?? '', 160), cleanText($input['whatsapp'] ?? '', 20),
                $plan, $trialDays ? 'teste' : 'ativa', $consultantId, $price,
                $trialDays ? date('Y-m-d', time() + $trialDays * 86400) : null,
                cleanText($input['observacoes'] ?? '', 400), json_encode(PLAN_MODULES[$plan]),
            ]);
        $businessId = (int)$db->lastInsertId();
        if (!empty($input['lead_id'])) {
            $db->prepare("UPDATE leads SET status = 'fechado', business_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?")->execute([$businessId, (int)$input['lead_id']]);
        }
        if (!empty($input['quote_id'])) {
            applyQuoteToStore($db, $staff, (int)$input['quote_id'], $businessId);
        }
        audit($db, (int)$staff['id'], $businessId, 'loja_criada', $name . ' · plano ' . PLAN_NAMES[$plan] . ($trialDays ? ' · teste de ' . $trialDays . ' dias' : '') . (!empty($input['quote_id']) ? ' · cotação #' . (int)$input['quote_id'] : ''));
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    return ['business_id' => $businessId, 'email' => $email, 'senha_provisoria' => $password];
}
function updateStore(PDO $db, array $staff, int $businessId, array $input): void {
    requireBusinessAccess($db, $staff, $businessId);
    $current = $db->prepare('SELECT * FROM businesses WHERE id = ?');
    $current->execute([$businessId]);
    $b = $current->fetch(PDO::FETCH_ASSOC);
    $changes = [];
    $set = [];
    $params = [];
    if (isset($input['plano']) && $input['plano'] !== $b['plano']) {
        if (!isset(PLAN_LIMITS[$input['plano']])) throw new InvalidArgumentException('Plano inválido.');
        $set[] = 'plano = ?';
        $params[] = $input['plano'];
        $changes[] = 'plano ' . PLAN_NAMES[$b['plano']] . ' → ' . PLAN_NAMES[$input['plano']];
    }
    if (isset($input['situacao']) && $input['situacao'] !== $b['situacao']) {
        if (!isset(STORE_STATUS[$input['situacao']])) throw new InvalidArgumentException('Situação inválida.');
        $set[] = 'situacao = ?';
        $params[] = $input['situacao'];
        $changes[] = 'situação ' . STORE_STATUS[$b['situacao']] . ' → ' . STORE_STATUS[$input['situacao']];
    }
    if (isset($input['valor_mensal']) && round((float)$input['valor_mensal'], 2) !== round((float)$b['valor_mensal'], 2)) {
        $set[] = 'valor_mensal = ?';
        $params[] = max(0, round((float)$input['valor_mensal'], 2));
        $changes[] = 'mensalidade R$ ' . number_format((float)$input['valor_mensal'], 2, ',', '.');
    }
    if (array_key_exists('teste_ate', $input) && (string)$input['teste_ate'] !== (string)$b['teste_ate']) {
        $date = (string)$input['teste_ate'];
        if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new InvalidArgumentException('Data de teste inválida.');
        $set[] = 'teste_ate = ?';
        $params[] = $date ?: null;
        $changes[] = 'teste até ' . ($date ?: 'sem data');
    }
    if (isset($input['limites']) && is_array($input['limites'])) {
        $limits = [];
        foreach (PLAN_LIMITS['avancado'] as $key => $_) {
            if (isset($input['limites'][$key]) && $input['limites'][$key] !== '') $limits[$key] = max(1, min(50, (int)$input['limites'][$key]));
        }
        $set[] = 'limites_json = ?';
        $params[] = json_encode((object)$limits);
        $changes[] = 'limites ' . json_encode($limits);
    }
    if (isset($input['modulos']) && is_array($input['modulos'])) {
        $modules = [];
        foreach (STORE_MODULES as $key => $_) $modules[$key] = !empty($input['modulos'][$key]);
        $set[] = 'modulos_json = ?';
        $params[] = json_encode($modules);
        $changes[] = 'módulos: ' . (implode(', ', array_keys(array_filter($modules))) ?: 'nenhum');
    }
    if (isset($input['observacoes'])) {
        $set[] = 'observacoes = ?';
        $params[] = cleanText($input['observacoes'], 400);
    }
    if (isAdmin($staff) && isset($input['consultor_id']) && (int)$input['consultor_id'] !== (int)$b['consultor_id']) {
        $set[] = 'consultor_id = ?';
        $params[] = (int)$input['consultor_id'];
        $changes[] = 'consultor alterado';
    }
    if (!$set) return;
    $params[] = $businessId;
    $db->prepare('UPDATE businesses SET ' . implode(', ', $set) . ', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')->execute($params);
    if ($changes) audit($db, (int)$staff['id'], $businessId, 'loja_alterada', implode(' · ', $changes));
}
function resetStorePassword(PDO $db, array $staff, int $businessId): array {
    requireBusinessAccess($db, $staff, $businessId);
    $password = temporaryPassword();
    $stmt = $db->prepare('UPDATE users SET senha = ?, trocar_senha = 1 WHERE id = (SELECT owner_user_id FROM businesses WHERE id = ?)');
    $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $businessId]);
    audit($db, (int)$staff['id'], $businessId, 'senha_redefinida', 'Senha provisória gerada para o lojista');
    return ['senha_provisoria' => $password];
}

// ---------------------------------------------------------------------------
// Contatos do site (leads)
function listLeads(PDO $db, array $staff): array {
    $where = isAdmin($staff) ? '' : 'WHERE l.consultor_id IS NULL OR l.consultor_id = ' . (int)$staff['id'];
    $rows = $db->query("SELECT l.id, l.origem, l.nome, l.email, l.whatsapp, l.dados, l.status, l.notas, l.business_id, l.criado_em, l.consultor_id, c.nome AS consultor_nome FROM leads l LEFT JOIN users c ON c.id = l.consultor_id $where ORDER BY l.id DESC LIMIT 200")->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static function (array $r): array {
        $data = json_decode($r['dados'] ?: '{}', true) ?: [];
        unset($r['dados']);
        $r['loja'] = cleanText($data['loja'] ?? $data['empresa'] ?? '', 80);
        $r['plano_interesse'] = cleanText($data['plano'] ?? '', 40);
        $r['mensagem'] = cleanText($data['observacoes'] ?? $data['mensagem'] ?? $data['obs'] ?? '', 500);
        // Dados da loja informados no pedido de proposta da página inicial
        $r['cnpj'] = cleanText($data['cnpj'] ?? '', 20);
        $r['ramo'] = isset(STORE_TYPES[$data['ramo'] ?? '']) ? $data['ramo'] : '';
        $r['ramo_outro'] = ($data['ramo'] ?? '') === 'outro';
        $r['cidade'] = cleanText($data['cidade'] ?? '', 80);
        $r['lojas'] = isset($data['lojas']) && is_numeric($data['lojas']) ? max(0, min(50, (int)$data['lojas'])) : null;
        $r['produtos'] = isset($data['produtos']) && is_numeric($data['produtos']) ? max(0, (int)$data['produtos']) : null;
        $names = array_map(static fn($c) => (string)$c, is_array($data['canais'] ?? null) ? $data['canais'] : []);
        $r['canais'] = array_values(array_filter($names, static fn($n) => $n !== ''));
        $r['canais_ids'] = array_values(array_keys(array_filter(QUOTE_CHANNELS, static fn($c) => in_array($c[0], $names, true))));
        return $r;
    }, $rows);
}
function updateLead(PDO $db, array $staff, int $leadId, array $input): void {
    $status = (string)($input['status'] ?? '');
    if (!isset(LEAD_STATUS[$status])) throw new InvalidArgumentException('Etapa inválida.');
    $stmt = $db->prepare('SELECT consultor_id FROM leads WHERE id = ?');
    $stmt->execute([$leadId]);
    $owner = $stmt->fetchColumn();
    if ($owner === false) throw new DomainException('Contato não encontrado.');
    if ($owner && (int)$owner !== (int)$staff['id'] && !isAdmin($staff)) throw new DomainException('Este contato é atendido por outro consultor.');
    $db->prepare('UPDATE leads SET status = ?, notas = ?, consultor_id = COALESCE(consultor_id, ?), atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
        ->execute([$status, cleanText($input['notas'] ?? '', 600), (int)$staff['id'], $leadId]);
    audit($db, (int)$staff['id'], null, 'contato_atualizado', 'Contato #' . $leadId . ' → ' . LEAD_STATUS[$status]);
}

// ---------------------------------------------------------------------------
// Chamados de suporte
function openTicket(PDO $db, array $user, int $businessId, string $subject, string $text): int {
    $subject = cleanText($subject, 120);
    $text = trim(mb_substr($text, 0, 2000));
    if (mb_strlen($subject) < 3) throw new InvalidArgumentException('Escreva o assunto do chamado.');
    if (mb_strlen($text) < 5) throw new InvalidArgumentException('Descreva o que aconteceu.');
    $db->prepare('INSERT INTO support_tickets (business_id, aberto_por, assunto) VALUES (?, ?, ?)')->execute([$businessId, (int)$user['id'], $subject]);
    $ticketId = (int)$db->lastInsertId();
    $db->prepare('INSERT INTO support_messages (ticket_id, autor_id, autor_papel, texto) VALUES (?, ?, ?, ?)')->execute([$ticketId, (int)$user['id'], $user['papel'] ?? 'lojista', $text]);
    markTicketSeen($db, $user, $ticketId);
    return $ticketId;
}
// Cada lado guarda a última mensagem que viu; o que vier do outro lado depois disso é "não lida"
function ticketSeenColumn(array $user): string {
    return isStaff($user) ? 'visto_staff' : 'visto_lojista';
}
function markTicketSeen(PDO $db, array $user, int $ticketId): void {
    $column = ticketSeenColumn($user);
    $db->prepare("UPDATE support_tickets SET $column = COALESCE((SELECT MAX(id) FROM support_messages WHERE ticket_id = ?), 0) WHERE id = ?")->execute([$ticketId, $ticketId]);
}
function ticketForUser(PDO $db, array $user, int $ticketId): array {
    $stmt = $db->prepare('SELECT t.*, b.nome AS loja, b.owner_user_id FROM support_tickets t JOIN businesses b ON b.id = t.business_id WHERE t.id = ?');
    $stmt->execute([$ticketId]);
    $t = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$t) throw new DomainException('Chamado não encontrado.');
    if (isStaff($user)) requireBusinessAccess($db, $user, (int)$t['business_id']);
    elseif ((int)$t['owner_user_id'] !== (int)$user['id']) throw new DomainException('Chamado não encontrado.');
    $messages = $db->prepare('SELECT m.id, m.texto, m.autor_papel, m.criado_em, u.nome AS autor FROM support_messages m LEFT JOIN users u ON u.id = m.autor_id WHERE m.ticket_id = ? ORDER BY m.id');
    $messages->execute([$ticketId]);
    $list = $messages->fetchAll(PDO::FETCH_ASSOC);
    $seen = (int)$t[ticketSeenColumn($user)];
    $fromOtherSide = static fn(array $m): bool => isStaff($user) ? $m['autor_papel'] === 'lojista' : $m['autor_papel'] !== 'lojista';
    $unread = count(array_filter($list, static fn($m) => (int)$m['id'] > $seen && $fromOtherSide($m)));
    unset($t['owner_user_id'], $t['visto_lojista'], $t['visto_staff']);
    return $t + ['mensagens' => $list, 'nao_lidas' => $unread];
}
function replyTicket(PDO $db, array $user, int $ticketId, string $text, ?string $status = null): void {
    $t = ticketForUser($db, $user, $ticketId);
    $text = trim(mb_substr($text, 0, 2000));
    if ($text === '' && $status === null) throw new InvalidArgumentException('Escreva a resposta.');
    if ($status !== null && !isStaff($user)) throw new DomainException('Só o consultor muda a situação do chamado.');
    // Resposta do consultor coloca o chamado em atendimento; o lojista respondendo reabre
    $next = $status ?? (isStaff($user) ? ($t['status'] === 'aberto' ? 'em_atendimento' : $t['status']) : ($t['status'] === 'resolvido' ? 'aberto' : $t['status']));
    if (!isset(TICKET_STATUS[$next])) throw new InvalidArgumentException('Situação inválida.');
    if ($text !== '') {
        $db->prepare('INSERT INTO support_messages (ticket_id, autor_id, autor_papel, texto) VALUES (?, ?, ?, ?)')->execute([$ticketId, (int)$user['id'], $user['papel'] ?? 'lojista', $text]);
    }
    $db->prepare('UPDATE support_tickets SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')->execute([$next, $ticketId]);
    markTicketSeen($db, $user, $ticketId);
    if (isStaff($user)) audit($db, (int)$user['id'], (int)$t['business_id'], 'chamado_respondido', 'Chamado #' . $ticketId . ' · ' . TICKET_STATUS[$next]);
}
function listTickets(PDO $db, array $staff): array {
    $where = isAdmin($staff) ? '' : 'WHERE b.consultor_id = ' . (int)$staff['id'];
    return $db->query("SELECT t.id, t.assunto, t.status, t.criado_em, t.atualizado_em, b.id AS business_id, b.nome AS loja,
            (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.autor_papel = 'lojista' AND m.id > t.visto_staff) AS nao_lidas
        FROM support_tickets t JOIN businesses b ON b.id = t.business_id $where ORDER BY CASE t.status WHEN 'aberto' THEN 0 WHEN 'em_atendimento' THEN 1 ELSE 2 END, t.atualizado_em DESC LIMIT 200")->fetchAll(PDO::FETCH_ASSOC);
}
// Consulta leve do painel do lojista (a cada poucos segundos): mudou algo nos chamados? há resposta nova?
function ownerSupportPulse(PDO $db, int $ownerUserId): array {
    $stmt = $db->prepare("SELECT COUNT(*), MAX(t.atualizado_em), GROUP_CONCAT(t.status),
            (SELECT MAX(m.id) FROM support_messages m JOIN support_tickets t2 ON t2.id = m.ticket_id JOIN businesses b2 ON b2.id = t2.business_id WHERE b2.owner_user_id = :owner),
            (SELECT COUNT(*) FROM support_messages m JOIN support_tickets t3 ON t3.id = m.ticket_id JOIN businesses b3 ON b3.id = t3.business_id WHERE b3.owner_user_id = :owner AND m.autor_papel <> 'lojista' AND m.id > t3.visto_lojista)
        FROM support_tickets t JOIN businesses b ON b.id = t.business_id WHERE b.owner_user_id = :owner");
    $stmt->execute([':owner' => $ownerUserId]);
    $row = $stmt->fetch(PDO::FETCH_NUM);
    $recent = $db->prepare("SELECT m.id, m.ticket_id, t.assunto, m.texto, u.nome AS autor FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id JOIN businesses b ON b.id = t.business_id LEFT JOIN users u ON u.id = m.autor_id WHERE b.owner_user_id = ? AND m.autor_papel <> 'lojista' AND m.id > t.visto_lojista ORDER BY m.id DESC LIMIT 5");
    $recent->execute([$ownerUserId]);
    return ['sig' => substr(md5(json_encode($row)), 0, 12), 'nao_lidas' => (int)$row[4], 'novas' => $recent->fetchAll(PDO::FETCH_ASSOC)];
}
function ownerTickets(PDO $db, int $ownerUserId): array {
    $stmt = $db->prepare('SELECT t.id FROM support_tickets t JOIN businesses b ON b.id = t.business_id WHERE b.owner_user_id = ? ORDER BY t.atualizado_em DESC LIMIT 30');
    $stmt->execute([$ownerUserId]);
    $user = ['id' => $ownerUserId, 'papel' => 'lojista'];
    return array_map(static fn($id) => ticketForUser($db, $user, (int)$id), $stmt->fetchAll(PDO::FETCH_COLUMN));
}

// ---------------------------------------------------------------------------
// Consultores (só administrador) e visão geral
function listConsultants(PDO $db): array {
    return $db->query("SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.ultimo_acesso, (SELECT COUNT(*) FROM businesses b WHERE b.consultor_id = u.id) AS lojas FROM users u WHERE u.papel IN ('consultor', 'admin') ORDER BY u.nome")->fetchAll(PDO::FETCH_ASSOC);
}
function createConsultant(PDO $db, array $admin, array $input): array {
    if (!isAdmin($admin)) throw new DomainException('Só o administrador cadastra consultores.');
    $name = cleanText($input['nome'] ?? '', 80);
    $email = strtolower(trim((string)($input['email'] ?? '')));
    if (mb_strlen($name) < 2) throw new InvalidArgumentException('Informe o nome do consultor.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Informe um e-mail válido.');
    $exists = $db->prepare('SELECT 1 FROM users WHERE LOWER(email) = ?');
    $exists->execute([$email]);
    if ($exists->fetchColumn()) throw new DomainException('Já existe um acesso com este e-mail.');
    $password = temporaryPassword();
    $db->prepare("INSERT INTO users (nome, email, senha, cargo, papel, trocar_senha) VALUES (?, ?, ?, 'Consultor WedTech', 'consultor', 1)")
        ->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
    audit($db, (int)$admin['id'], null, 'consultor_criado', $name . ' <' . $email . '>');
    return ['email' => $email, 'senha_provisoria' => $password];
}
function staffOverview(PDO $db, array $staff): array {
    $stores = listStores($db, $staff);
    $count = static fn(string $status): int => count(array_filter($stores, static fn($s) => $s['situacao'] === $status));
    $tickets = array_filter(listTickets($db, $staff), static fn($t) => $t['status'] !== 'resolvido');
    $leads = array_filter(listLeads($db, $staff), static fn($l) => $l['status'] === 'novo');
    return [
        'lojas' => count($stores),
        'ativas' => $count('ativa'),
        'teste' => $count('teste'),
        'suspensas' => $count('suspensa'),
        'atencao' => count(array_filter($stores, static fn($s) => $s['saude'] === 'atencao')),
        'mensalidades' => round(array_sum(array_map(static fn($s) => in_array($s['situacao'], ['ativa', 'teste'], true) ? (float)$s['valor_mensal'] : 0, $stores)), 2),
        'chamados_abertos' => count($tickets),
        'contatos_novos' => count($leads),
    ];
}
// Consulta leve da área do consultor (a cada poucos segundos): uma "assinatura" de cada lista para a
// tela saber o que recarregar, os acontecimentos recentes (viram janela com som) e os contadores do menu.
function staffPulse(PDO $db, array $staff): array {
    $me = (int)$staff['id'];
    $admin = isAdmin($staff);
    $stores = $admin ? '1 = 1' : "b.consultor_id = $me";
    $leads = $admin ? '1 = 1' : "(l.consultor_id IS NULL OR l.consultor_id = $me)";
    $quotes = $admin ? '1 = 1' : "q.consultor_id = $me";
    $row = static fn(string $sql): array => $db->query($sql)->fetch(PDO::FETCH_NUM) ?: [];
    $rows = static fn(string $sql): array => $db->query($sql)->fetchAll(PDO::FETCH_NUM);
    // A assinatura leva a situação de cada item (não só a hora da última mudança, que tem precisão de
    // segundos): duas mudanças no mesmo segundo, como enviar e o cliente aceitar, também são percebidas.
    $sig = static fn(array $values): string => substr(md5(json_encode($values)), 0, 12);
    $since = time() * 1000 - 7 * 86400000;

    $leadRows = $rows("SELECT l.id, l.status, l.consultor_id, l.business_id, l.atualizado_em FROM leads l WHERE $leads");
    $ticketRows = $rows("SELECT t.id, t.status, t.atualizado_em, t.visto_staff FROM support_tickets t JOIN businesses b ON b.id = t.business_id WHERE $stores");
    $ticketRow = $row("SELECT
            (SELECT MAX(m.id) FROM support_messages m JOIN support_tickets t2 ON t2.id = m.ticket_id JOIN businesses b ON b.id = t2.business_id WHERE $stores),
            (SELECT COUNT(*) FROM support_messages m JOIN support_tickets t3 ON t3.id = m.ticket_id JOIN businesses b ON b.id = t3.business_id WHERE $stores AND m.autor_papel = 'lojista' AND m.id > t3.visto_staff)");
    $storeRows = $rows("SELECT b.id, b.situacao, b.plano, b.valor_mensal, b.limites_json, b.modulos_json, b.consultor_id, b.atualizado_em, o.ultimo_acesso, o.trocar_senha
        FROM businesses b JOIN users o ON o.id = b.owner_user_id WHERE $stores");
    $ordersRow = $row("SELECT COUNT(*), COALESCE(MAX(r.ocorrido_em), 0), COALESCE(SUM(r.total), 0) FROM orders_rel r JOIN businesses b ON b.id = r.business_id WHERE $stores AND r.ocorrido_em >= $since");
    $quoteRows = $rows("SELECT q.id, q.status, q.atualizado_em, q.business_id FROM quotes q WHERE $quotes");
    $auditRow = $row('SELECT MAX(a.id) FROM audit_log a' . ($admin ? '' : " WHERE a.ator_id = $me OR a.business_id IN (SELECT b.id FROM businesses b WHERE $stores)"));
    $countWhere = static fn(array $list, int $col, callable $test): int => count(array_filter($list, static fn($r) => $test($r[$col])));

    $events = [];
    foreach ($db->query("SELECT m.id, m.ticket_id, t.assunto, m.texto, b.nome AS loja FROM support_messages m JOIN support_tickets t ON t.id = m.ticket_id JOIN businesses b ON b.id = t.business_id WHERE $stores AND m.autor_papel = 'lojista' AND m.id > t.visto_staff ORDER BY m.id DESC LIMIT 5") as $m) {
        $events[] = ['chave' => 'msg-' . $m['id'], 'tipo' => 'chamado', 'id' => (int)$m['ticket_id'], 'titulo' => $m['loja'] . ' · chamado #' . $m['ticket_id'], 'texto' => mb_substr($m['texto'], 0, 140)];
    }
    foreach ($db->query("SELECT l.id, l.nome, l.dados FROM leads l WHERE $leads AND l.status = 'novo' ORDER BY l.id DESC LIMIT 5") as $l) {
        $data = json_decode($l['dados'] ?: '{}', true) ?: [];
        $shop = cleanText($data['loja'] ?? $data['empresa'] ?? '', 80);
        $events[] = ['chave' => 'lead-' . $l['id'], 'tipo' => 'contato', 'id' => (int)$l['id'], 'titulo' => 'Novo contato pelo site', 'texto' => $l['nome'] . ($shop ? ' · ' . $shop : '') . ' quer falar com um consultor'];
    }
    foreach ($db->query("SELECT q.id, q.status, q.cliente_json, q.aceite_nome FROM quotes q WHERE $quotes AND q.status IN ('aceita', 'recusada', 'aprovacao') ORDER BY q.atualizado_em DESC LIMIT 5") as $q) {
        if ($q['status'] === 'aprovacao' && !$admin) continue;
        $client = json_decode($q['cliente_json'], true) ?: [];
        $text = match ($q['status']) {
            'aceita' => ($q['aceite_nome'] ?: 'O cliente') . ' aceitou a proposta de ' . ($client['loja'] ?? ''),
            'recusada' => ($client['loja'] ?? 'O cliente') . ' recusou a proposta',
            default => 'Desconto acima do limite em ' . ($client['loja'] ?? '') . ': aguarda sua aprovação',
        };
        $events[] = ['chave' => 'quote-' . $q['id'] . '-' . $q['status'], 'tipo' => 'cotacao', 'id' => (int)$q['id'], 'titulo' => 'Cotação #' . $q['id'], 'texto' => $text, 'status' => $q['status']];
    }

    return [
        'sig' => [
            'contatos' => $sig($leadRows),
            'chamados' => $sig([$ticketRows, $ticketRow]),
            'lojas' => $sig([$storeRows, $ordersRow]),
            'cotacoes' => $sig($quoteRows),
            'historico' => $sig($auditRow),
        ],
        'contadores' => [
            'contatos' => $countWhere($leadRows, 1, static fn($s) => $s === 'novo'),
            'chamados' => $countWhere($ticketRows, 1, static fn($s) => $s !== 'resolvido'),
            'nao_lidas' => (int)($ticketRow[1] ?? 0),
            'cotacoes' => $countWhere($quoteRows, 1, static fn($s) => $s === 'aprovacao'),
        ],
        'eventos' => $events,
        'agora' => gmdate('Y-m-d H:i:s'),
    ];
}
function auditTrail(PDO $db, array $staff): array {
    $where = isAdmin($staff) ? '' : 'WHERE a.ator_id = ' . (int)$staff['id'];
    return $db->query("SELECT a.acao, a.detalhe, a.criado_em, u.nome AS ator, b.nome AS loja FROM audit_log a LEFT JOIN users u ON u.id = a.ator_id LEFT JOIN businesses b ON b.id = a.business_id $where ORDER BY a.id DESC LIMIT 100")->fetchAll(PDO::FETCH_ASSOC);
}

// ---------------------------------------------------------------------------
// Modo suporte: o consultor vê o painel de uma loja sem poder alterar nada
function startSupportMode(PDO $db, array $staff, int $businessId): void {
    requireBusinessAccess($db, $staff, $businessId);
    $stmt = $db->prepare('SELECT owner_user_id, nome FROM businesses WHERE id = ?');
    $stmt->execute([$businessId]);
    $b = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$b) throw new DomainException('Loja não encontrada.');
    $_SESSION['suporte'] = ['business_id' => $businessId, 'owner_id' => (int)$b['owner_user_id'], 'loja' => $b['nome']];
    audit($db, (int)$staff['id'], $businessId, 'suporte_iniciado', 'Entrou no painel da loja em modo somente leitura');
}
function endSupportMode(PDO $db, array $staff): void {
    if (!empty($_SESSION['suporte'])) {
        audit($db, (int)$staff['id'], (int)$_SESSION['suporte']['business_id'], 'suporte_encerrado', 'Saiu do painel da loja');
    }
    unset($_SESSION['suporte']);
}
// Quem é o dono dos dados exibidos no painel e se o acesso é só de leitura
function panelContext(array $user): ?array {
    if (!isStaff($user)) return ['owner_id' => (int)$user['id'], 'readonly' => false, 'support' => null];
    $support = $_SESSION['suporte'] ?? null;
    return $support ? ['owner_id' => (int)$support['owner_id'], 'readonly' => true, 'support' => $support] : null;
}
