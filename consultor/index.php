<?php
// consultor/index.php - Área do consultor WedTech (perfis "consultor" e "admin").
// A página é só a casca: os dados vêm de api/consultor.php, que confere o perfil em cada chamada.
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../backend/db.php';
if (!is_logged_in()) {
    header('Location: ../login.php');
    exit;
}
if (must_change_password()) {
    header('Location: ../trocar-senha.php?conta=equipe');
    exit;
}
$user = get_logged_user();
if (!isStaff($user)) {
    header('Location: ../modulos/index.php');
    exit;
}
// Voltou para a área do consultor: encerra qualquer modo suporte aberto
if (!empty($_SESSION['suporte'])) {
    endSupportMode(getDb(), $user);
}
?>
<!doctype html>
<html lang="pt-BR" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#080a0d" />
    <title>WedTech — Área do consultor</title>
    <link rel="icon" href="../frontend/img/modulos/favicon-wedtech.png" type="image/png" />
    <script>
      (function () {
        var cfg = {};
        try {
          cfg = (JSON.parse(localStorage.getItem("estoque-inteligente-v2") || "null") || {}).cfg || {};
        } catch (e) {}
        document.documentElement.setAttribute("data-theme", cfg.tema === "light" ? "light" : "dark");
      })();
    </script>
    <link rel="stylesheet" href="../frontend/css/modulos/app.css" />
    <link rel="stylesheet" href="../frontend/css/modulos/brand.css" />
    <link rel="stylesheet" href="../frontend/css/modulos/app-components.css" />
    <link rel="stylesheet" href="../frontend/css/modulos/painel-skin.css" />
    <link rel="stylesheet" href="../frontend/css/consultor/consultor.css" />
    <link rel="stylesheet" href="../frontend/css/shared/alertas.css" />
  </head>
  <body>
    <div id="app"></div>
    <div id="toast" role="status" aria-live="polite"></div>
    <script>
      window.CONSULTOR = <?= json_encode(['nome' => $user['nome'], 'papel' => $user['papel']], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script src="../frontend/js/shared/alertas.js"></script>
    <script src="../frontend/js/consultor/consultor.js"></script>
  </body>
</html>
