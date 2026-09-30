"use strict";
// Ações do painel: cada botão/formulário chama uma função daqui, que usa o
// núcleo (WedTech) para mudar os dados, salva e redesenha a tela.

// Executa uma ação com indicador de "carregando", salva e trata erros
async function act(fn, { delay = 450, success, onError } = {}) {
  if (ui.busy) return;
  ui.busy = true;
  render();
  await pause(delay);
  let result;
  try {
    result = await fn();
    if (!(await save())) throw new Error("Não foi possível confirmar a alteração no banco de dados.");
    if (success) toast(typeof success === "function" ? success(result) : success);
  } catch (err) {
    if (onError) onError(err.message);
    else toast(err.message);
  }
  ui.busy = false;
  render();
  return result;
}

// ---------------------------------------------------------------------------
// Login, primeiro acesso e tour
async function handleLogin(form) {
  if (ui.loginBusy) return;
  const email = form.elements.email.value.trim();
  if (!email || !form.elements.password.value) {
    ui.loginError = "Informe e-mail e senha.";
    return render();
  }
  ui.loginBusy = true;
  ui.loginError = "";
  render();
  await pause(600);
  ui.loginBusy = false;
  ui.loggedIn = true;
  try {
    sessionStorage.setItem("wedtech-session", "1");
  } catch {}
  if (state.setupDone && !seenTour()) ui.tourStep = 0;
  render();
}
function seenTour() {
  try {
    return localStorage.getItem("wedtech-tour-seen") === "1";
  } catch {
    return true;
  }
}
function finishTour() {
  ui.tourStep = null;
  try {
    localStorage.setItem("wedtech-tour-seen", "1");
  } catch {}
}
function chooseStoreType(tipo) {
  state = W.seed(tipo);
  state.setupDone = true;
  save();
  resetUiForNewState();
  ui.tourStep = seenTour() ? null : 0;
  go("inicio");
  render();
}
function resetUiForNewState() {
  stopLive();
  stopCamera();
  Object.assign(ui, {
    drawer: null,
    notifOpen: false,
    cart: [],
    payment: null,
    counterStore: "loja",
    returnFeedback: "",
    counterFeedback: null,
    counterDelivery: false,
    scanFeedback: null,
    pickupFeedback: null,
    orderFeedback: "",
    receiveFeedback: "",
    chat: [],
    dashAnswer: "",
    query: "",
    one: null,
    supplierFormOpen: false,
    expenseFormOpen: false,
  });
}
function logout() {
  ui.loggedIn = false;
  ui.loginError = "";
  resetUiForNewState();
  try {
    sessionStorage.removeItem("wedtech-session");
  } catch {}
  render();
}

// ---------------------------------------------------------------------------
// Balcão (PDV)
// Quantas unidades daquele produto (e tamanho) já estão no carrinho
const inCartQty = (productId, variantId) =>
  ui.cart.filter((it) => it.productId === productId && (variantId === undefined || it.variantId === variantId)).reduce((a, it) => a + it.qty, 0);

function addToCart(productId, fromCode, variantId) {
  const p = productById(productId);
  if (!p) return;
  const free = W.stockOf(state, p).disponivel;
  if (inCartQty(productId) + 1 > free) {
    ui.counterFeedback = { ok: false, text: p.name + ": só " + plural(free, "unidade disponível", "unidades disponíveis") + "." };
    return render();
  }
  // Produto com grade: usa o tamanho bipado ou o que tem mais estoque livre
  if (p.variants && p.variants.length) {
    const freeOf = (v) => W.variantFree(state, p, v) - inCartQty(p.id, v.id);
    const v = variantId ? p.variants.find((x) => x.id === variantId) : [...p.variants].sort((a, b) => freeOf(b) - freeOf(a))[0];
    if (!v || freeOf(v) <= 0) {
      ui.counterFeedback = { ok: false, text: p.name + (v ? " " + v.label : "") + ": sem estoque nesse " + (p.variantKind || "tamanho").toLowerCase() + "." };
      return render();
    }
    variantId = v.id;
  }
  const it = ui.cart.find((x) => x.productId === productId && x.variantId === variantId);
  if (it) it.qty++;
  else ui.cart.push({ productId, variantId, qty: 1 });
  const v = variantId ? p.variants.find((x) => x.id === variantId) : null;
  ui.counterFeedback = { ok: true, text: (fromCode ? "Bipado: " : "Adicionado: ") + p.name + (v ? " · " + v.label : "") + " (" + money(W.priceFor(state, p, "loja")) + ")" };
  render();
  $("#balcao-code")?.focus();
}
function handleCounterScan(form) {
  try {
    const { product, variant } = W.resolveCode(state, form.elements.code.value);
    addToCart(product.id, true, variant ? variant.id : undefined);
  } catch (err) {
    ui.counterFeedback = { ok: false, text: err.message };
    render();
    $("#balcao-code")?.focus();
  }
}
function changeCartQty(index, delta) {
  const it = ui.cart[index];
  if (!it) return;
  if (delta > 0) return addToCart(it.productId, false, it.variantId);
  it.qty--;
  if (it.qty <= 0) ui.cart.splice(index, 1);
  render();
}
function changeCartVariant(index, variantId) {
  const it = ui.cart[index];
  const p = it && productById(it.productId);
  if (!p) return;
  const v = p.variants.find((x) => x.id === variantId);
  const free = W.variantFree(state, p, v) - inCartQty(p.id, v.id);
  if (free < it.qty) {
    toast(p.name + " " + v.label + ": só " + plural(Math.max(0, free), "unidade disponível", "unidades disponíveis") + ".");
    return render();
  }
  it.variantId = variantId;
  render();
}
// Pagamento: Pix e maquininha confirmam sozinhos (simulado); dinheiro calcula o troco
function startPayment() {
  if (!ui.cart.length || ui.busy) return;
  ui.payment = { stage: "choose" };
  render();
}
function choosePayment(method) {
  const token = Date.now();
  ui.payment = { stage: method, token };
  render();
  if (method !== "dinheiro" && method !== "vale")
    setTimeout(() => {
      if (ui.payment && ui.payment.token === token) finishSale(method);
    }, method === "pix" ? 3000 : 2200);
}
function payCash(form) {
  finishSale("dinheiro", Number(form.elements.received.value));
}
function payCredit(form) {
  ui.payment = { stage: "vale", credit: form.elements.code.value.trim().toUpperCase() };
  finishSale("vale");
}
async function finishSale(method = "pix", received) {
  const r = await act(() => W.sellCounter(state, ui.cart, { payment: method, received, credit: ui.payment?.credit, store: ui.counterStore }), {
    delay: 400,
    success: (res) =>
      "Pagamento aprovado (" + W.paymentMethods[method].label + "): " + money(res.order.total) + "." + (res.order.payment.change ? " Troco: " + money(res.order.payment.change) + "." : ""),
    onError: (msg) => (ui.counterFeedback = { ok: false, text: msg }),
  });
  ui.payment = null;
  if (r) {
    ui.cart = [];
    ui.counterFeedback = { ok: true, text: "Venda " + r.order.id + " paga com " + W.paymentMethods[method].label + ". Nota fiscal " + r.invoice.id + " emitida." };
    openDrawer("doc", "invoice:" + r.invoice.id);
  }
  render();
}
async function counterDeliveryOrder(form) {
  const customer = { name: form.elements.name.value, phone: form.elements.phone.value, address: form.elements.address.value };
  const o = await act(() => W.sellCounterDelivery(state, ui.cart, customer, ui.counterStore), {
    success: (o) => "Pedido " + o.id + " criado para entrega. Ele está na fila de separação.",
    onError: (msg) => (ui.counterFeedback = { ok: false, text: msg }),
  });
  if (o) {
    ui.cart = [];
    ui.counterDelivery = false;
    ui.counterFeedback = { ok: true, text: "Pedido " + o.id + " registrado: sai do depósito para " + o.customer.name + "." };
    render();
  }
}
async function pickupByCode(form) {
  const code = form.elements.code.value;
  const o = await act(() => W.deliverByCode(state, code), {
    success: (o) => "Pedido " + o.id + " entregue para " + o.customer.name + ".",
    onError: (msg) => (ui.pickupFeedback = { ok: false, text: msg }),
  });
  if (o) {
    ui.pickupFeedback = { ok: true, text: "Pedido " + o.id + " entregue para " + o.customer.name + ". Estoque baixado e nota " + o.invoiceId + " emitida." };
    render();
  }
}

// ---------------------------------------------------------------------------
// Pedidos
async function orderScan(form) {
  const id = ui.drawer?.id;
  if (!id) return;
  ui.orderFeedback = "";
  await act(() => W.scanOrderItem(state, id, form.elements.code.value), { delay: 300, onError: (msg) => (ui.orderFeedback = msg) });
  $("#pedido-scan-code")?.focus();
}
async function orderPickup(form) {
  const id = ui.drawer?.id;
  if (!id) return;
  ui.orderFeedback = "";
  await act(() => W.deliverPickup(state, id, form.elements.code.value), {
    success: (o) => "Pedido " + o.id + " entregue para " + o.customer.name + ".",
    onError: (msg) => (ui.orderFeedback = msg),
  });
}
function confirmSeparation() {
  const id = ui.drawer?.id;
  return act(() => W.confirmSeparation(state, id), {
    success: (o) => (o.status === "pronto" ? "Pedido pronto! O cliente foi avisado pelo WhatsApp." : "Pedido separado. Pronto para despachar."),
    onError: (msg) => (ui.orderFeedback = msg),
  });
}
function dispatchOrder(id) {
  return act(() => W.dispatchOrder(state, id), { delay: 600, success: (o) => "Pedido " + o.id + " despachado. NF e etiqueta geradas." });
}
function simulateMarketplaceOrder(channel) {
  const options = state.connected.filter((c) => W.isExternal(c));
  const pick = channel || options[state.orders.length % Math.max(1, options.length)];
  return act(() => W.simulateOrder(state, pick), { success: (o) => "Novo pedido " + o.id + " no " + W.channelById(o.channel).name + "." });
}

// ---------------------------------------------------------------------------
// Estoque
async function handleEntrada(form) {
  const code = form.elements.code.value;
  const qty = form.elements.qty.value;
  ui.entradaLocal = form.elements.local ? form.elements.local.value : "loja";
  ui.scanFeedback = null;
  const r = await act(() => W.receiveGoods(state, code, qty, ui.entradaLocal), {
    onError: (msg) => (ui.scanFeedback = { ok: false, text: msg }),
  });
  if (r) {
    const st = W.stockOf(state, r.product);
    ui.scanFeedback = {
      ok: true,
      text:
        "Entrada de " + r.product.name + " registrada. Disponível agora: " + st.disponivel + " un." +
        (r.po ? " Conferido com o pedido " + r.po.id + (r.po.status === "recebido" ? " (completo)." : ".") : ""),
    };
    toast(r.product.lock ? "Entrada registrada." : "Entrada registrada. Estoque sincronizado em todos os canais.");
    render();
    $("#entrada-code")?.focus();
  }
}
function refillShelf(productId) {
  const p = productById(productId);
  const qty = p ? W.shelfRefill(state, p) : 0;
  return act(() => W.transferStock(state, productId, "deposito", "loja", qty), {
    success: () => "Prateleira reposta: " + qty + " un. de " + p.name + " saíram do depósito.",
  });
}
function setMinStock(productId, value) {
  try {
    const before = state.purchaseOrders.length;
    const p = W.updateProduct(state, productId, { minStock: value });
    save();
    toast(
      state.purchaseOrders.length > before
        ? "Mínimo salvo. " + p.name + " já está abaixo dele: a IA preparou um pedido ao fornecedor."
        : "Estoque mínimo de " + p.name + " atualizado para " + p.minStock + ".",
    );
  } catch (err) {
    toast(err.message);
  }
  render();
}

// ---------------------------------------------------------------------------
// Produtos e canais
function saveProductSettings(form) {
  try {
    W.updateProduct(state, form.dataset.id, { minStock: form.elements.minStock.value, supplierId: form.elements.supplierId.value });
    save();
    toast("Reposição automática atualizada.");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function togglePublish(ref, on) {
  const [productId, channel] = ref.split(":");
  try {
    const p = W.setChannelPublished(state, productId, channel, on);
    save();
    toast((on ? "Publicado em " : "Retirado de ") + W.channelById(channel).name + ": " + p.name + ".");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function connectChannel(id) {
  return act(() => W.connectChannel(state, id), { delay: 900, success: (c) => c.name + " conectado. Catálogo publicado com o mesmo estoque." });
}
function reactivateAds(productId) {
  return act(() => W.reactivateAds(state, productId), { success: (p) => "Anúncios de " + p.name + " reativados." });
}
async function fixProductIssue() {
  const p = productById(ui.drawer?.id);
  if (!p) return;
  await act(
    () => {
      p.issue = false;
      W.pushNotification(state, "canal", "Anúncio de " + p.name + " corrigido na Shopee pela WedTech AI", "produtos");
      return p;
    },
    { delay: 800, success: "Título da Shopee otimizado. Problema resolvido." },
  );
}

// Preço por canal e promoções
function savePricing(form) {
  try {
    const ch = form.dataset.channel;
    const v = W.setChannelMarkup(state, ch, form.elements.pct.value);
    save();
    toast("Preço no " + W.channelById(ch).name + ": " + (v > 0 ? "+" : "") + v + "% sobre o preço da loja.");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function applyMarkup(ch) {
  const v = W.setChannelMarkup(state, ch, W.suggestedMarkup(ch));
  save();
  toast("Sugestão da IA aplicada: +" + v + "% no " + W.channelById(ch).name + " para cobrir a taxa do canal.");
  render();
}
function promoFromLot(ref) {
  const [productId, pct, days] = ref.split(":");
  try {
    W.applyPromo(state, productId, pct, Number(days));
    save();
    toast("Promoção de " + pct + "% criada no balcão, no site e no WhatsApp. Esse lote sai primeiro.");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function savePromo(form) {
  try {
    const pr = W.applyPromo(state, form.dataset.id, form.elements.pct.value, Number(form.elements.days.value) || 7);
    save();
    toast("Promoção de " + pr.pct + "% criada no balcão, no site e no WhatsApp.");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function removePromo(productId) {
  W.clearPromo(state, productId);
  save();
  toast("Promoção encerrada.");
  render();
}

// ---------------------------------------------------------------------------
// Devolução e troca em qualquer canal
function returnLookup(form) {
  try {
    const o = W.findOrderByDoc(state, form.elements.code.value);
    ui.returnFeedback = "";
    openDrawer("pedido", o.id);
    if (!["retirado", "enviado", "concluido"].includes(o.status)) toast("Este pedido ainda não foi entregue ao cliente, então não pode ser devolvido.");
  } catch (err) {
    ui.returnFeedback = err.message;
  }
  render();
}
async function submitReturn(form) {
  const id = ui.drawer?.id;
  const lines = Array.from(form.querySelectorAll('input[name^="qty-"]')).map((el) => ({ index: Number(el.name.slice(4)), qty: Number(el.value) }));
  const r = await act(
    () =>
      W.registerReturn(state, id, {
        lines,
        reason: form.elements.reason.value,
        condition: form.elements.condition.value,
        refund: form.elements.refund.value,
        store: form.elements.store ? form.elements.store.value : "loja",
      }),
    {
      success: (r) =>
        "Devolução registrada. " +
        (r.lines.some((l) => l.back) ? "O produto voltou para a venda em todos os canais. " : "") +
        (r.creditCode ? "Vale-troca " + r.creditCode + " de " + money(r.value) + " gerado." : "Estorno de " + money(r.value) + "."),
    },
  );
  if (r) ui.pedidosTab = "devolucoes";
}

// Lojas (filiais) e transferências
function handleAddShop(form) {
  try {
    const sh = W.addShop(state, { name: form.elements.name.value, address: form.elements.address.value });
    save();
    toast("Loja " + sh.name + " cadastrada. Abasteça pelo depósito em Estoque.");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function restockShop(shopId) {
  return act(() => W.restockShop(state, shopId), {
    delay: 600,
    success: (list) => "Transferidas " + plural(list.reduce((a, x) => a + x.qty, 0), "unidade", "unidades") + " do depósito para a " + W.locName(state, shopId) + ".",
  });
}
function handleTransfer(form) {
  const f = form.elements;
  return act(() => W.transferStock(state, f.product.value, f.from.value, f.to.value, f.qty.value), {
    success: (p) => "Transferência registrada: " + f.qty.value + " un. de " + p.name + " para a " + W.locName(state, f.to.value) + ".",
  });
}

// ---------------------------------------------------------------------------
// Compras e fornecedores
function confirmPO(poId) {
  const qtys = {};
  document.querySelectorAll('[data-po-qty^="' + poId + ':"]').forEach((el) => (qtys[el.dataset.poQty.split(":")[1]] = el.value));
  return act(() => W.confirmPurchaseOrder(state, poId, qtys), { success: (po) => "Pedido " + po.id + " enviado para " + supplierName(po.supplierId) + "." });
}
function discardPO(poId) {
  return act(() => W.discardPurchaseOrder(state, poId), { success: "Pedido descartado. A IA não vai sugerir de novo nas próximas 24 h." });
}
function receiveAll(poId) {
  return act(() => W.receivePurchaseOrder(state, poId), { delay: 600, success: (po) => "Pedido " + po.id + " recebido. Estoque reposto." });
}
async function receiveScan(form) {
  const poId = ui.drawer?.id;
  const po = state.purchaseOrders.find((x) => x.id === poId);
  if (!po) return;
  ui.receiveFeedback = "";
  const code = form.elements.code.value;
  const r = await act(
    () => {
      const p = W.findByCode(state, code);
      const item = po.items.find((i) => i.productId === p.id);
      if (!item) throw Error(p.name + " não faz parte do pedido " + po.id + ".");
      const rest = item.qty - item.received;
      if (rest <= 0) throw Error(p.name + " já foi recebido por completo.");
      const qty = Number(form.elements.qty.value) > 0 ? Math.min(rest, Number(form.elements.qty.value)) : rest;
      return W.receiveGoods(state, code, qty, "deposito");
    },
    { onError: (msg) => (ui.receiveFeedback = msg) },
  );
  if (r) {
    toast(r.po?.status === "recebido" ? "Pedido " + r.po.id + " completo! Anúncios reativados pela automação." : "Entrada de " + r.product.name + " registrada.");
    $("#receber-code")?.focus();
  }
}
function changeSupplier(id, patch) {
  try {
    const before = state.products.filter((p) => p.lock).length;
    const f = W.updateSupplier(state, id, patch);
    save();
    const after = state.products.filter((p) => p.lock).length;
    toast(
      after > before
        ? "Prazo atualizado. Com a entrega mais demorada, a IA pausou anúncios nos marketplaces."
        : after < before
          ? "Prazo atualizado. Com a entrega mais rápida, a IA reativou anúncios."
          : f.name + " atualizado.",
    );
  } catch (err) {
    toast(err.message);
  }
  render();
}
function handleAddSupplier(form) {
  try {
    const f = W.addSupplier(state, {
      name: form.elements.name.value,
      cnpj: form.elements.cnpj.value,
      contact: form.elements.contact.value,
      whatsapp: form.elements.whatsapp.value,
      leadTimeDays: form.elements.leadTimeDays.value,
      minOrder: form.elements.minOrder.value,
    });
    save();
    ui.supplierFormOpen = false;
    toast("Fornecedor cadastrado: " + f.name + ".");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function handleAddExpense(form) {
  try {
    W.addExpense(state, { category: form.elements.category.value, amount: form.elements.amount.value, description: form.elements.description.value });
    save();
    ui.expenseFormOpen = false;
    toast("Despesa registrada.");
  } catch (err) {
    toast(err.message);
  }
  render();
}

// ---------------------------------------------------------------------------
// Datas especiais e sazonalidade
async function prepareEvent() {
  const created = await act(() => W.prepareEvent(state, ui.eventId), {
    delay: 800,
    success: (list) => "A IA preparou " + plural(list.length, "pedido", "pedidos") + " ao fornecedor. Confirme em Compras e fornecedores.",
  });
  if (created) go("compras");
}
function addEvent(form) {
  try {
    const ev = W.addCustomEvent(state, {
      name: form.elements.name.value,
      date: form.elements.date.value,
      increase: form.elements.increase.value,
      windowDays: form.elements.windowDays.value,
    });
    ui.eventId = ev.id;
    save();
    toast("Evento “" + ev.name + "” adicionado ao planejamento da IA.");
  } catch (err) {
    toast(err.message);
  }
  render();
}
function removeEvent(id) {
  W.removeCustomEvent(state, id);
  save();
  toast("Evento removido.");
  render();
}

// ---------------------------------------------------------------------------
// Automações e operação ao vivo
function toggleAutomation(id, on) {
  W.setAutomation(state, id, on);
  save();
  toast(W.automationRules.find((r) => r.id === id).title + (on ? " ligada." : " desligada."));
  render();
}
function advanceTime() {
  return act(
    () => {
      const before = state.orders.filter((o) => o.status === "expirado").length;
      W.advanceTime(state, 48);
      return state.orders.filter((o) => o.status === "expirado").length - before;
    },
    { delay: 700, success: (n) => "⏩ +48 h simuladas. " + (n ? plural(n, "reserva liberada", "reservas liberadas") + " pela automação." : "Nenhuma reserva vencida.") },
  );
}
function liveTick() {
  const options = state.connected.filter((c) => c !== "loja");
  if (!options.length) return;
  try {
    const o = W.simulateOrder(state, options[Math.floor(Math.random() * options.length)]);
    save();
    toast("🛒 Novo pedido " + o.id + " no " + W.channelById(o.channel).name + ".");
    render();
  } catch {}
}
function scheduleLive() {
  clearTimeout(ui.liveTimer);
  ui.liveTimer = setTimeout(() => {
    if (!ui.live) return;
    if (!ui.busy) liveTick();
    scheduleLive();
  }, 9000);
}
function stopLive() {
  ui.live = false;
  clearTimeout(ui.liveTimer);
}

// ---------------------------------------------------------------------------
// ADS
function readAdsForm(form) {
  for (const key of ["name", "category", "sku", "barcode", "price", "cost", "stockLoja", "stockDeposito", "minStock", "supplierId", "description", "sizes", "shelfLifeDays"])
    if (form.elements[key]) ui.one.draft[key] = form.elements[key].value.trim();
  ui.one.draft.variantKind = state.tipo === "eletronicos" ? "Modelo" : "Tamanho";
  ui.one.selected = Array.from(form.querySelectorAll('[name="channel"]:checked')).map((el) => el.value);
}
async function prepareAds(form) {
  readAdsForm(form);
  const d = ui.one.draft;
  if (!ui.one.selected.length) return toast("Selecione pelo menos um canal online.");
  if (state.products.some((p) => p.sku.toLowerCase() === d.sku.toLowerCase())) return toast("Este SKU já existe. Use outro.");
  if (!d.name || !d.sku || !d.description || !(Number(d.price) > 0)) return toast("Preencha nome, SKU, preço e descrição.");
  ui.busy = true;
  ui.one.stage = 1;
  ui.one.progress = 0;
  render();
  for (let i = 1; i <= 5; i++) {
    await pause(320);
    ui.one.progress = i;
    render();
  }
  ui.one.ads = buildAds(d, ui.one.selected);
  ui.one.stage = ui.one.ads.some((a) => a.warning) ? 2 : 3;
  ui.busy = false;
  render();
}
async function fixAds() {
  await act(
    () => {
      ui.one.ads.forEach((ad) => {
        if (ad.channel === "shopee") ad.title = (ui.one.draft.name + " | " + ui.one.draft.category).slice(0, 70);
        if (ad.warning) ad.fixed = true;
      });
      ui.one.stage = 3;
    },
    { delay: 800, success: "Anúncios ajustados pela WedTech AI." },
  );
}
async function publishAds() {
  if (ui.busy || ui.one.ads.some((a) => a.warning && !a.fixed)) return;
  ui.busy = true;
  ui.one.stage = 4;
  ui.one.progress = 0;
  render();
  for (let i = 0; i < ui.one.ads.length; i++) {
    await pause(450);
    ui.one.progress = i + 1;
    render();
  }
  try {
    const p = W.publish(state, ui.one.draft, ui.one.selected, ui.one.ads);
    ui.one.publishedId = p.id;
    ui.one.stage = 5;
    save();
    toast("Produto publicado em " + plural(p.channels.length, "canal", "canais") + ".");
  } catch (err) {
    ui.one.stage = 3;
    toast(err.message);
  }
  ui.busy = false;
  render();
}
function fillAdsExample() {
  const ex = adsExamples[state.tipo] || adsExamples.moda;
  const n = state.products.length + 1;
  Object.assign(ui.one.draft, {
    ...ex,
    sku: "NOVO-" + String(n).padStart(3, "0"),
    barcode: "",
    price: String(ex.price),
    cost: String(ex.cost),
    stockLoja: "6",
    stockDeposito: "18",
    minStock: "8",
  });
  ui.one.draft.description = aiDescription(ui.one.draft);
  render();
  toast("Exemplo preenchido. Você pode editar todos os campos.");
}

// ---------------------------------------------------------------------------
// WedTech AI
async function ask(q) {
  if (ui.busy || !String(q || "").trim()) return;
  ui.chat.push({ role: "user", text: q.trim() });
  ui.busy = true;
  render();
  await pause(600);
  ui.chat.push({ role: "assistant", text: W.answer(state, q) });
  ui.busy = false;
  render();
  $("#chat-form input")?.focus();
  $(".messages")?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
async function askDashboard(q) {
  if (ui.busy || !String(q || "").trim()) return;
  ui.busy = true;
  ui.dashAnswer = "";
  render();
  await pause(500);
  ui.dashAnswer = W.answer(state, q);
  ui.busy = false;
  render();
}

// ---------------------------------------------------------------------------
// Configurações
function saveStore(form) {
  const name = form.elements.name.value.trim();
  if (!name) return toast("Informe o nome da loja.");
  Object.assign(state.store, {
    name,
    owner: form.elements.owner.value.trim(),
    cnpj: form.elements.cnpj.value.trim(),
    whatsapp: form.elements.whatsapp.value.trim(),
    pickupHours: form.elements.pickupHours.value.trim(),
    address: form.elements.address.value.trim(),
  });
  save();
  toast("Dados da loja atualizados. O site já mostra as novas informações.");
  render();
}
// Loja com ou sem depósito separado (fundos / outro endereço)
function toggleDeposito(on) {
  if (!on && typeof confirm === "function" && !confirm("Sua loja não tem depósito separado? Tudo o que está no depósito passa a contar como estoque da loja.")) return render();
  W.setHasDeposito(state, on);
  save();
  toast(on ? "Depósito ativado: agora você controla prateleira e depósito separados." : "Pronto: todo o estoque agora fica na loja.");
  render();
}
function talkToConsultant() {
  toast("Pedido enviado! Seu consultor vai chamar você no WhatsApp para ajustar o plano e os canais.");
}
function changeStoreType(tipo) {
  if (tipo === state.tipo) return;
  if (typeof confirm === "function" && !confirm("Trocar o tipo de loja recomeça a demonstração com outros produtos. Continuar?")) return;
  state = W.seed(tipo);
  state.setupDone = true;
  save();
  resetUiForNewState();
  toast("Loja trocada para " + W.storeTypes[tipo].label + ".");
  go("inicio");
  render();
}
function resetDemo() {
  const tipo = state.tipo;
  state = W.seed(tipo);
  state.setupDone = true;
  save();
  resetUiForNewState();
  go("inicio");
  render();
  toast("Demonstração reiniciada.");
}
function copyCatalogLink() {
  const url = new URL("loja.html?canal=whats", location.href).href;
  (navigator.clipboard?.writeText(url) || Promise.reject())
    .then(() => toast("Link do catálogo copiado: cole no WhatsApp ou na bio do Instagram."))
    .catch(() => toast("Link do catálogo: " + url));
}

// ---------------------------------------------------------------------------
// Câmera (BarcodeDetector) — complementa o campo de texto, nunca o substitui
let cameraStream = null,
  cameraLoop = null;
const cameraForms = {
  balcao: ["balcao-form"],
  retirada: ["retirada-form"],
  entrada: ["entrada-form"],
  receber: ["receber-form"],
  pedido: ["pedido-scan-form", "pedido-retirada-form"],
  devolucao: ["return-lookup-form"],
};
function attachCameraPreview() {
  const v = $("#camera-preview");
  if (v && cameraStream && v.srcObject !== cameraStream) {
    v.srcObject = cameraStream;
    v.play().catch(() => {});
  }
}
function stopCamera() {
  ui.camera = null;
  ui.cameraError = "";
  if (cameraLoop) cancelAnimationFrame(cameraLoop);
  cameraLoop = null;
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}
async function startCamera(target) {
  if (ui.busy) return;
  stopCamera();
  if (!("BarcodeDetector" in window)) {
    ui.camera = target;
    ui.cameraError = "Seu navegador não lê códigos pela câmera (use Chrome ou Edge no celular). Use o campo de texto.";
    return render();
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  } catch {
    ui.camera = target;
    ui.cameraError = "Não foi possível acessar a câmera (permissão negada ou indisponível). Use o campo de texto.";
    return render();
  }
  ui.camera = target;
  render();
  const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"] });
  const tick = async () => {
    if (ui.camera !== target || !cameraStream) return;
    const video = $("#camera-preview");
    if (video && video.readyState >= 2) {
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const value = codes[0].rawValue;
          stopCamera();
          render();
          const form = cameraForms[target].map((id) => document.getElementById(id)).find(Boolean);
          if (form) {
            form.elements.code.value = value;
            handleSubmit(form);
          }
          return;
        }
      } catch {}
    }
    cameraLoop = requestAnimationFrame(tick);
  };
  cameraLoop = requestAnimationFrame(tick);
}
