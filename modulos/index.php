<?php
// modulos/index.php - Módulos omnichannel (balcão, canais, compras, ADS...) dentro do dashboard.
// Mesmo login do painel.php; abre dentro dele num iframe (modo "embed").
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../backend/app_state.php';
if (!is_logged_in()) {
    header('Location: ../login.php');
    exit;
}
$loggedUser = get_logged_user();
if (must_change_password()) {
    header('Location: ../trocar-senha.php?conta=' . account_kind_for($loggedUser));
    exit;
}
// Lojista vê a própria loja; consultor só entra aqui em modo suporte (somente leitura)
$context = panelContext($loggedUser);
if (!$context) {
    header('Location: ../consultor/index.php');
    exit;
}
$db = getDb();
$ownerStmt = $db->prepare('SELECT id, nome, email, cargo FROM users WHERE id = ?');
$ownerStmt->execute([$context['owner_id']]);
$currentUser = $ownerStmt->fetch(PDO::FETCH_ASSOC) ?: $loggedUser;
$savedState = loadAppState($db, (int)$currentUser['id'], 'modular');
if ($savedState && !$context['readonly']) {
  syncModularTables($db, (int)$currentUser['id'], $savedState['data'], $savedState['revision']);
}
$stateBootstrap = [
  'app' => 'modular',
  'revision' => $savedState['revision'] ?? 0,
  'data' => $savedState['data'] ?? null,
];
$provision = $savedState ? null : businessProvision($db, (int)$currentUser['id']);
$support = $context['support'] ? ['store' => $context['support']['loja'], 'consultant' => $loggedUser['nome']] : null;
?>
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#080a0d" />
    <title>WedTech — Painel do lojista</title>
    <link rel="icon" href="../frontend/img/modulos/favicon-wedtech.png" type="image/png" />
    <script>
      // Antes de pintar: modo embutido e o mesmo tema/cor de destaque do dashboard
      (function () {
        var html = document.documentElement;
        if (window.top !== window) html.classList.add("embed");
        window.aplicarTemaPainel = function () {
          var cfg = {};
          try {
            cfg = (JSON.parse(localStorage.getItem("estoque-inteligente-v2") || "null") || {}).cfg || {};
          } catch (e) {}
          html.setAttribute("data-theme", cfg.tema === "light" ? "light" : "dark");
          if (cfg.cor) html.style.setProperty("--acc", cfg.cor);
        };
        window.aplicarTemaPainel();
        window.addEventListener("storage", function (e) {
          if (e.key === "estoque-inteligente-v2") window.aplicarTemaPainel();
        });
      })();
    </script>
    <link rel="stylesheet" href="../frontend/css/modulos/app.css" />
    <link rel="stylesheet" href="../frontend/css/modulos/brand.css" />
    <link rel="stylesheet" href="../frontend/css/modulos/app-components.css" />
    <link rel="stylesheet" href="../frontend/css/modulos/painel-skin.css" />
    <link rel="stylesheet" href="../frontend/css/shared/alertas.css" />
  </head>
  <body>
    <div id="app"></div>
    <div id="toast" role="status" aria-live="polite"></div>

    <script>
      // Usuário autenticado pela sessão PHP
      window.CURRENT_USER = <?= json_encode($currentUser, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
      window.WEDTECH_STATE_BOOTSTRAP = <?= json_encode($stateBootstrap, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?: 'null' ?>;
      window.WEDTECH_STATE_ENDPOINT = "../api/state.php";
      // Loja recém-cadastrada pelo consultor (ainda sem dados) e modo suporte (somente leitura)
      window.WEDTECH_PROVISION = <?= json_encode($provision, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?: 'null' ?>;
      window.WEDTECH_SUPPORT = <?= json_encode($support, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?: 'null' ?>;
      window.WEDTECH_READONLY = <?= $context['readonly'] ? 'true' : 'false' ?>;
      // Cada chamada ao servidor diz de qual conta é: a da loja ou a do consultor em modo suporte.
      // Assim o painel da loja e a área do consultor funcionam juntos no mesmo navegador.
      (function (conta) {
        var nativeFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
          init = init || {};
          var url = new URL(typeof input === "string" ? input : input.url, location.href);
          if (url.origin !== location.origin) return nativeFetch(input, init);
          var headers = new Headers(init.headers || (typeof input === "string" ? undefined : input.headers));
          headers.set("X-WedTech-Conta", conta);
          return nativeFetch(input, Object.assign({}, init, { headers: headers }));
        };
      })(<?= json_encode($context['readonly'] ? 'equipe' : 'loja') ?>);
    </script>
    <script src="../frontend/js/shared/server-state.js"></script>
    <script src="../frontend/js/shared/alertas.js"></script>
    <script src="../frontend/js/modulos/config.js"></script>

    <!-- Bibliotecas locais (sem internet) -->
    <script src="../frontend/js/modulos/vendor/qrcode.js"></script>
    <script src="../frontend/js/modulos/shared/barcode.js"></script>

    <!-- Núcleo: regras de negócio, automações e IA (o mesmo usado pelo site da loja) -->
    <script src="../frontend/js/modulos/core/catalogos.js"></script>
    <script src="../frontend/js/modulos/core/calendario.js"></script>
    <script src="../frontend/js/modulos/core/wedtech-core.js"></script>

    <!-- Painel: base, estrutura, telas, ações e eventos -->
    <script src="../frontend/js/modulos/app/base.js"></script>
    <script src="../frontend/js/modulos/app/layout.js"></script>
    <script src="../frontend/js/modulos/app/paginas/inicio.js"></script>
    <script src="../frontend/js/modulos/app/paginas/balcao.js"></script>
    <script src="../frontend/js/modulos/app/paginas/notificacoes.js"></script>
    <script src="../frontend/js/modulos/app/paginas/suporte.js"></script>
    <script src="../frontend/js/modulos/app/paginas/retiradas.js"></script>
    <script src="../frontend/js/modulos/app/paginas/pedidos.js"></script>
    <script src="../frontend/js/modulos/app/paginas/devolucoes.js"></script>
    <script src="../frontend/js/modulos/app/paginas/estoque.js"></script>
    <script src="../frontend/js/modulos/app/paginas/iot.js"></script>
    <script src="../frontend/js/modulos/app/paginas/produtos.js"></script>
    <script src="../frontend/js/modulos/app/paginas/canais.js"></script>
    <script src="../frontend/js/modulos/app/paginas/compras.js"></script>
    <script src="../frontend/js/modulos/app/paginas/sazonalidade.js"></script>
    <script src="../frontend/js/modulos/app/paginas/ads.js"></script>
    <script src="../frontend/js/modulos/app/paginas/financeiro.js"></script>
    <script src="../frontend/js/modulos/app/paginas/automacoes.js"></script>
    <script src="../frontend/js/modulos/app/paginas/ia.js"></script>
    <script src="../frontend/js/modulos/app/paginas/config.js"></script>
    <script src="../frontend/js/modulos/app/acoes.js"></script>

    <script>
      // Ponte com o dashboard: login já feito no PHP, nome do usuário e "Sair" da sessão PHP
      ui.loggedIn = true;
      // Nome do usuário logado em toda tela (inclusive depois de escolher o tipo de loja)
      var nomeLogado = window.CURRENT_USER && window.CURRENT_USER.nome ? String(window.CURRENT_USER.nome).trim().split(/\s+/)[0] : "";
      var renderOriginal = render;
      render = function () {
        if (nomeLogado && state.store) state.store.owner = nomeLogado;
        return renderOriginal();
      };
      logout = function () {
        try {
          sessionStorage.removeItem("wedtech-session");
        } catch {}
        window.top.location.href = "../logout.php";
      };
      // Avisa o dashboard da tela atual (para marcar o item certo no menu)
      if (window.top !== window) {
        var avisarRota = function () {
          window.parent.postMessage({ wedtechModulo: decodeURIComponent(location.hash.slice(1)) || "inicio" }, location.origin);
        };
        window.addEventListener("hashchange", avisarRota);
        window.addEventListener("load", avisarRota);
      }
    </script>

    <script src="../frontend/js/modulos/app/main.js"></script>
  </body>
</html>
