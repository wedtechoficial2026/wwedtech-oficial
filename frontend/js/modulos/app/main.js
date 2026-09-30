"use strict";
// Eventos da interface, rotas (#hash) e sincronização ao vivo com o site do lojista.

// Formulários: um único ponto de entrada (também usado pela câmera)
function handleSubmit(form) {
  const handlers = {
    "login-form": handleLogin,
    "balcao-form": handleCounterScan,
    "adjust-form": handleAdjust,
    "support-open-form": submitSupportTicket,
    "support-reply-form": submitSupportReply,
    "register-open-form": handleOpenRegister,
    "register-move-form": handleRegisterMove,
    "register-close-form": handleCloseRegister,
    "counter-delivery-form": counterDeliveryOrder,
    "retirada-form": pickupByCode,
    "pedido-scan-form": orderScan,
    "pedido-retirada-form": orderPickup,
    "entrada-form": handleEntrada,
    "receber-form": receiveScan,
    "product-settings-form": saveProductSettings,
    "supplier-form": handleSaveSupplier,
    "expense-form": handleAddExpense,
    "ads-form": prepareAds,
    "store-form": saveStore,
    "event-form": addEvent,
    "cash-form": payCash,
    "vale-form": payCredit,
    "return-lookup-form": returnLookup,
    "return-request-form": submitReturnRequest,
    "return-resolve-form": resolveReturnRequest,
    "return-contest-form": contestReturnRequest,
    "shop-form": handleAddShop,
    "transfer-form": handleTransfer,
    "pricing-form": savePricing,
    "fees-form": saveFees,
    "promo-form": savePromo,
    "chat-form": (f) => ask(f.elements.question.value),
    "dashboard-ai-form": (f) => askDashboard(f.elements.question.value),
  };
  const fn = handlers[form.id];
  if (fn) fn(form);
}
document.addEventListener("submit", (e) => {
  if (!e.target.id) return;
  e.preventDefault();
  handleSubmit(e.target);
});

document.addEventListener("input", (e) => {
  if (e.target.id === "pedidos-query") {
    ui.pedidosQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = $("#pedidos-query");
    el?.focus();
    if (el && pos !== null) el.setSelectionRange(pos, pos);
  }
  if (e.target.id === "search") {
    ui.query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = $("#search");
    el?.focus();
    if (el && pos !== null) el.setSelectionRange(pos, pos);
  }
  if (e.target.closest?.("#ads-form") && e.target.name && e.target.name !== "channel" && ui.one) ui.one.draft[e.target.name] = e.target.value;
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.min) return setMinStock(t.dataset.min, t.value);
  if (t.dataset.publish) return togglePublish(t.dataset.publish, t.checked);
  if (t.dataset.automation) return toggleAutomation(t.dataset.automation, t.checked);
  if (t.id === "has-deposito") return toggleDeposito(t.checked);
  if (t.id === "pedidos-channel" || t.id === "pedidos-store") {
    ui[t.id === "pedidos-channel" ? "pedidosChannel" : "pedidosStore"] = t.value;
    return render();
  }
  if (t.id === "adj-product" && ui.drawer?.type === "ajuste") {
    ui.drawer.id = t.value;
    render();
    return $("#adj-counted")?.focus();
  }
  if (t.id === "counter-store") {
    ui.counterStore = t.value;
    return render();
  }
  if (t.dataset.cartVariant !== undefined) return changeCartVariant(Number(t.dataset.cartVariant), t.value);
  if (t.id === "counter-delivery") {
    ui.counterDelivery = t.checked;
    return render();
  }
  if (t.name === "channel" && ui.one) ui.one.selected = Array.from(document.querySelectorAll('[name="channel"]:checked')).map((el) => el.value);
  if (t.id === "ad-image") {
    const file = t.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) {
      toast("Selecione uma imagem PNG, JPG ou WebP de até 1 MB.");
      t.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      ui.one.draft.image = reader.result;
      render();
    };
    reader.readAsDataURL(file);
  }
});

// Atalhos do caixa (PDV), como nos caixas de mercado. Só valem com o caixa aberto e sem gaveta lateral.
function pdvShortcut(e) {
  if (ui.page !== "balcao" || ui.drawer || ui.busy) return false;
  if (!W.openRegisterFor(state, "fisico", ui.counterStore)) return false;
  const keys = {
    F4: () => startPayment(),
    F8: () => {
      if (!ui.cart.length) return;
      ui.cart = [];
      ui.payment = null;
      ui.counterFeedback = { ok: true, text: "Venda cancelada." };
      render();
    },
    F9: () => {
      if (!ui.cart.length || ui.payment) return;
      const last = ui.cart[ui.cart.length - 1];
      if (--last.qty <= 0) ui.cart.pop();
      render();
    },
    Escape: () => {
      if (!ui.payment) return false;
      ui.payment = null;
      render();
    },
  };
  const fn = keys[e.key];
  if (!fn || fn() === false) return false;
  e.preventDefault();
  setTimeout(() => $("#balcao-code")?.focus(), 0);
  return true;
}

document.addEventListener("keydown", (e) => {
  if (pdvShortcut(e)) return;
  if (e.key === "Escape") {
    if (ui.camera) {
      stopCamera();
      return render();
    }
    if (ui.drawer && !ui.busy) {
      closeDrawer();
      return render();
    }
    if (ui.notifOpen || ui.profileOpen) {
      const wasProfile = ui.profileOpen;
      ui.notifOpen = false;
      ui.profileOpen = false;
      render();
      return wasProfile && $(".avatar-btn")?.focus();
    }
    if (ui.menu) {
      ui.menu = false;
      render();
      return $(".mobile-menu")?.focus();
    }
  }
  // Mantém o foco do teclado dentro da gaveta aberta
  if (e.key === "Tab" && ui.drawer) {
    const els = Array.from(document.querySelectorAll(".drawer button:not(:disabled),.drawer a,.drawer input:not(:disabled),.drawer select"));
    if (!els.length) return;
    const first = els[0],
      last = els.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

document.addEventListener("click", (e) => {
  // Clique no fundo escuro fecha a gaveta
  if (e.target.classList?.contains("modal-overlay") && ui.drawer && !ui.busy) {
    closeDrawer();
    return render();
  }
  // Clique fora do menu do perfil ou do sino fecha o que estiver aberto
  if ((ui.profileOpen || ui.notifOpen) && !e.target.closest(".profile-wrap, .notif-wrap")) {
    ui.profileOpen = false;
    ui.notifOpen = false;
    render();
  }
  const el = e.target.closest("button");
  if (!el) return;
  const d = el.dataset;
  if (d.setup) return chooseStoreType(d.setup);
  if (d.product) {
    if (ui.busy) return;
    openDrawer("produto", d.product);
    return render();
  }
  if (d.order) {
    if (ui.busy) return;
    openDrawer("pedido", d.order);
    return render();
  }
  if (d.doc) {
    openDrawer("doc", d.doc);
    return render();
  }
  if (d.receiveScan) {
    openDrawer("receber", d.receiveScan);
    return render();
  }
  if (d.cameraStart) return startCamera(d.cameraStart);
  if (d.dispatch) return dispatchOrder(d.dispatch);
  if (d.cartAdd) return addToCart(d.cartAdd);
  if (d.cartInc) return changeCartQty(d.cartInc, 1);
  if (d.cartDec) return changeCartQty(d.cartDec, -1);
  if (d.cartRemove) {
    ui.cart.splice(Number(d.cartRemove), 1);
    return render();
  }
  if (d.pay) return choosePayment(d.pay);
  if (d.restock) return restockShop(d.restock);
  if (d.applyMarkup) return applyMarkup(d.applyMarkup);
  if (d.promo) return promoFromLot(d.promo);
  if (d.clearPromo) return removePromo(d.clearPromo);
  if (d.refill) return refillShelf(d.refill);
  if (d.connect) return connectChannel(d.connect);
  if (d.simulate) return simulateMarketplaceOrder(d.simulate);
  if (d.reactivate) return reactivateAds(d.reactivate);
  if (d.confirmPo) return confirmPO(d.confirmPo);
  if (d.discardPo) return discardPO(d.discardPo);
  if (d.receiveAll) return receiveAll(d.receiveAll);
  if (d.pedidosTab) {
    ui.pedidosTab = d.pedidosTab;
    return render();
  }
  // Atalho para uma área já filtrada, ex.: "estoque:zerados" ou "canal/ml"
  if (d.nav) {
    const [page, filter] = d.nav.split(":");
    if (page === "estoque" && filter) ui.estoqueFilter = filter;
    ui.profileOpen = false;
    closeDrawer();
    if (location.hash === "#" + page) return render();
    return go(page);
  }
  if (d.orderSupplier) return orderFromSupplier(d.orderSupplier);
  if (d.supportTicket) {
    ui.supportTicket = ui.supportTicket === Number(d.supportTicket) ? null : Number(d.supportTicket);
    markSupportRead(ui.supportTicket);
    return render();
  }
  if (d.supplier) {
    openDrawer("fornecedor", d.supplier);
    render();
    return $("#sup-name")?.focus();
  }
  // Clique num aviso: marca como lido e vai para a área do assunto
  if (d.notif) {
    const n = W.markNotificationRead(state, d.notif);
    save();
    ui.notifOpen = false;
    const target = n?.route || "notificacoes";
    if (location.hash === "#" + target) return render();
    return go(target);
  }
  if (d.notifFilter) {
    ui.notifFilter = d.notifFilter;
    return render();
  }
  if ("notifType" in d) {
    ui.notifType = d.notifType;
    return render();
  }
  if ("adjust" in d) {
    openDrawer("ajuste", d.adjust || state.products[0]?.id);
    render();
    return $("#adj-counted")?.focus();
  }
  if (d.estoqueFilter) {
    ui.estoqueFilter = d.estoqueFilter;
    return render();
  }
  if (d.returnsTab) {
    ui.returnsTab = d.returnsTab;
    return render();
  }
  if (d.return) {
    openDrawer("devolucao", d.return);
    return render();
  }
  if (d.newReturn) {
    openDrawer("nova-devolucao", d.newReturn);
    return render();
  }
  if (d.returnApprove) return reviewReturnRequest(d.returnApprove, true);
  if (d.returnReject) return reviewReturnRequest(d.returnReject, false);
  if (d.returnReceive) return receiveReturnRequest(d.returnReceive);
  if (d.dispute) return settleReturnDispute(d.dispute);
  if (d.registerAction) {
    ui.registerAction = ui.registerAction === d.registerAction ? null : d.registerAction;
    render();
    return $("#move-value, #close-counted")?.focus();
  }
  if (d.changeType) return changeStoreType(d.changeType);
  if (d.event) {
    ui.eventId = d.event;
    return render();
  }
  if (d.removeEvent) return removeEvent(d.removeEvent);
  if (d.ask !== undefined) return ask(suggestions[Number(d.ask)]);
  if (d.dashboardAsk !== undefined) return askDashboard(quickQuestions[Number(d.dashboardAsk)]);

  const actions = {
    "login-example": () => {
      $("#login-email").value = "maria@sualoja.com.br";
      $("#login-password").value = "wedtech123";
    },
    logout: () => !ui.busy && logout(),
    menu: () => {
      ui.menu = !ui.menu;
      render();
      (ui.menu ? $(".sidebar-toggle") : $(".mobile-menu"))?.focus();
    },
    sidebar: () => {
      if (ui.menu) ui.menu = false;
      else ui.sidebarOpen = !ui.sidebarOpen;
      render();
      $(".sidebar-toggle")?.focus();
    },
    "close-drawer": () => {
      if (ui.busy) return;
      closeDrawer();
      render();
    },
    // Abrir o sino não marca tudo como lido: cada aviso fica "novo" até ser clicado
    "toggle-notifications": () => {
      ui.notifOpen = !ui.notifOpen;
      ui.profileOpen = false;
      render();
    },
    "toggle-profile": () => {
      ui.profileOpen = !ui.profileOpen;
      ui.notifOpen = false;
      render();
      if (ui.profileOpen) $(".profile-panel [role=menuitem]")?.focus();
    },
    "support-new": () => {
      ui.supportFormOpen = !ui.supportFormOpen;
      render();
      $("#sup-subject")?.focus();
    },
    "end-support": endSupportMode,
    "clear-order-filters": () => {
      ui.pedidosChannel = "";
      ui.pedidosStore = "";
      ui.pedidosQuery = "";
      render();
    },
    "toggle-sound": () => {
      const on = !WedTechAlerts.soundOn();
      WedTechAlerts.setSound(on);
      if (on) WedTechAlerts.chime();
      toast(on ? "Som dos avisos ligado." : "Som dos avisos desligado. As janelas continuam aparecendo.");
      render();
    },
    "notif-read-all": () => {
      W.markNotificationsRead(state);
      save();
      render();
    },
    "close-notifications": () => {
      ui.notifOpen = false;
      render();
    },
    "tour-next": () => {
      ui.tourStep++;
      if (ui.tourStep >= tourSlides.length) finishTour();
      render();
    },
    "tour-skip": () => {
      finishTour();
      render();
    },
    "hide-checklist": () => {
      state.onboarding.hidden = true;
      save();
      render();
    },
    "new-product": () => {
      resetOne();
      go("ads");
    },
    "start-payment": startPayment,
    "go-returns": () => go("devolucoes"),
    "pay-cancel": () => {
      ui.payment = null;
      render();
    },
    "cart-clear": () => {
      ui.cart = [];
      ui.counterFeedback = null;
      render();
    },
    "confirm-separation": confirmSeparation,
    "simulate-order": () => simulateMarketplaceOrder(),
    "simulate-return": () => simulateMarketplaceReturn(),
    "fix-product": fixProductIssue,
    "toggle-expense-form": () => {
      ui.expenseFormOpen = !ui.expenseFormOpen;
      render();
    },
    "advance-time": advanceTime,
    "prepare-event": prepareEvent,
    consultant: talkToConsultant,
    "toggle-live": () => {
      if (ui.live) stopLive();
      else {
        ui.live = true;
        scheduleLive();
        toast("Operação ao vivo: novos pedidos vão chegar a cada 9 segundos.");
      }
      render();
    },
    "stop-camera": () => {
      stopCamera();
      render();
    },
    "ads-example": fillAdsExample,
    "ads-ai-description": () => {
      const form = $("#ads-form");
      if (form) readAdsForm(form);
      ui.one.draft.description = aiDescription(ui.one.draft);
      render();
      toast("Descrição escrita pela WedTech AI. Revise se quiser.");
    },
    "ads-fix": fixAds,
    "ads-publish": publishAds,
    "ads-edit": () => {
      ui.one.stage = 0;
      render();
    },
    "ads-another": () => {
      resetOne();
      render();
    },
    "copy-catalog": copyCatalogLink,
    "export-estoque-csv": () => {
      const fc = W.forecast(state);
      downloadCSV(
        "wedtech-estoque.csv",
        ["Produto", "SKU", "Loja", "Depósito", "Reservado", "Disponível", "Mínimo", "Dias até acabar", "Situação"],
        state.products.map((p) => {
          const st = W.stockOf(state, p);
          const f = fc.find((x) => x.productId === p.id);
          return [p.name, p.sku, st.loja, st.deposito, st.reservado, st.disponivel, p.minStock, f.daysToStockout ?? "", W.riskLabel[f.risk]];
        }),
      );
    },
    "export-despesas-csv": () =>
      downloadCSV("wedtech-despesas.csv", ["Categoria", "Descrição", "Data", "Valor"], state.expenses.map((x) => [x.category, x.description, x.date, x.amount])),
    reset: () => !ui.busy && $("#reset-dialog")?.showModal(),
    "cancel-reset": () => $("#reset-dialog")?.close(),
    "confirm-reset": resetDemo,
  };
  const fn = actions[d.action];
  if (fn) fn();
});

// Rotas: #inicio, #pedidos, #canal/ml ...
function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith("canal/")) {
    ui.page = "canal";
    ui.channelPage = hash.slice(6);
  } else {
    ui.page = routes[hash] ? hash : "inicio";
    ui.channelPage = null;
  }
  if (ui.page === "automacoes" && !state.onboarding.automationsVisited) {
    state.onboarding.automationsVisited = true;
    save();
  }
  ui.menu = false;
  ui.drawer = null;
  ui.notifOpen = false;
  ui.profileOpen = false;
  ui.payment = null;
  stopCamera();
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// Sincronização ao vivo: uma compra feita no site (outra aba) aparece aqui na hora
// ---------------------------------------------------------------------------
// Tempo real: compras nas vitrines, devoluções, vendas em outra tela e mudanças do consultor
// chegam sozinhas. Outra aba do mesmo navegador avisa pelo evento "storage"; o resto vem da
// consulta ao servidor a cada 3 segundos (só baixa os dados quando a versão mudou).
const isTyping = () => {
  const el = document.activeElement;
  return !!el?.closest?.("#app") && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
};
// Não refaz a tela no meio de uma digitação: espera o campo perder o foco
function refreshView() {
  if (ui.busy || isTyping()) {
    ui.renderDeferred = true;
    return;
  }
  ui.renderDeferred = false;
  render();
}
document.addEventListener("focusout", () =>
  setTimeout(() => {
    if (ui.renderDeferred && !isTyping()) refreshView();
  }, 0),
);
// Avisos novos (não lidos) viram janela flutuante com som; clicar leva ao assunto
function announceNews(list) {
  if (!list.length || !window.WedTechAlerts) return;
  list
    .slice(0, 3)
    .reverse()
    .forEach((n) =>
      WedTechAlerts.show({
        icon: notifIcon(n.type),
        title: notifTypes[n.type]?.[1] || "Novidade na loja",
        text: n.text,
        onClick: () => {
          W.markNotificationRead(state, n.id);
          save();
          go(n.route || "notificacoes");
        },
      }),
    );
  WedTechAlerts.chime();
}
// O consultor mudou o contrato (plano, recursos, limites): o painel já aplicou; avisa o que mudou
const moduleNames = { automacoes: "Automações com IA", iot: "Dispositivos (IoT)", etiquetas: "Etiquetas eletrônicas" };
const limitNames = { maxChannels: "canais de venda", maxMarketplaces: "marketplaces e apps", maxShops: "lojas físicas" };
function contractNews(before, after) {
  const out = [];
  if (before.plan !== after.plan) out.push("Plano " + (W.plans[after.plan]?.name || after.plan));
  for (const [k, label] of Object.entries(moduleNames)) {
    const was = before.modules?.[k] !== false;
    const is = after.modules?.[k] !== false;
    if (was !== is) out.push((is ? "Liberado: " : "Bloqueado: ") + label);
  }
  for (const [k, label] of Object.entries(limitNames)) {
    const was = before.planLimits?.[k];
    const is = after.planLimits?.[k];
    if (was != null && is != null && was !== is) out.push(`${is > was ? "Agora" : "Limite"}: ${is} ${label}`);
  }
  return out;
}
function applyFreshState(fresh) {
  const known = new Set(state.notifications.map((n) => n.id));
  const changes = contractNews(state, fresh);
  state = fresh;
  announceNews(state.notifications.filter((n) => !known.has(n.id) && !n.read));
  if (changes.length && window.WedTechAlerts) {
    WedTechAlerts.show({ icon: "📋", title: "Seu plano foi atualizado pelo consultor", text: changes.join(" · "), onClick: () => go("config") });
    WedTechAlerts.chime();
  }
  refreshView();
}
window.addEventListener("storage", (e) => {
  if (e.key !== W.STORAGE_KEY || !e.newValue) return;
  const fresh = W.loadState(localStorage);
  if (fresh) applyFreshState(fresh);
});
let polling = false;
async function pollServer() {
  if (polling || document.hidden || !state.setupDone || !window.WedTechServerState?.pull) return;
  polling = true;
  try {
    const data = await WedTechServerState.pull("modular", W.STORAGE_KEY);
    const fresh = data && W.loadState({ getItem: () => JSON.stringify(data) });
    if (fresh) applyFreshState(fresh);
  } catch {
    // Sem conexão agora: tenta de novo na próxima rodada
  }
  polling = false;
}
setInterval(pollServer, 3000);
// Respostas do consultor nos chamados (fora do estado da loja, por isso uma consulta à parte)
setInterval(pollSupport, 3000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  pollServer();
  pollSupport();
});
pollSupport();

route();

// Interface opcional para agentes de navegador (WebMCP). Navegadores comuns ignoram.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: "get_wedtech_operation_summary",
          title: "Consultar operação WedTech",
          description: "Lê os indicadores atuais, o estoque por produto e o resumo da WedTech AI. Não altera os dados.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute() {
            return {
              metrics: W.metrics(state),
              products: state.products.map((p) => ({ name: p.name, sku: p.sku, ...W.stockOf(state, p) })),
              summary: W.answer(state, "Resuma meu dia."),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {}
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}
