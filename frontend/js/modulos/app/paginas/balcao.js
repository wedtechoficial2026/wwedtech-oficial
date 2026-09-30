"use strict";
// Caixa (PDV): abertura com fundo de troco, venda bipando (leitor, câmera ou toque),
// pagamento por Pix, maquininha, dinheiro ou vale, sangria/suprimento e fechamento às cegas.
// Só para a loja física. Retiradas ficam em retiradas.js.

const cartPrice = (it) => {
  const p = productById(it.productId);
  return p ? W.priceFor(state, p, "loja") : 0;
};
function cartTotal() {
  return ui.cart.reduce((a, it) => a + cartPrice(it) * it.qty, 0);
}

function cartRows() {
  return ui.cart
    .map((it, i) => {
      const p = productById(it.productId);
      if (!p) return "";
      const promo = cartPrice(it) < p.price;
      const variantSelect =
        p.variants && p.variants.length
          ? `<select class="variant-select" data-cart-variant="${i}" aria-label="${esc(p.variantKind || "Tamanho")} de ${esc(p.name)}">${p.variants
              .map((v) => `<option value="${v.id}" ${v.id === it.variantId ? "selected" : ""} ${W.variantFree(state, p, v) === 0 ? "disabled" : ""}>${esc(p.variantKind || "Tam.")} ${esc(v.label)} (${W.variantFree(state, p, v)})</option>`)
              .join("")}</select>`
          : "";
      return `<div class="cart-row">${productThumb(p, "sm")}<div class="cart-name">${esc(p.name)}<small>${money(cartPrice(it))}${promo ? " · 🏷️ promoção" : ""} · ${W.stockOf(state, p).disponivel} disponíveis</small>${variantSelect}</div><div class="qty"><button type="button" data-cart-dec="${i}" aria-label="Diminuir">−</button><b>${it.qty}</b><button type="button" data-cart-inc="${i}" aria-label="Aumentar">+</button></div><b class="cart-sub">${money(cartPrice(it) * it.qty)}</b><button type="button" class="link" data-cart-remove="${i}" aria-label="Remover ${esc(p.name)}">×</button></div>`;
    })
    .join("");
}

// Painel de pagamento: Pix (QR), maquininha (débito/crédito) ou dinheiro (troco)
function paymentPanel() {
  const total = cartTotal();
  const pay = ui.payment;
  if (!pay) return "";
  if (pay.stage === "choose")
    return `<div class="pay-box"><h3>Como o cliente vai pagar?</h3><div class="pay-grid"><button type="button" class="pay-option" data-pay="pix"><span>⚡</span>Pix<small>sem taxa</small></button><button type="button" class="pay-option" data-pay="debito"><span>💳</span>Débito<small>maquininha · 1,99%</small></button><button type="button" class="pay-option" data-pay="credito"><span>💳</span>Crédito<small>maquininha · 3,49%</small></button><button type="button" class="pay-option" data-pay="dinheiro"><span>💵</span>Dinheiro<small>calcula o troco</small></button><button type="button" class="pay-option" data-pay="vale"><span>🎟️</span>Vale-troca<small>de uma devolução</small></button></div><button type="button" class="link" data-action="pay-cancel">Cancelar</button></div>`;
  if (pay.stage === "pix")
    return `<div class="pay-box"><h3>⚡ Pix · ${money(total)}</h3><div class="qr-box">${renderQR("PIX|" + state.store.name + "|" + total.toFixed(2) + "|" + pay.token, 150)}<span class="caption">QR Pix demonstrativo — o cliente escaneia pelo app do banco</span></div><p class="pay-wait"><span class="spin"></span>Aguardando pagamento… a confirmação chega sozinha.</p><button type="button" class="link" data-action="pay-cancel">Cancelar</button></div>`;
  if (pay.stage === "debito" || pay.stage === "credito")
    return `<div class="pay-box"><h3>💳 ${pay.stage === "debito" ? "Débito" : "Crédito"} · ${money(total)}</h3><div class="pos-machine"><span>📟</span><b>${money(total)}</b><small>Aproxime, insira ou passe o cartão</small></div><p class="pay-wait"><span class="spin"></span>Maquininha conectada — aguardando aprovação…</p><button type="button" class="link" data-action="pay-cancel">Cancelar</button></div>`;
  if (pay.stage === "vale")
    return `<div class="pay-box"><h3>🎟️ Vale-troca · ${money(total)}</h3><form id="vale-form" class="scan-form"><div class="field grow"><label for="vale-code">Código do vale</label><input id="vale-code" name="code" required placeholder="VALE-00000" autocomplete="off"></div><button class="btn primary">Usar vale</button></form><p class="caption">O vale é gerado quando o cliente devolve um produto comprado em qualquer canal.</p><button type="button" class="link" data-action="pay-cancel">Cancelar</button></div>`;
  if (pay.stage === "dinheiro")
    return `<div class="pay-box"><h3>💵 Dinheiro · ${money(total)}</h3><form id="cash-form" class="scan-form"><div class="field grow"><label for="cash-received">Valor recebido (R$)</label><input id="cash-received" name="received" type="number" min="${total.toFixed(2)}" step="0.01" value="${Math.ceil(total / 10) * 10}" required></div><button class="btn primary">Confirmar</button></form><p class="caption">O troco é calculado e aparece na nota.</p><button type="button" class="link" data-action="pay-cancel">Cancelar</button></div>`;
  return "";
}

function balcaoPage() {
  const reg = W.openRegisterFor(state, "fisico", ui.counterStore);
  return (
    heading(
      "Caixa (PDV)",
      "Abra o caixa no começo do dia, venda bipando os produtos e feche no fim contando o dinheiro da gaveta.",
      `<a class="btn" href="#retiradas">🏪 Retiradas</a><a class="btn" href="#devolucoes">↩️ Devoluções</a>`,
    ) + (reg ? registerBar(reg) + registerActionPanel(reg) + pdvView() : closedRegisterCard() + lastClosingReport() + registerHistory())
  );
}

// Caixa fechado: abertura com o fundo de troco da gaveta
function closedRegisterCard() {
  const shops = W.shopsOf(state);
  return `<section class="card register-closed"><div class="register-lock">🔒</div><h2>Caixa fechado${shops.length > 1 ? " · " + esc(W.locName(state, ui.counterStore)) : ""}</h2><p class="muted">Para vender no balcão, abra o caixa informando o <b>fundo de troco</b>: o dinheiro que fica na gaveta para dar troco.</p><form id="register-open-form" class="scan-form register-open">${
    shops.length > 1
      ? `<div class="field"><label for="register-store">Loja</label><select id="register-store" name="store">${shops.map((sh) => `<option value="${sh.id}" ${sh.id === ui.counterStore ? "selected" : ""}>${esc(sh.name)}</option>`).join("")}</select></div>`
      : ""
  }<div class="field narrow"><label for="register-float">Fundo de troco (R$)</label><input id="register-float" name="float" type="number" min="0" step="0.01" value="100" required></div><button class="btn primary big" ${ui.busy ? "disabled" : ""}>Abrir caixa</button></form></section>`;
}

function registerBar(reg) {
  const sm = W.registerSummary(state, reg);
  const opened = new Date(reg.openedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `<section class="card register-bar"><div><span class="dot on"></span><b>${reg.id} · ${esc(W.locName(state, reg.store))}</b><small>aberto às ${opened}</small></div><div class="register-stats"><span><small>Vendas</small><b>${sm.count}</b></span><span><small>Total</small><b>${money(sm.total)}</b></span></div><div class="actions"><button class="btn small" data-register-action="suprimento">＋ Suprimento</button><button class="btn small" data-register-action="sangria">− Sangria</button><button class="btn small primary" data-register-action="fechar">Fechar caixa</button></div></section>`;
}

// Sangria, suprimento e fechamento aparecem logo abaixo da barra do caixa
function registerActionPanel(reg) {
  const a = ui.registerAction;
  if (!a) return "";
  if (a === "sangria" || a === "suprimento") {
    const sangria = a === "sangria";
    return `<section class="card register-panel"><div class="section-head"><div><h2>${sangria ? "− Sangria" : "＋ Suprimento"}</h2><p>${sangria ? "Retirada de dinheiro da gaveta (por exemplo, para o cofre ou para pagar um fornecedor)." : "Entrada de dinheiro na gaveta (por exemplo, reforço de troco)."}</p></div><button class="link" data-register-action="${a}">Cancelar</button></div><form id="register-move-form" class="scan-form" data-type="${a}" data-register="${reg.id}"><div class="field narrow"><label for="move-value">Valor (R$)</label><input id="move-value" name="value" type="number" min="0.01" step="0.01" required></div><div class="field grow"><label for="move-reason">Motivo</label><input id="move-reason" name="reason" maxlength="80" placeholder="${sangria ? "Ex.: depósito no banco" : "Ex.: troco extra"}"></div><button class="btn primary">Registrar ${sangria ? "sangria" : "suprimento"}</button></form></section>`;
  }
  const sm = W.registerSummary(state, reg);
  return `<section class="card register-panel"><div class="section-head"><div><h2>Fechar caixa</h2><p><b>Conte o dinheiro da gaveta</b> e informe o total. O sistema só mostra se sobrou ou faltou depois da contagem, como nos caixas de mercado.</p></div><button class="link" data-register-action="fechar">Cancelar</button></div><div class="register-methods">${sm.byMethod
    .filter((x) => x.count)
    .map((x) => `<span><small>${esc(x.label)}</small><b>${money(x.total)}</b><small>${plural(x.count, "venda", "vendas")}</small></span>`)
    .join("") || '<p class="muted">Nenhuma venda neste caixa.</p>'}</div><form id="register-close-form" class="scan-form" data-register="${reg.id}"><div class="field narrow"><label for="close-counted">Dinheiro contado (R$)</label><input id="close-counted" name="counted" type="number" min="0" step="0.01" required></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Fechar caixa</button></form></section>`;
}

function pdvView() {
  const count = ui.cart.reduce((a, it) => a + it.qty, 0);
  return `<div class="pdv-layout"><section class="card pdv-items"><form id="balcao-form" class="scan-form pdv-scan"><div class="field grow"><label for="balcao-code">Código de barras, SKU ou quantidade × código</label><input id="balcao-code" name="code" placeholder="Bipe o produto (ex.: 3*7891234567890 para 3 unidades)" autocomplete="off" required autofocus></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Adicionar</button>${cameraButton("balcao")}</form>${cameraBox("balcao")}${
    ui.counterFeedback ? `<div class="validation ${ui.counterFeedback.ok ? "ok" : ""}">${ui.counterFeedback.ok ? "✓ " : "⚠ "}${esc(ui.counterFeedback.text)}</div>` : ""
  }<div class="pdv-list">${cartRows() || emptyBox("Nenhum item. Bipe um produto para começar a venda.")}</div><div class="pdv-keys"><span><kbd>F4</kbd> Receber</span><span><kbd>F8</kbd> Cancelar venda</span><span><kbd>F9</kbd> Remover último item</span><span><kbd>Esc</kbd> Voltar</span></div></section><section class="card pdv-side"><div class="pdv-total"><small>${plural(count, "item", "itens")}</small><strong>${money(cartTotal())}</strong></div>${
    ui.payment
      ? paymentPanel()
      : `<button class="btn primary wide big" data-action="start-payment" ${ui.busy || !ui.cart.length ? "disabled" : ""}>${ui.busy ? '<span class="spin"></span>Finalizando…' : "Receber pagamento (F4)"}</button>${
          ui.cart.length ? '<button class="btn wide" data-action="cart-clear">Cancelar venda (F8)</button>' : ""
        }<label class="switch-row"><input type="checkbox" id="counter-delivery" ${ui.counterDelivery ? "checked" : ""}><span>🚚 Cliente quer <b>receber em casa</b></span></label>${
          ui.counterDelivery
            ? `<form id="counter-delivery-form" class="form-grid compact"><div class="field full"><label for="cd-name">Nome do cliente</label><input id="cd-name" name="name" required maxlength="80"></div><div class="field"><label for="cd-phone">WhatsApp</label><input id="cd-phone" name="phone" inputmode="tel" maxlength="20" placeholder="(11) 90000-0000"></div><div class="field"><label for="cd-address">Endereço</label><input id="cd-address" name="address" required maxlength="140"></div><div class="field full"><button class="btn primary wide" ${ui.busy || !ui.cart.length ? "disabled" : ""}>Registrar pedido para entrega</button></div></form><p class="caption">O pedido reserva o estoque e vai para a fila de separação, saindo do depósito.</p>`
            : ""
        }`
  }</section></div><details class="card quick-card"><summary>Produtos sem código de barras · toque para adicionar</summary><div class="quick-grid">${state.products
    .map((p) => {
      const st = W.stockOf(state, p);
      const free = st.disponivel;
      const here = st.byLoc.find((l) => l.id === ui.counterStore)?.free ?? free;
      const price = W.priceFor(state, p, "loja");
      return `<button type="button" class="quick-item" data-cart-add="${p.id}" ${free <= 0 ? "disabled" : ""}><span class="quick-emoji">${esc(p.emoji)}</span><span class="quick-name">${esc(p.name)}</span><small>${money(price)}${price < p.price ? " 🏷️" : ""} · ${free > 0 ? (W.shopsOf(state).length > 1 ? here + " nesta loja" : free + " disp.") : "esgotado"}</small></button>`;
    })
    .join("")}</div></details>`;
}

// ---------------------------------------------------------------------------
// Relatório do último fechamento e histórico
function lastClosed(store) {
  return (state.cashRegisters || []).find((r) => r.status === "fechado" && r.kind === "fisico" && r.store === store) || null;
}
function lastClosingReport() {
  const r = lastClosed(ui.counterStore);
  if (!r || ui.lastClosedRegister !== r.id) return "";
  const sm = r.summary;
  const closed = new Date(r.closedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const diff = r.difference;
  const tone = Math.abs(diff) < 0.005 ? "ok" : diff < 0 ? "danger" : "warn";
  const diffText = Math.abs(diff) < 0.005 ? "Caixa bateu certinho" : diff < 0 ? "Faltou " + money(-diff) : "Sobrou " + money(diff);
  return `<section class="card register-report"><div class="section-head"><div><h2>✓ Caixa fechado · ${r.id}</h2><p>${esc(W.locName(state, r.store))} · fechado em ${closed}.</p></div>${badge(diffText, tone)}</div><div class="register-methods">${sm.byMethod
    .filter((x) => x.count)
    .map((x) => `<span><small>${esc(x.label)}</small><b>${money(x.total)}</b></span>`)
    .join("")}<span><small>Fundo de troco</small><b>${money(r.float)}</b></span><span><small>Suprimentos</small><b>${money(sm.supply)}</b></span><span><small>Sangrias</small><b>${money(sm.withdraw)}</b></span>${
    sm.refunds ? `<span><small>Estornos em dinheiro</small><b>${money(sm.refunds)}</b></span>` : ""
  }<span><small>Esperado na gaveta</small><b>${money(sm.expectedCash)}</b></span><span><small>Contado</small><b>${money(r.counted)}</b></span></div></section>`;
}
function registerHistory() {
  const list = (state.cashRegisters || []).filter((r) => r.status === "fechado" && r.kind === "fisico").slice(0, 8);
  if (!list.length) return "";
  const when = (ts) => new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const multi = W.shopsOf(state).length > 1;
  return `<section class="card table-card"><div class="section-head pad"><div><h2>Fechamentos anteriores</h2></div></div><div class="table-wrap"><table><thead><tr><th>Caixa</th>${multi ? "<th>Loja</th>" : ""}<th>Aberto</th><th>Fechado</th><th>Vendas</th><th>Total</th><th>Diferença</th></tr></thead><tbody>${list
    .map((r) => {
      const even = Math.abs(r.difference) < 0.005;
      return `<tr><td><b>${r.id}</b></td>${multi ? `<td>${esc(W.locName(state, r.store))}</td>` : ""}<td>${when(r.openedAt)}</td><td>${when(r.closedAt)}</td><td>${r.summary.count}</td><td>${money(r.summary.total)}</td><td>${badge(even ? "ok" : (r.difference > 0 ? "+" : "−") + money(Math.abs(r.difference)), even ? "" : r.difference < 0 ? "danger" : "warn")}</td></tr>`;
    })
    .join("")}</tbody></table></div></section>`;
}

// Com mais de uma loja, o balcão escolhe de qual prateleira sai a venda
function storePicker() {
  const shops = W.shopsOf(state);
  if (shops.length < 2) return "";
  return `<div class="field store-picker"><label for="counter-store">🏪 Vendendo na</label><select id="counter-store">${shops
    .map((sh) => `<option value="${sh.id}" ${sh.id === ui.counterStore ? "selected" : ""}>${esc(sh.name)}</option>`)
    .join("")}</select></div>`;
}
