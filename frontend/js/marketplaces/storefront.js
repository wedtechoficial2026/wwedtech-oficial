(() => {
  "use strict";

  const platform = window.WEDTECH_MARKETPLACE;
  const apiUrl = new URL("../../api/marketplace.php", location.href);
  apiUrl.searchParams.set("platform", platform);
  const productsNode = document.querySelector("#product-grid");
  const searchNode = document.querySelector("#product-search");
  const catalogMessage = document.querySelector("#catalog-message");
  const cartLinesNode = document.querySelector("#cart-lines");
  const cartTotalNode = document.querySelector("#cart-total");
  const cartCountNode = document.querySelector("#cart-count");
  const checkoutForm = document.querySelector("#checkout-form");
  const checkoutButton = document.querySelector("#checkout-button");
  const checkoutMessage = document.querySelector("#checkout-message");
  const panelOrdersLink = document.querySelector("#panel-orders-link");
  const cart = new Map();
  let catalog = null;
  let pendingCheckout = null;
  let submitting = false;
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const cartKey = (productId, variantId) => `${productId}|${variantId || ""}`;
  const myOrdersNode = document.querySelector("#my-orders");
  const myOrdersList = document.querySelector("#my-orders-list");
  const ordersKey = `wedtech-marketplace-orders-${platform}`;
  const OPEN_STATUSES = ["novo", "separando", "separado", "pronto"];
  const DONE_STATUSES = ["enviado", "retirado", "concluido"];

  // Pedidos feitos neste navegador; a chave do checkout é o que autoriza a consulta.
  function savedOrders() {
    try {
      const list = JSON.parse(localStorage.getItem(ordersKey) || "[]");
      return Array.isArray(list) ? list.filter((entry) => entry && entry.requestId) : [];
    } catch {
      return [];
    }
  }

  function rememberOrder(requestId, orderId) {
    const list = [{ requestId, orderId }, ...savedOrders().filter((entry) => entry.requestId !== requestId)].slice(0, 10);
    try { localStorage.setItem(ordersKey, JSON.stringify(list)); } catch {}
  }

  // Devolução pelo comprador: dentro do prazo o marketplace aprova e envia o código de postagem
  const RETURN_REASONS = [
    ["arrependimento", "Desisti da compra"],
    ["troca", "Quero trocar tamanho ou modelo"],
    ["defeito", "Veio com defeito"],
    ["errado", "Chegou produto errado ou diferente"],
  ];
  let openReturnFor = null;
  myOrdersList.addEventListener("click", (event) => {
    const open = event.target.closest("[data-return-for]");
    if (open) {
      openReturnFor = open.dataset.returnFor;
      refreshMyOrders();
    }
    if (event.target.closest("[data-return-cancel]")) {
      openReturnFor = null;
      refreshMyOrders();
    }
  });
  myOrdersList.addEventListener("submit", async (event) => {
    const form = event.target.closest(".return-request");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const url = new URL(apiUrl);
      url.searchParams.set("acao", "devolucao");
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: form.dataset.request, reason: form.elements.reason.value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.erro || "Não foi possível abrir a devolução.");
      openReturnFor = null;
      setMessage(`Devolução ${result.devolucao.id} aprovada. Poste o produto nos Correios com o código ${result.devolucao.reverse_code}: o reembolso sai quando a loja receber.`, true);
      panelOrdersLink.hidden = true;
    } catch (error) {
      setMessage(error.message);
    }
    refreshMyOrders();
  });

  async function refreshMyOrders() {
    const list = savedOrders();
    myOrdersNode.hidden = list.length === 0;
    if (!list.length) return;
    const url = new URL(apiUrl);
    url.searchParams.set("pedidos", list.map((entry) => entry.requestId).join(","));
    try {
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.erro || "Não foi possível consultar seus pedidos.");
      const byRequest = new Map(result.pedidos.map((order) => [order.request_id, order]));
      myOrdersList.innerHTML = list.map((entry) => {
        const order = byRequest.get(entry.requestId);
        if (!order) return `<div class="cart-line"><div><div class="cart-line-name">${esc(entry.orderId || "Pedido")}</div><div class="cart-line-detail">Aguardando confirmação da loja</div></div></div>`;
        const tone = OPEN_STATUSES.includes(order.status) ? "is-open" : DONE_STATUSES.includes(order.status) ? "is-done" : "is-cancelled";
        const items = order.items.map((item) => `${item.qty}× ${item.name}`).join(", ");
        const ret = order.return;
        const returnInfo = ret
          ? `<div class="cart-line-detail return-info">↩️ Devolução ${esc(ret.id)}: ${esc(ret.status_label)}${ret.status === "aprovada" && ret.reverse_code ? ` <b>${esc(ret.reverse_code)}</b>` : ""}</div>`
          : "";
        const returnAction = !order.can_return
          ? ""
          : openReturnFor === entry.requestId
            ? `<form class="return-request" data-request="${esc(entry.requestId)}"><label class="sr-only" for="reason-${esc(entry.requestId)}">Motivo</label><select id="reason-${esc(entry.requestId)}" name="reason" required><option value="">Por que quer devolver?</option>${RETURN_REASONS.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join("")}</select><button type="submit">Enviar solicitação</button><button type="button" class="return-link" data-return-cancel>Cancelar</button></form>`
            : `<button type="button" class="return-link" data-return-for="${esc(entry.requestId)}">Solicitar devolução</button>`;
        return `<div class="cart-line"><div><div class="cart-line-name">${esc(order.order_id)} · ${money.format(order.total)}</div><div class="cart-line-detail">${esc(items)}</div>${returnInfo}${returnAction}</div><span class="order-status ${tone}">${esc(order.status_label)}</span></div>`;
      }).join("");
    } catch (error) {
      myOrdersList.innerHTML = `<p class="empty-cart">${esc(error.message)}</p>`;
    }
  }

  function visibleProducts() {
    const query = searchNode.value.trim().toLocaleLowerCase("pt-BR");
    return (catalog?.products || []).filter((product) =>
      `${product.name} ${product.category} ${product.sku}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }

  function renderProducts() {
    const products = visibleProducts();
    catalogMessage.textContent = catalog
      ? products.length ? `${products.length} produto${products.length === 1 ? "" : "s"} no catálogo.` : "Nenhum produto encontrado."
      : "Consultando catálogo da loja…";
    productsNode.innerHTML = products.map((product) => {
      const variants = product.variants || [];
      const variantControl = variants.length
        ? `<label class="sr-only" for="variant-${esc(product.id)}">${esc(product.variantKind || "Variação")}</label><select class="variant-select" id="variant-${esc(product.id)}" data-variant-for="${esc(product.id)}"><option value="">Escolha ${esc((product.variantKind || "uma opção").toLocaleLowerCase("pt-BR"))}</option>${variants.map((variant) => `<option value="${esc(variant.id)}">${esc(variant.label)} · ${variant.stock} disponíveis</option>`).join("")}</select>`
        : "";
      const stock = variants.length
        ? variants.reduce((sum, variant) => sum + variant.stock, 0)
        : product.stock;
      return `<article class="product-card"><div class="product-art"><span class="product-emoji" aria-hidden="true">${esc(product.emoji)}</span></div><div class="product-info"><span class="product-category">${esc(product.category)}</span><h3>${esc(product.name)}</h3><p class="product-description">${esc(product.description)}</p><p class="product-price">${money.format(product.price)}</p><p class="product-stock">${stock} ${stock === 1 ? "disponível" : "disponíveis"} · SKU ${esc(product.sku)}</p>${variantControl}<button type="button" class="add-button" data-add-product="${esc(product.id)}">Adicionar ao carrinho</button></div></article>`;
    }).join("");
  }

  function currentPayload() {
    const items = [...cart.values()].map((line) => ({
      product_id: line.product.id,
      variant_id: line.variant?.id || null,
      quantity: line.quantity,
    }));
    const form = new FormData(checkoutForm);
    return {
      platform,
      customer: {
        name: String(form.get("name") || "").trim(),
        phone: String(form.get("phone") || "").trim(),
        address: String(form.get("address") || "").trim(),
      },
      items,
    };
  }

  function renderCart() {
    const lines = [...cart.values()];
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
    cartCountNode.textContent = String(count);
    cartTotalNode.textContent = money.format(total);
    checkoutButton.disabled = count === 0;
    cartLinesNode.innerHTML = lines.length ? lines.map((line) => {
      const key = cartKey(line.product.id, line.variant?.id);
      const title = `${line.product.name}${line.variant ? ` · ${line.variant.label}` : ""}`;
      return `<div class="cart-line"><div><div class="cart-line-name">${esc(title)}</div><div class="cart-line-detail">${money.format(line.product.price)} cada</div></div><span class="cart-line-total">${money.format(line.product.price * line.quantity)}</span><div class="quantity-controls"><button type="button" aria-label="Diminuir quantidade" data-quantity="-1" data-line="${esc(key)}">−</button><span>${line.quantity}</span><button type="button" aria-label="Aumentar quantidade" data-quantity="1" data-line="${esc(key)}">+</button></div></div>`;
    }).join("") : '<p class="empty-cart">Adicione produtos para começar.</p>';
  }

  function setMessage(text, success = false) {
    checkoutMessage.textContent = text;
    checkoutMessage.hidden = !text;
    checkoutMessage.classList.toggle("is-success", success);
    panelOrdersLink.hidden = !success;
  }

  function addProduct(productId) {
    const product = catalog.products.find((entry) => entry.id === productId);
    if (!product) return;
    const select = document.querySelector(`[data-variant-for="${CSS.escape(productId)}"]`);
    const variant = product.variants?.length
      ? product.variants.find((entry) => entry.id === select?.value)
      : null;
    if (product.variants?.length && !variant) {
      setMessage(`Escolha ${product.variantKind || "uma variação"} para ${product.name}.`);
      select?.focus();
      return;
    }
    const key = cartKey(product.id, variant?.id);
    const existing = cart.get(key);
    const available = variant?.stock ?? product.stock;
    if ((existing?.quantity || 0) >= available) {
      setMessage("A quantidade solicitada excede a disponibilidade informada.");
      return;
    }
    cart.set(key, { product, variant, quantity: (existing?.quantity || 0) + 1 });
    setMessage("");
    pendingCheckout = null;
    renderCart();
  }

  productsNode.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-product]");
    if (button) addProduct(button.dataset.addProduct);
  });
  cartLinesNode.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quantity]");
    if (!button) return;
    const line = cart.get(button.dataset.line);
    if (!line) return;
    const next = line.quantity + Number(button.dataset.quantity);
    const available = line.variant?.stock ?? line.product.stock;
    if (next < 1) cart.delete(button.dataset.line);
    else if (next <= available) cart.set(button.dataset.line, { ...line, quantity: next });
    else return setMessage("A quantidade solicitada excede a disponibilidade informada.");
    pendingCheckout = null;
    setMessage("");
    renderCart();
  });
  searchNode.addEventListener("input", renderProducts);
  checkoutForm.addEventListener("input", () => {
    if (pendingCheckout && JSON.stringify(currentPayload()) !== pendingCheckout.serialized) pendingCheckout = null;
  });

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!checkoutForm.reportValidity() || cart.size === 0) return;
    const payload = currentPayload();
    const serialized = JSON.stringify(payload);
    if (!pendingCheckout || pendingCheckout.serialized !== serialized) {
      pendingCheckout = {
        id: typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
              const value = Math.floor(Math.random() * 16);
              return (char === "x" ? value : (value & 3) | 8).toString(16);
            }),
        serialized,
      };
    }

    submitting = true;
    checkoutButton.disabled = true;
    checkoutButton.textContent = "Enviando pedido…";
    setMessage("");
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, request_id: pendingCheckout.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.erro || "Não foi possível enviar seu pedido.");

      const order = result.pedido;
      rememberOrder(pendingCheckout.id, order.order_id);
      refreshMyOrders();
      // O estoque desta vitrine cai na hora, sem esperar a próxima conferência
      setTimeout(refreshCatalog, 0);
      cart.clear();
      checkoutForm.reset();
      pendingCheckout = null;
      renderCart();
      setMessage(`Pedido ${order.order_id} registrado no sistema WedTech. Total demonstrativo: ${money.format(order.total)}. Nenhum pagamento foi cobrado.`, true);
    } catch (error) {
      setMessage(error.message || "Falha de conexão. Confira os dados e tente novamente.");
    } finally {
      submitting = false;
      checkoutButton.textContent = "Confirmar pedido de teste";
      checkoutButton.disabled = cart.size === 0;
    }
  });

  async function initialize() {
    try {
      const response = await fetch(apiUrl, { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.erro || "Não foi possível carregar o catálogo.");
      catalog = result.catalog;
      document.querySelector("#store-name").textContent = catalog.store.name;
      renderProducts();
      if (!catalog.connected) {
        catalogMessage.textContent = `Esta loja ainda não vende no ${catalog.marketplace}. Para ativar, conecte o canal em Canais de venda no painel WedTech.`;
      }
    } catch (error) {
      catalogMessage.textContent = error.message || "A loja não está disponível no momento.";
      productsNode.innerHTML = "";
    }
    renderCart();
  }

  // Catálogo ao vivo: venda no balcão, em outra vitrine ou mudança no painel atualiza o estoque
  // e os preços aqui sem recarregar. Só refaz a tela quando algo mudou.
  let refreshing = false;
  async function refreshCatalog() {
    if (refreshing || document.hidden || !catalog || submitting) return;
    refreshing = true;
    try {
      const response = await fetch(apiUrl, { credentials: "same-origin", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok && JSON.stringify(result.catalog) !== JSON.stringify(catalog)) {
        catalog = result.catalog;
        syncCart();
        // Guarda o tamanho escolhido em cada produto antes de redesenhar a grade
        const chosen = Object.fromEntries([...document.querySelectorAll("[data-variant-for]")].map((el) => [el.dataset.variantFor, el.value]));
        renderProducts();
        for (const [id, value] of Object.entries(chosen)) {
          const el = document.querySelector(`[data-variant-for="${CSS.escape(id)}"]`);
          if (el && [...el.options].some((o) => o.value === value)) el.value = value;
        }
        renderCart();
      }
    } catch {
      // Sem conexão agora: tenta de novo na próxima rodada
    }
    refreshing = false;
  }
  // Carrinho acompanha o catálogo novo: preço atualizado e quantidade limitada ao estoque
  function syncCart() {
    const removed = [];
    for (const [key, line] of cart) {
      const product = catalog.products.find((p) => p.id === line.product.id);
      const variant = line.variant ? product?.variants.find((v) => v.id === line.variant.id) : null;
      const available = line.variant ? variant?.stock || 0 : product?.stock || 0;
      if (!product || (line.variant && !variant) || available < 1) {
        cart.delete(key);
        removed.push(line.product.name);
      } else {
        cart.set(key, { product, variant, quantity: Math.min(line.quantity, available) });
      }
    }
    if (removed.length) setMessage(`${removed.join(", ")} acabou e saiu do seu carrinho.`);
  }

  initialize();
  refreshMyOrders();
  setInterval(refreshCatalog, 3000);
  // Voltou para a aba: confere o estoque na hora, sem esperar a próxima rodada
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshCatalog();
  });
  // Mudanças de status feitas no painel aparecem aqui sem recarregar a página.
  setInterval(() => {
    if (!document.hidden && savedOrders().length && !openReturnFor) refreshMyOrders();
  }, 5000);
})();
