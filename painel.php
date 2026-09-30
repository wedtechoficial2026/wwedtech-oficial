<?php
// painel.php - Painel clássico WedTech (mantido para dados anteriores)
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/backend/app_state.php';
require_login();
if (in_array(get_logged_user()['papel'] ?? '', ['consultor', 'admin'], true)) {
    header('Location: consultor/index.php');
    exit;
}
$currentUser = get_logged_user();
$savedState = loadAppState(getDb(), (int)$currentUser['id'], 'legacy');
$stateBootstrap = [
  'app' => 'legacy',
  'revision' => $savedState['revision'] ?? 0,
  'data' => $savedState['data'] ?? null,
];
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WedTech · Painel clássico</title>
<link rel="stylesheet" href="frontend/css/legacy/style.css">
</head>
<body>
<div class="scrim" id="scrim" onclick="toggleNav(false)"></div>
<div class="app">
<aside id="side">
  <div class="logo">
    <span class="brand-mark"><img src="frontend/img/site/logo-wedtech.png" alt="WedTech" class="brand-logo"></span>
    <span class="brand-name">WedTech</span>
  </div>
  <nav id="nav"></nav>
  <div class="spacer"></div>
  <button class="nb" onclick="openSettings()" id="nset"></button>
  <button class="nb" onclick="openSupport()" id="nsup"></button>
  <a href="logout.php" class="nb" style="color:var(--bad);text-decoration:none;margin-top:0.25rem" id="aside-logout">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    <span>Sair</span>
  </a>
</aside>
<main>
  <header class="top">
    <button class="ic burger" onclick="toggleNav(true)" aria-label="Abrir menu" id="bg"></button>
    <div class="hello"><h1 id="hello"></h1><p class="sub" id="sub"></p></div>
    <div class="ask"><input id="q" placeholder="Pergunte à IA: estoque, vendas, pedidos..." aria-label="Pergunte à IA"><button class="b" id="qb">Perguntar</button></div>
    <div class="rel"><button class="ic" id="bell" aria-label="Notificações" onclick="pop('pn',event)"></button><div class="pop" id="pn" hidden></div></div>
    <button class="ic theme-toggle" id="themeToggle" aria-label="Alternar tema" onclick="toggleTheme()"></button>
    <button class="ic" id="gear" aria-label="Configurações" onclick="openSettings()"></button>
    <div class="rel"><button class="me" id="me" aria-label="Menu do perfil" onclick="pop('pm',event)"></button>
      <div class="pop" id="pm" hidden>
        <button class="nb" onclick="openProfile()" id="mp"></button>
        <button class="nb" onclick="openSettings()" id="ms"></button>
        <a href="banco.php" target="_blank" class="nb" style="color:var(--txt);text-decoration:none;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          <span>Banco de Dados</span>
        </a>
        <a href="logout.php" class="nb" style="color:var(--bad);text-decoration:none;border-top:1px solid var(--line);margin-top:0.35rem;padding-top:0.6rem">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>Encerrar sessão</span>
        </a>
      </div></div>
  </header>
  <div id="view"></div>
</main>
</div>
<div id="tip"></div><div id="toast"></div>

<script>
  // Injeta usuário autenticado via sessão PHP
  window.CURRENT_USER = <?= json_encode($currentUser, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  window.WEDTECH_STATE_BOOTSTRAP = <?= json_encode($stateBootstrap, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?: 'null' ?>;
  window.WEDTECH_STATE_ENDPOINT = "api/state.php";
</script>
<script src="frontend/js/shared/server-state.js"></script>
<script src="frontend/js/legacy/i18n.js"></script>
<script src="frontend/js/legacy/script.js"></script>
</body>
</html>
