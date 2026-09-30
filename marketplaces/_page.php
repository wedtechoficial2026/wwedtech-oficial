<?php
$platform = $marketplace['platform'];
$escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="<?= $escape($marketplace['theme']) ?>">
  <title><?= $escape($marketplace['title']) ?> | <?= $escape($marketplace['marketplace']) ?> · demonstração</title>
  <link rel="stylesheet" href="../../frontend/css/marketplaces/storefront.css">
</head>
<body class="marketplace marketplace--<?= $escape($platform) ?>" data-platform="<?= $escape($platform) ?>">
  <div class="demo-ribbon">Ambiente demonstrativo WedTech · não é uma loja oficial de <?= $escape($marketplace['marketplace']) ?></div>
  <header class="market-header">
    <a class="brand" href="../" aria-label="Voltar à WedTech"><span class="brand-mark"><?= $escape($marketplace['symbol']) ?></span><span><?= $escape($marketplace['marketplace']) ?><small>Compra demonstrativa</small></span></a>
    <div class="header-store"><span class="live-dot"></span><span id="store-name">Carregando loja</span></div>
    <a class="back-link" href="../">WedTech</a>
  </header>
  <main>
    <section class="market-hero">
      <div class="hero-copy"><p class="eyebrow"><?= $escape($marketplace['eyebrow']) ?></p><h1><?= $escape($marketplace['headline']) ?></h1><p><?= $escape($marketplace['description']) ?></p><div class="hero-tags"><span>Estoque compartilhado</span><span>Pedido registrado no painel</span></div></div>
      <div class="hero-mark" aria-hidden="true"><span><?= $escape($marketplace['symbol']) ?></span><small><?= $escape($marketplace['marketplace']) ?></small></div>
    </section>
    <div class="shop-layout">
      <section class="catalog-section" aria-label="Catálogo de produtos">
        <div class="section-heading"><div><p class="eyebrow">VITRINE CONECTADA</p><h2>Produtos disponíveis</h2></div><label class="search-label"><span>Buscar</span><input id="product-search" type="search" placeholder="Nome ou categoria"></label></div>
        <p id="catalog-message" class="catalog-message" role="status">Consultando catálogo da loja…</p>
        <div id="product-grid" class="product-grid"></div>
      </section>
      <aside class="checkout-panel" aria-label="Carrinho e checkout">
        <div class="cart-heading"><div><p class="eyebrow">SEU PEDIDO</p><h2>Carrinho</h2></div><span id="cart-count" class="cart-count">0</span></div>
        <div id="cart-lines" class="cart-lines"><p class="empty-cart">Adicione produtos para começar.</p></div>
        <div class="cart-total"><span>Total demonstrativo</span><strong id="cart-total">R$ 0,00</strong></div>
        <form id="checkout-form" class="checkout-form">
          <label>Nome<input name="name" required minlength="2" maxlength="100" autocomplete="name" placeholder="Seu nome"></label>
          <label>WhatsApp<input name="phone" required maxlength="24" autocomplete="tel" inputmode="tel" placeholder="(11) 99999-0000"></label>
          <label>Endereço de entrega<textarea name="address" required minlength="5" maxlength="180" autocomplete="street-address" rows="2" placeholder="Rua, número, bairro e cidade"></textarea></label>
          <p class="payment-note">Pagamento e frete são simulados. Nenhuma cobrança será feita.</p>
          <p id="checkout-message" class="checkout-message" role="alert" hidden></p>
          <a id="panel-orders-link" class="panel-orders-link" href="http://localhost:8000/modulos/index.php#pedidos" target="_blank" rel="noopener" hidden>Abrir pedido no painel WedTech ↗</a>
          <button id="checkout-button" class="checkout-button" type="submit" disabled>Confirmar pedido de teste</button>
        </form>
        <section id="my-orders" class="my-orders" aria-label="Meus pedidos" hidden>
          <div class="cart-heading"><div><p class="eyebrow">ACOMPANHAMENTO</p><h2>Meus pedidos</h2></div></div>
          <div id="my-orders-list" role="status" aria-live="polite"></div>
        </section>
      </aside>
    </div>
  </main>
  <footer class="market-footer"><span>Pedido de demonstração encaminhado para o painel de gestão WedTech.</span><a href="../">Voltar ao site WedTech</a></footer>
  <script>window.WEDTECH_MARKETPLACE = <?= json_encode($platform, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
  <script src="../../frontend/js/marketplaces/storefront.js" defer></script>
</body>
</html>
