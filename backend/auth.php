<?php
// Gerenciamento de sessão e autenticação compartilhados pela aplicação.
//
// Uma sessão guarda até duas contas ao mesmo tempo: a da loja (lojista) e a da equipe WedTech
// (consultor ou administrador). Assim o painel da loja e a área do consultor funcionam lado a lado
// no mesmo navegador, sem um login derrubar o outro. Cada pedido usa a conta da sua área:
//   - área da equipe: consultor/*, api/consultor.php, ?conta=equipe ou o cabeçalho X-WedTech-Conta: equipe
//     (o painel aberto em modo suporte manda esse cabeçalho);
//   - o resto é área da loja (o painel manda X-WedTech-Conta: loja).

if (session_status() === PHP_SESSION_NONE) {
    // O navegador compartilha cookies entre portas do mesmo host: cada servidor (painel 8000,
    // vitrines 8011-8013) usa o próprio cookie para um não encerrar a sessão do outro.
    session_name('WEDTECHSID' . preg_replace('/\D/', '', (string)($_SERVER['SERVER_PORT'] ?? '')));
    session_start();
}

require_once __DIR__ . '/db.php';

const SESSION_IDLE_LIMIT = 2 * 60 * 60; // desconecta após 2 horas sem uso
const ACCOUNT_KINDS = ['loja', 'equipe'];

// Identifica a execução atual do servidor. No servidor embutido (iniciar-servidor.bat) o
// processo muda a cada reinício; WEDTECH_BOOT_ID permite definir o valor em outros ambientes.
function server_boot_id(): string {
    $configured = getenv('WEDTECH_BOOT_ID');
    if ($configured !== false && $configured !== '') {
        return $configured;
    }
    return PHP_SAPI === 'cli-server' ? 'pid-' . getmypid() : 'fixo';
}

function account_kind_for(?array $user): string {
    return in_array($user['papel'] ?? '', ['consultor', 'admin'], true) ? 'equipe' : 'loja';
}

// Qual conta este pedido quer usar e se pediu isso de forma explícita
function requested_account(): array {
    $asked = (string)($_SERVER['HTTP_X_WEDTECH_CONTA'] ?? ($_GET['conta'] ?? ''));
    if (in_array($asked, ACCOUNT_KINDS, true)) {
        return [$asked, true];
    }
    $path = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    if (str_contains($path, '/consultor/') || str_ends_with($path, '/api/consultor.php')) {
        return ['equipe', true];
    }
    return ['loja', false];
}

// Sessão no formato antigo (uma conta só) passa para o formato novo
if (isset($_SESSION['user']) && !isset($_SESSION['contas'])) {
    $old = $_SESSION['user'];
    $_SESSION['contas'] = [account_kind_for($old) => [
        'user' => $old,
        'trocar_senha' => !empty($_SESSION['trocar_senha']),
        'boot_id' => $_SESSION['boot_id'] ?? null,
        'last_seen' => $_SESSION['last_seen'] ?? 0,
    ]];
}
unset($_SESSION['user'], $_SESSION['trocar_senha'], $_SESSION['boot_id'], $_SESSION['last_seen']);
$_SESSION['contas'] ??= [];

// Contas de uma execução anterior do servidor ou paradas há muito tempo são encerradas.
foreach ($_SESSION['contas'] as $kind => $account) {
    $expired = ($account['boot_id'] ?? null) !== server_boot_id() || time() - (int)($account['last_seen'] ?? 0) > SESSION_IDLE_LIMIT;
    if ($expired) {
        unset($_SESSION['contas'][$kind]);
        if ($kind === 'equipe') unset($_SESSION['suporte']);
    }
}

// Conta deste pedido: a da área pedida; sem pedido explícito, vale a outra conta, se houver
// (ex.: o consultor abrindo login.php vai para a área dele).
function resolve_account(): ?string {
    [$kind, $explicit] = requested_account();
    if (isset($_SESSION['contas'][$kind])) return $kind;
    if ($explicit) return null;
    foreach (ACCOUNT_KINDS as $other) {
        if (isset($_SESSION['contas'][$other])) return $other;
    }
    return null;
}
$GLOBALS['wedtech_conta'] = resolve_account();

if ($GLOBALS['wedtech_conta']) {
    $account = &$_SESSION['contas'][$GLOBALS['wedtech_conta']];
    $account['last_seen'] = time();
    // "Online agora" na área do consultor: grava o último acesso no máximo uma vez por minuto
    if (time() - (int)($account['acesso_gravado'] ?? 0) >= 60) {
        $account['acesso_gravado'] = time();
        try {
            getDb()->prepare('UPDATE users SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?')->execute([(int)$account['user']['id']]);
        } catch (Throwable $e) {
            error_log('Falha ao registrar o último acesso: ' . $e->getMessage());
        }
    }
    unset($account);
}

function current_account(): ?array {
    $kind = $GLOBALS['wedtech_conta'] ?? null;
    return $kind ? ($_SESSION['contas'][$kind] ?? null) : null;
}

function is_logged_in(): bool {
    return !empty(current_account()['user']['id']);
}

function require_login(): void {
    if (!is_logged_in()) {
        header('Location: login.php');
        exit;
    }
}

function get_logged_user(): ?array {
    return current_account()['user'] ?? null;
}

// Senha provisória (criada pelo consultor) ainda não trocada
function must_change_password(?array $user = null): bool {
    $kind = $user ? account_kind_for($user) : ($GLOBALS['wedtech_conta'] ?? null);
    return $kind !== null && !empty($_SESSION['contas'][$kind]['trocar_senha']);
}

function attempt_login(string $email, string $senha): array {
    $email = trim(filter_var($email, FILTER_SANITIZE_EMAIL));
    if (empty($email) || empty($senha)) {
        return ['success' => false, 'message' => 'Preencha o e-mail e a senha.'];
    }

    try {
        $db = getDb();
        $stmt = $db->prepare("SELECT id, nome, email, senha, cargo, papel, trocar_senha, ativo FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($senha, $user['senha'])) {
            return ['success' => false, 'message' => 'E-mail ou senha incorretos.'];
        }
        if (!(int)$user['ativo']) {
            return ['success' => false, 'message' => 'Este acesso foi desativado. Fale com a WedTech.'];
        }
        if ($user['papel'] === 'lojista') {
            $status = $db->prepare('SELECT situacao FROM businesses WHERE owner_user_id = ?');
            $status->execute([$user['id']]);
            $situacao = $status->fetchColumn();
            if ($situacao === 'suspensa' || $situacao === 'cancelada') {
                return ['success' => false, 'message' => 'O acesso da sua loja está ' . $situacao . '. Fale com o seu consultor WedTech.'];
            }
        }

        session_regenerate_id(true);
        $public = [
            'id'    => $user['id'],
            'nome'  => $user['nome'],
            'email' => $user['email'],
            'cargo' => $user['cargo'],
            'papel' => $user['papel'],
        ];
        $kind = account_kind_for($public);
        // Entrar numa conta substitui só a conta do mesmo tipo; a outra continua conectada
        $_SESSION['contas'][$kind] = [
            'user' => $public,
            'trocar_senha' => (bool)$user['trocar_senha'],
            'boot_id' => server_boot_id(),
            'last_seen' => time(),
            'acesso_gravado' => time(),
        ];
        if ($kind === 'equipe') unset($_SESSION['suporte']);
        $GLOBALS['wedtech_conta'] = $kind;
        $db->prepare('UPDATE users SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?')->execute([$user['id']]);

        return ['success' => true, 'user' => $public];
    } catch (Exception $e) {
        return ['success' => false, 'message' => 'Erro interno ao autenticar: ' . $e->getMessage()];
    }
}

// Para onde cada perfil vai depois de entrar (caminho relativo à raiz do projeto)
function home_path_for(?array $user): string {
    if ($user && must_change_password($user)) return 'trocar-senha.php?conta=' . account_kind_for($user);
    return account_kind_for($user) === 'equipe' ? 'consultor/index.php' : 'modulos/index.php';
}

// Troca de senha: obrigatória no primeiro acesso (senha provisória) ou quando a pessoa quiser;
// fora do primeiro acesso é preciso informar a senha atual.
function change_password(int $userId, string $senha, string $confirmacao, ?string $atual = null): array {
    $db = getDb();
    if ($atual !== null) {
        $stmt = $db->prepare('SELECT senha FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        if (!password_verify($atual, (string)$stmt->fetchColumn())) {
            return ['success' => false, 'message' => 'A senha atual não confere.'];
        }
    }
    if (strlen($senha) < 6) {
        return ['success' => false, 'message' => 'A nova senha precisa ter pelo menos 6 caracteres.'];
    }
    if ($senha !== $confirmacao) {
        return ['success' => false, 'message' => 'As duas senhas não são iguais.'];
    }
    $db->prepare('UPDATE users SET senha = ?, trocar_senha = 0 WHERE id = ?')->execute([password_hash($senha, PASSWORD_DEFAULT), $userId]);
    if ($GLOBALS['wedtech_conta'] ?? null) {
        $_SESSION['contas'][$GLOBALS['wedtech_conta']]['trocar_senha'] = false;
    }
    return ['success' => true];
}

// Sai só da conta desta área; quando não sobra nenhuma, a sessão inteira é encerrada
function logout(): void {
    $kind = $GLOBALS['wedtech_conta'] ?? null;
    if ($kind) {
        unset($_SESSION['contas'][$kind]);
        if ($kind === 'equipe') unset($_SESSION['suporte']);
        $GLOBALS['wedtech_conta'] = null;
    }
    if (!empty($_SESSION['contas'])) {
        return;
    }
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params["path"],
            $params["domain"],
            $params["secure"],
            $params["httponly"]
        );
    }
    session_destroy();
}
