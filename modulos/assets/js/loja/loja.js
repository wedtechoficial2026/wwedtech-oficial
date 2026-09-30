"use strict";
// Site próprio do lojista (vitrine do cliente final).
// Usa o MESMO núcleo e o MESMO estoque do painel: uma compra aqui reserva o
// produto na hora e aparece no painel (outra aba) em tempo real.
// loja.html?canal=whats vira o catálogo enviado pelo WhatsApp/Instagram.

const W = WedTech;
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = W.brl;
const FRETE = 12.9;

let state = W.loadState(localStorage) || W.seed("moda");
let storeAuthenticated = false;
const channel = new URLSearchParams(location.search || "").get("canal") === "whats" ? "whats" : "site";
let cart = [];
let view = "shop"; // shop | cart | done
let category = "";
let deliveryType = "retirada";
let lastOrder = null;
let formError = "";
let pickupStore = "loja"; // loja escolhida para retirar
let chosen = {}; // tamanho/modelo escolhido em cada produto (productId → variantId)

function persist() {
  try {
    W.saveState(localStorage, state);
    return window.WedTechServerState?.save("modular", state, W.STORAGE_KEY) ?? Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
}
function toast(text) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 3500);
}
window.addEventListener("wedtech:persistence-error", (event) => toast(event.detail.message));
window.addEventListener("wedtech:persistence-conflict", (event) => toast(event.detail.message));
function qr(data) {
  try {
    return WedTechQR.toSVG(WedTechQR.createQrCode(data, WedTechQR.QRErrorCorrectLevel.M), 170, 2);
  } catch {
    return "";
  }
}

const visible = () => state.products.filter((p) => p.channels.includes(channel));
const productOf = (id) => state.products.find((p) => p.id === id);
const inCart = (id, variantId) => cart.filter((c) => c.productId === id && (variantId === undefined || c.variantId === variantId)).reduce((a, c) => a + c.qty, 0);
const cartCount = () => cart.reduce((a, c) => a + c.qty, 0);
// Preço deste canal (com promoção, se houver)
const priceOf = (p) => W.priceFor(state, p, channel);
const cartTotal = () => cart.reduce((a, c) => a + (productOf(c.productId) ? priceOf(productOf(c.productId)) : 0) * c.qty, 0);
const variantLeft = (p, v) => W.variantFree(state, p, v) - inCart(p.id, v.id);

function availability(p) {
  const status = W.channelStatus(state, p, channel);
  const free = W.stockOf(state, p).disponivel;
  if (status === "sem_estoque" || free <= 0) return { can: false, text: "Esgotado", tone: "out" };
  if (status !== "ativo") return { can: false, text: "Indisponível", tone: "out" };
  if (free <= 3) return { can: true, free, text: "Últimas " + free + " unidades!", tone: "low" };
  return { can: true, free, text: free + " disponíveis", tone: "" };
}

function addItem(id, variantId) {
  const p = productOf(id);
  if (!p) return;
  const a = availability(p);
  if (!a.can || inCart(id) + 1 > a.free) return toast("Não temos mais unidades de " + p.name + " disponíveis.");
  let v = null;
  if (p.variants && p.variants.length) {
    v = p.variants.find((x) => x.id === (variantId || chosen[id]));
    if (!v) return toast("Escolha o " + (p.variantKind || "tamanho").toLowerCase() + " de " + p.name + ".");
    if (variantLeft(p, v) <= 0) return toast(p.name + " " + v.label + " esgotado.");
  }
  const it = cart.find((c) => c.productId === id && c.variantId === (v ? v.id : undefined));
  if (it) it.qty++;
  else cart.push({ productId: id, variantId: v ? v.id : undefined, qty: 1 });
  toast("✓ " + p.name + (v ? " " + v.label : "") + " no carrinho");
  renderStore();
}
function decItem(index) {
  const it = cart[index];
  if (!it) return;
  it.qty--;
  if (it.qty <= 0) cart.splice(index, 1);
  renderStore();
}

function header() {
  const t = W.storeTypes[state.tipo];
  return `<header class="shop-header"><div class="shop-wrap shop-head-inner"><a class="shop-brand" href="#" data-go="shop"><span class="shop-logo">${esc(t?.emoji || "🛍️")}</span><span><b>${esc(state.store.name)}</b><small>${esc(state.store.tagline)}</small></span></a><button class="shop-cart-btn" data-go="cart" aria-label="Carrinho com ${cartCount()} itens">🛒 <span>Carrinho</span>${cartCount() ? `<b>${cartCount()}</b>` : ""}</button></div></header>`;
}

function shopView() {
  const list = visible().filter((p) => !category || p.category === category);
  const cats = [...new Set(visible().map((p) => p.category))];
  return `<section class="shop-hero"><div class="shop-wrap"><h1>${channel === "whats" ? "Nosso catálogo 💬" : "Compre online, retire na loja 🏪"}</h1><p>${esc(state.store.address)} · ${esc(state.store.pickupHours)}</p><div class="shop-perks"><span>🏪 <b>Retire grátis na loja</b> em até 1 hora</span><span>🚚 Ou receba em casa por ${money(FRETE)}</span><span>🔒 Estoque real, atualizado ao vivo</span></div></div></section><main class="shop-wrap"><div class="shop-cats"><button class="${category ? "" : "on"}" data-cat="">Todos</button>${cats
    .map((c) => `<button class="${category === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join("")}</div><div class="shop-grid">${list
    .map((p) => {
      const a = availability(p);
      return `<article class="shop-card ${a.can ? "" : "out"}"><div class="shop-img">${p.image ? `<img src="${esc(p.image)}" alt="">` : `<span>${esc(p.emoji)}</span>`}</div><div class="shop-info"><small>${esc(p.category)}</small><h2>${esc(p.name)}</h2><p class="shop-price">${money(priceOf(p))}${priceOf(p) < p.price ? ` <s>${money(p.price)}</s> <span class="shop-promo">-${Math.round((1 - priceOf(p) / p.price) * 100)}%</span>` : ""}</p><p class="shop-stock ${a.tone}">${esc(a.text)}</p>${variantChips(p)}<button class="shop-btn" data-add="${p.id}" ${a.can ? "" : "disabled"}>${a.can ? (p.variants && !chosen[p.id] ? "Escolha o " + (p.variantKind || "tamanho").toLowerCase() : inCart(p.id) ? "Adicionar mais (" + inCart(p.id) + ")" : "Adicionar ao carrinho") : "Esgotado"}</button></div></article>`;
    })
    .join("")}</div>${list.length ? "" : '<p class="shop-empty">Nenhum produto nesta categoria.</p>'}</main>`;
}

function cartView() {
  if (!cart.length)
    return `<main class="shop-wrap shop-narrow"><h1>Seu carrinho</h1><p class="shop-empty">Seu carrinho está vazio.</p><button class="shop-btn" data-go="shop">← Ver produtos</button></main>`;
  const shipping = deliveryType === "entrega" ? FRETE : 0;
  return `<main class="shop-wrap shop-narrow"><button class="shop-link" data-go="shop">← Continuar comprando</button><h1>Seu carrinho</h1><div class="shop-box">${cart
    .map((c, i) => {
      const p = state.products.find((x) => x.id === c.productId);
      const v = c.variantId ? p.variants.find((x) => x.id === c.variantId) : null;
      return `<div class="shop-line"><span class="shop-line-emoji">${esc(p.emoji)}</span><div><b>${esc(p.name)}</b><small>${v ? esc(p.variantKind || "Tamanho") + " " + esc(v.label) + " · " : ""}${money(priceOf(p))}</small></div><div class="shop-qty"><button data-dec="${i}" aria-label="Diminuir">−</button><b>${c.qty}</b><button data-inc="${i}" aria-label="Aumentar">+</button></div><b>${money(priceOf(p) * c.qty)}</b></div>`;
    })
    .join("")}</div><h2>Como você quer receber?</h2><div class="shop-options"><label class="shop-option ${deliveryType === "retirada" ? "on" : ""}"><input type="radio" name="delivery" value="retirada" ${deliveryType === "retirada" ? "checked" : ""}><span>🏪</span><div><b>Retirar na loja</b><small>Grátis · pronto em até 1 hora${W.shopsOf(state).length > 1 ? "" : " · " + esc(state.store.address)}</small>${
      W.shopsOf(state).length > 1 && deliveryType === "retirada"
        ? `<select class="shop-store" name="pickup-store" aria-label="Loja de retirada">${W.shopsOf(state)
            .map((sh) => `<option value="${sh.id}" ${sh.id === pickupStore ? "selected" : ""}>${esc(sh.name)} — ${esc(sh.address || "")}</option>`)
            .join("")}</select>`
        : ""
    }</div></label><label class="shop-option ${deliveryType === "entrega" ? "on" : ""}"><input type="radio" name="delivery" value="entrega" ${deliveryType === "entrega" ? "checked" : ""}><span>🚚</span><div><b>Receber em casa</b><small>${money(FRETE)} · entrega no bairro</small></div></label></div><form id="checkout" class="shop-form"><h2>Seus dados</h2><label>Nome<input name="name" required maxlength="80" autocomplete="name"></label><label>WhatsApp<input name="phone" required maxlength="20" inputmode="tel" autocomplete="tel" placeholder="(11) 90000-0000"></label>${
    deliveryType === "entrega" ? '<label>Endereço<input name="address" required maxlength="140" autocomplete="street-address"></label>' : ""
  }${formError ? `<p class="shop-error">⚠ ${esc(formError)}</p>` : ""}<div class="shop-total"><span>Produtos</span><b>${money(cartTotal())}</b></div>${
    shipping ? `<div class="shop-total"><span>Frete</span><b>${money(shipping)}</b></div>` : ""
  }<div class="shop-total big"><span>Total</span><b>${money(cartTotal() + shipping)}</b></div><button class="shop-btn big">Finalizar pedido</button><p class="shop-note">Pagamento simulado (demonstração). O produto fica reservado para você na hora.</p></form></main>`;
}

function doneView() {
  const o = state.orders.find((x) => x.id === lastOrder);
  if (!o) return shopView();
  const msgs = state.messages.filter((m) => m.orderId === o.id);
  const statusText = {
    novo: "Recebemos seu pedido e já estamos separando.",
    separando: "Estamos separando seus produtos.",
    pronto: "Seu pedido está pronto! Venha retirar.",
    separado: "Pedido separado, saindo para entrega em breve.",
    retirado: "Pedido retirado. Obrigado pela compra! 💙",
    enviado: "Seu pedido saiu para entrega.",
    expirado: "A reserva expirou porque o pedido não foi retirado em 48 h.",
  };
  return `<main class="shop-wrap shop-narrow"><div class="shop-done"><div class="shop-check">✓</div><h1>Pedido ${esc(o.id)} confirmado!</h1><p class="shop-status">${esc(statusText[o.status] || W.orderStatus[o.status])}</p>${
    o.type === "retirada"
      ? `<div class="shop-qr">${qr(o.pickupCode)}<b>${esc(o.pickupCode)}</b><small>Mostre este QR code no balcão para retirar</small></div><p>📍 ${esc(W.shopsOf(state).find((x) => x.id === (o.store || "loja"))?.name || "")} — ${esc(W.shopsOf(state).find((x) => x.id === (o.store || "loja"))?.address || state.store.address)}<br>🕘 ${esc(state.store.pickupHours)}</p>`
      : `<p>🚚 Entrega em: ${esc(o.customer.address)}</p>`
  }<p class="shop-note">Você vai receber os avisos no WhatsApp ${esc(o.customer.phone)}.</p></div><h2>📱 Suas mensagens no WhatsApp</h2>${
    msgs.length
      ? msgs.map((m) => `<div class="shop-wa">${esc(m.text)}<small>${esc(W.timeLabel(state, m.ts))}</small></div>`).join("")
      : '<p class="shop-empty small">Assim que a loja separar seu pedido, a mensagem aparece aqui.</p>'
  }<button class="shop-btn" data-go="shop">← Voltar para a loja</button></main>`;
}

function renderStore() {
  $("#app").innerHTML =
    header() +
    (view === "cart" ? cartView() : view === "done" ? doneView() : shopView()) +
    `<footer class="shop-footer"><div class="shop-wrap">${esc(state.store.name)} · ${esc(state.store.whatsapp)} · Loja online criada com <b>WedTech</b> · Demonstração<br><a href="index.html">Painel do lojista →</a></div></footer>`;
}

async function checkout(form) {
  const customer = {
    name: form.elements.name.value.trim(),
    phone: form.elements.phone.value.trim(),
    address: form.elements.address ? form.elements.address.value.trim() : "",
  };
  if (customer.name.length < 2) return (formError = "Informe seu nome."), renderStore();
  if (customer.phone.replace(/\D/g, "").length < 10) return (formError = "Informe um WhatsApp com DDD."), renderStore();
  if (deliveryType === "entrega" && customer.address.length < 5) return (formError = "Informe o endereço de entrega."), renderStore();
  // Recarrega o estoque mais recente antes de reservar (outra aba pode ter vendido)
  state = W.loadState(localStorage) || state;
  const previousState = JSON.stringify(state);
  try {
    const o = W.createOrder(state, { channel, type: deliveryType, customer, items: cart, shipping: deliveryType === "entrega" ? FRETE : 0, store: pickupStore });
    if (storeAuthenticated && !(await persist())) {
      state = W.loadState({ getItem: () => previousState }) || state;
      W.saveState(localStorage, state);
      await persist();
      throw new Error("Não foi possível salvar o pedido no banco de dados. Tente novamente.");
    }
    lastOrder = o.id;
    cart = [];
    formError = "";
    view = "done";
    window.scrollTo?.(0, 0);
  } catch (err) {
    formError = err.message;
  }
  renderStore();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-add],[data-dec],[data-inc],[data-go],[data-cat],[data-choose]");
  if (!b) return;
  e.preventDefault();
  if (b.dataset.choose) {
    const [pid, vid] = b.dataset.choose.split(":");
    chosen[pid] = vid;
    return renderStore();
  }
  if (b.dataset.add) return addItem(b.dataset.add);
  if (b.dataset.inc !== undefined) {
    const it = cart[Number(b.dataset.inc)];
    return it && addItem(it.productId, it.variantId);
  }
  if (b.dataset.dec !== undefined) return decItem(Number(b.dataset.dec));
  if (b.dataset.cat !== undefined) {
    category = b.dataset.cat;
    return renderStore();
  }
  if (b.dataset.go) {
    view = b.dataset.go;
    formError = "";
    renderStore();
    window.scrollTo?.(0, 0);
  }
});
document.addEventListener("change", (e) => {
  if (e.target.name === "pickup-store") {
    pickupStore = e.target.value;
    return;
  }
  if (e.target.name === "delivery") {
    deliveryType = e.target.value;
    renderStore();
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "checkout") return;
  e.preventDefault();
  checkout(e.target);
});
// Estoque ao vivo: quando o painel vende ou separa, a vitrine atualiza sozinha
addEventListener("storage", (e) => {
  if (e.key !== W.STORAGE_KEY) return;
  const fresh = W.loadState(localStorage);
  if (!fresh) return;
  state = fresh;
  // Tira do carrinho o que acabou em outro canal
  cart = cart.filter((c) => {
    const p = productOf(c.productId);
    if (!p || !availability(p).can) return false;
    const v = c.variantId && p.variants ? p.variants.find((x) => x.id === c.variantId) : null;
    return !v || W.variantFree(state, p, v) > 0;
  });
  const focused = document.activeElement?.closest?.("#checkout");
  if (!focused) renderStore();
});

(async function initializeStore() {
  const remote = await window.WedTechServerState?.loadRemote("modular", W.STORAGE_KEY);
  storeAuthenticated = Boolean(remote?.authenticated);
  if (storeAuthenticated) {
    state = remote.data
      ? W.loadState({ getItem: () => JSON.stringify(remote.data) }) || W.seed("moda")
      : W.seed("moda");
    if (!remote.data || remote.needsSave) await persist();
  } else {
    state = W.loadState(localStorage) || W.seed("moda");
    if (!W.loadState(localStorage)) persist();
  }
  renderStore();
})();

// Escolha de tamanho/modelo no cartão do produto
function variantChips(p) {
  if (!p.variants || !p.variants.length) return "";
  return `<div class="shop-sizes" role="group" aria-label="${esc(p.variantKind || "Tamanho")}">${p.variants
    .map((v) => {
      const left = variantLeft(p, v);
      return `<button type="button" class="${chosen[p.id] === v.id ? "on" : ""}" data-choose="${p.id}:${v.id}" ${left <= 0 ? "disabled" : ""} title="${left} disponíveis">${esc(v.label)}</button>`;
    })
    .join("")}</div>`;
}
