<?php
// trocar-senha.php - Troca de senha: obrigatória no primeiro acesso (senha provisória criada pelo
// consultor) ou quando a pessoa quiser, pelo menu do perfil (aí pede a senha atual).
require_once __DIR__ . '/auth.php';

if (!is_logged_in()) {
    header('Location: login.php');
    exit;
}
$user = get_logged_user();
$forced = must_change_password();
$conta = account_kind_for($user);
$voltar = home_path_for($user);

$erro = '';
$ok = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $res = change_password((int)$user['id'], (string)($_POST['senha'] ?? ''), (string)($_POST['confirmacao'] ?? ''), $forced ? null : (string)($_POST['atual'] ?? ''));
    if ($res['success'] && $forced) {
        header('Location: ' . home_path_for($user));
        exit;
    }
    $ok = $res['success'];
    $erro = $res['success'] ? '' : $res['message'];
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $forced ? 'Criar sua senha' : 'Trocar senha' ?> · WedTech</title>
<link rel="icon" href="frontend/img/site/favicon-wedtech.png" type="image/png">
<style>
  :root { --bg: #f3f7fb; --card: #fff; --txt: #1a2634; --mut: #617185; --line: #dfe6ef; --acc: #1d5d91; --bad: #c0392b; }
  @media (prefers-color-scheme: dark) { :root { --bg: #080a0d; --card: #11161b; --txt: #edf1f5; --mut: #9aa3ad; --line: #26303a; --acc: #5aa7e6; --bad: #f87171; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--txt); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .card { width: 100%; max-width: 420px; padding: 32px 28px; border: 1px solid var(--line); border-radius: 16px; background: var(--card); }
  h1 { margin: 0 0 6px; font-size: 22px; }
  p { margin: 0 0 20px; color: var(--mut); }
  label { display: block; margin: 14px 0 6px; font-weight: 600; font-size: 14px; }
  input { width: 100%; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--txt); font: inherit; }
  button { width: 100%; margin-top: 22px; padding: 12px; border: 0; border-radius: 99px; background: var(--acc); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
  .erro { margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--bad) 12%, var(--card)); color: var(--bad); font-size: 14px; }
  .sucesso { margin: 0 0 16px; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, #16a34a 14%, var(--card)); color: #15803d; font-size: 14px; }
  .voltar { display: block; padding: 12px; border-radius: 99px; background: var(--acc); color: #fff; font-weight: 700; text-align: center; text-decoration: none; }
  .sair { display: block; margin-top: 16px; text-align: center; color: var(--mut); font-size: 14px; }
</style>
</head>
<body>
  <main class="card">
    <?php if ($forced): ?>
      <h1>Olá, <?= htmlspecialchars(explode(' ', $user['nome'])[0]) ?>! Crie sua senha</h1>
      <p>Você entrou com a senha provisória enviada pelo seu consultor WedTech. Escolha uma senha só sua para continuar.</p>
    <?php else: ?>
      <h1>Trocar senha</h1>
      <p><?= htmlspecialchars($user['nome']) ?> · <?= htmlspecialchars($user['email']) ?></p>
    <?php endif; ?>
    <?php if ($erro): ?><div class="erro" role="alert"><?= htmlspecialchars($erro) ?></div><?php endif; ?>
    <?php if ($ok): ?>
      <div class="sucesso" role="status">Senha alterada. Use a nova senha no próximo acesso.</div>
      <a class="voltar" href="<?= htmlspecialchars($voltar) ?>">Voltar</a>
    <?php else: ?>
    <form method="POST" action="trocar-senha.php?conta=<?= htmlspecialchars($conta) ?>">
      <?php if (!$forced): ?>
        <label for="atual">Senha atual</label>
        <input type="password" id="atual" name="atual" required autocomplete="current-password" autofocus>
      <?php endif; ?>
      <label for="senha">Nova senha (mínimo 6 caracteres)</label>
      <input type="password" id="senha" name="senha" required minlength="6" autocomplete="new-password" <?= $forced ? 'autofocus' : '' ?>>
      <label for="confirmacao">Repita a nova senha</label>
      <input type="password" id="confirmacao" name="confirmacao" required minlength="6" autocomplete="new-password">
      <button type="submit"><?= $forced ? 'Salvar e entrar' : 'Salvar nova senha' ?></button>
    </form>
    <?php endif; ?>
    <?php if ($forced): ?>
      <a class="sair" href="logout.php?conta=<?= htmlspecialchars($conta) ?>">Sair</a>
    <?php elseif (!$ok): ?>
      <a class="sair" href="<?= htmlspecialchars($voltar) ?>">Cancelar e voltar</a>
    <?php endif; ?>
  </main>
</body>
</html>
