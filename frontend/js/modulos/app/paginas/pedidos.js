"use strict";
// Pedidos — todos os canais e tipos num lugar só:
// balcão, "compre online e retire na loja", entrega em casa e marketplaces.

const OPEN_STATUS = ["novo", "separando", "pronto", "separado"];
const pedidosTabs = [
  ["abertos", "Para resolver", (o) => OPEN_STATUS.includes(o.status)],
  ["retirada", "Retirar na loja", (o) => o.type === "retirada" && OPEN_STATUS.includes(o.status)],
  ["entrega", "Entregas", (o) => o.type === "entrega" && OPEN_STATUS.includes(o.status)],
  ["concluidos", "Concluídos", (o) => !OPEN_STATUS.includes(o.status)],
];

function orderAction(o) {
  if (o.status === "novo" || o.status === "separando")
    return `<button class="btn small primary" data-order="${o.id}">${o.status === "novo" ? "Separar" : "Continuar"}</button>`;
  if (o.status === "pronto") return `<button class="btn small primary" data-order="${o.id}">Entregar</button>`;
  if (o.status === "separado") return `<button class="btn small primary" data-dispatch="${o.id}" ${ui.busy ? "disabled" : ""}>Despachar</button>`;
  return `<button class="btn small" data-order="${o.id}">Ver</button>`;
}

function ordersTable(list) {
  if (!list.length) return emptyBox("Nenhum pedido aqui. 🎉");
  return `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Canal</th><th>Cliente</th><th>Tipo</th><th>Itens</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${list
    .map(
      (o) =>
        `<tr><td><b>${o.id}</b><small>${esc(ago(o.ts))}</small></td><td>${logo(o.channel, "sm")}</td><td>${esc(o.customer.name)}</td><td>${typeIcon[o.type]} ${W.orderTypes[o.type]}</td><td>${o.items
          .map((i) => esc(i.name) + " × " + i.qty)
          .join("<br>")}</td><td>${money(o.total)}</td><td>${orderBadge(o)}</td><td>${orderAction(o)}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function pedidosPage() {
  const sorted = state.orders.filter(matchesOrderFilters).sort((a, b) => b.ts - a.ts);
  const tab = pedidosTabs.find((t) => t[0] === ui.pedidosTab) || pedidosTabs[0];
  const list = sorted.filter(tab[2]);
  const onlineConnected = state.connected.filter((c) => W.isExternal(c));
  return (
    heading(
      "Pedidos",
      "Todos os pedidos de todos os canais, num lugar só. O estoque fica reservado até a entrega.",
      `<a class="btn" href="loja.html" target="_blank" rel="noopener">🌐 Comprar pelo site</a><button class="btn primary" data-action="simulate-order" ${ui.busy || !onlineConnected.length ? "disabled" : ""}>+ Simular pedido de marketplace</button>`,
    ) +
    orderFilterBar() +
    `<div class="tabs" role="tablist">${pedidosTabs
      .map(([id, label, fn]) => {
        const n = sorted.filter(fn).length;
        return `<button type="button" role="tab" class="tab ${ui.pedidosTab === id ? "active" : ""}" aria-selected="${ui.pedidosTab === id}" data-pedidos-tab="${id}">${label}${id !== "concluidos" && n ? ` <span class="tab-count">${n}</span>` : ""}</button>`;
      })
      .join("")}</div><section class="card table-card">${ordersTable(list)}</section>` +
    aiStrip(
      "Nenhuma venda sem estoque.",
      "Cada pedido reserva as unidades na hora: o mesmo produto não é vendido duas vezes em canais diferentes. Retiradas não buscadas em 48 h voltam para a venda sozinhas.",
      "automacoes",
      "Ver automações →",
    )
  );
}

// Gaveta do pedido: separação (bipagem), retirada (QR) e despacho
function orderDrawer(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return "";
  const ch = W.channelById(o.channel);
  const route = [...o.items]
    .map((it) => ({
      ...it,
      where:
        it.source === "deposito"
          ? "Depósito"
          : W.shopsOf(state).length > 1
            ? W.locName(state, it.source) + (it.source === "loja" ? " · " + (productById(it.productId)?.shelf || "") : "")
            : productById(it.productId)?.shelf || "Loja",
    }))
    .sort((a, b) => (a.source === b.source ? a.where.localeCompare(b.where) : a.source === "deposito" ? 1 : -1));
  const pickupAt = o.type === "retirada" && W.shopsOf(state).length > 1 ? W.locName(state, o.store || "loja") : "";
  const moveNote =
    pickupAt && (o.status === "novo" || o.status === "separando") && o.items.some((it) => it.source !== (o.store || "loja"))
      ? `<div class="validation">🚚 A IA separou parte do pedido fora da ${esc(pickupAt)}: leve esses itens para lá antes de avisar o cliente.</div>`
      : "";
  const done = o.items.every((it) => it.scanned);
  const msgs = state.messages.filter((m) => m.orderId === o.id);
  let action = "";
  if (o.status === "novo" || o.status === "separando") {
    action = `<form id="pedido-scan-form" class="scan-form"><div class="field grow"><label for="pedido-scan-code">Bipar código do item</label><input id="pedido-scan-code" name="code" autocomplete="off" required placeholder="SKU ou código de barras"></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Bipar</button>${cameraButton("pedido", "📷 Câmera")}</form>${cameraBox("pedido")}${
      ui.orderFeedback ? `<div class="validation">⚠ ${esc(ui.orderFeedback)}</div>` : ""
    }<button class="btn primary wide" data-action="confirm-separation" ${ui.busy || !done ? "disabled" : ""}>${
      o.type === "retirada" ? "Confirmar separação e avisar o cliente" : "Confirmar separação"
    }</button>`;
  } else if (o.status === "pronto") {
    action = `<div class="qr-box">${renderQR(o.pickupCode, 150)}<span class="caption">Código de retirada <b>${esc(o.pickupCode)}</b> — é o mesmo QR que o cliente recebeu</span></div><form id="pedido-retirada-form" class="scan-form"><div class="field grow"><label for="pedido-retirada-code">Bipe o QR do cliente para entregar</label><input id="pedido-retirada-code" name="code" autocomplete="off" required placeholder="RET-000000"></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Entregar</button>${cameraButton("pedido", "📷 Ler QR")}</form>${cameraBox("pedido")}${
      ui.orderFeedback ? `<div class="validation">⚠ ${esc(ui.orderFeedback)}</div>` : ""
    }`;
  } else if (o.status === "separado") {
    action = `<button class="btn primary wide" data-dispatch="${o.id}" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Despachando…" : "🚚 Despachar pedido (gera NF e etiqueta)"}</button>`;
  } else if (o.status === "expirado") {
    action = `<div class="validation">⏱️ O cliente não retirou em 48 h. A reserva foi cancelada e o produto voltou a ficar à venda.</div>`;
  } else {
    action = `<div class="validation ok">✓ ${W.orderStatus[o.status]}.</div><div class="actions wrap">${o.invoiceId ? `<button class="btn" data-doc="invoice:${o.invoiceId}">Ver nota fiscal</button>` : ""}${o.labelId ? `<button class="btn" data-doc="label:${o.labelId}">Ver etiqueta</button>` : ""}</div>` + returnSummaryBlock(o);
  }
  return drawerShell(
    "PEDIDO · " + esc(ch.name.toUpperCase()),
    "Fechar pedido",
    `<h1 id="drawer-title">${esc(o.id)}</h1><p class="muted drawer-sub">${logo(o.channel, "xs")} ${esc(ch.name)} · ${typeIcon[o.type]} ${W.orderTypes[o.type]} · ${esc(ago(o.ts))}</p><div class="order-meta">${orderBadge(o)}<span><b>${esc(o.customer.name)}</b>${o.customer.phone ? " · " + esc(o.customer.phone) : ""}${o.customer.address ? "<br>" + esc(o.customer.address) : ""}${pickupAt ? "<br>🏪 Retirada na " + esc(pickupAt) : ""}</span></div>${moveNote}<h3 class="block-title">${
      o.status === "novo" || o.status === "separando" ? "Rota de separação sugerida pela IA" : "Itens"
    }</h3>${route
      .map(
        (it, i) =>
          `<div class="channel-row"><span class="step-n ${it.scanned ? "ok" : ""}">${it.scanned ? "✓" : i + 1}</span><div>${esc(it.emoji || "")} ${esc(it.name)}<div class="muted">${esc(it.sku)} · Qtd. ${it.qty} · <b>${esc(it.where)}</b></div></div>${badge(it.scanned ? "Bipado" : "Pendente", it.scanned ? "" : "neutral")}</div>`,
      )
      .join("")}<div class="order-total"><span>Total</span><b>${money(o.total)}</b></div>${action}${
      msgs.length
        ? `<h3 class="block-title">💬 Mensagens enviadas pela automação</h3>${msgs.map((m) => `<div class="wa-bubble">${esc(m.text)}<small>${esc(ago(m.ts))} · WhatsApp para ${esc(m.to)}</small></div>`).join("")}`
        : ""
    }<p class="caption">Cada bipagem confere o item físico contra o pedido. A baixa do estoque só acontece na entrega ou no despacho.</p>`,
  );
}

// Filtros: canal, loja (de onde sai ou onde retira) e busca por número ou cliente
const orderPlace = (o) => o.store || o.items[0]?.source || "loja";
function matchesOrderFilters(o) {
  if (ui.pedidosChannel && o.channel !== ui.pedidosChannel) return false;
  if (ui.pedidosStore && orderPlace(o) !== ui.pedidosStore) return false;
  const q = (ui.pedidosQuery || "").trim().toLowerCase();
  return !q || o.id.toLowerCase().includes(q) || (o.customer?.name || "").toLowerCase().includes(q) || (o.pickupCode || "").toLowerCase().includes(q);
}
function orderFilterBar() {
  const channels = [...new Set(state.orders.map((o) => o.channel))].map((id) => W.channelById(id)).filter(Boolean);
  const places = [...W.shopsOf(state).map((sh) => ({ id: sh.id, name: sh.name })), ...(state.store.hasDeposito ? [{ id: "deposito", name: "Depósito" }] : [])];
  const active = ui.pedidosChannel || ui.pedidosStore || ui.pedidosQuery;
  return `<div class="filter-bar"><div class="field"><label for="pedidos-channel">Canal</label><select id="pedidos-channel"><option value="">Todos os canais</option>${channels
    .map((c) => `<option value="${c.id}" ${ui.pedidosChannel === c.id ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("")}</select></div><div class="field"><label for="pedidos-store">Loja</label><select id="pedidos-store"><option value="">Todas as lojas</option>${places
    .map((l) => `<option value="${l.id}" ${ui.pedidosStore === l.id ? "selected" : ""}>${esc(l.name)}</option>`)
    .join("")}</select></div><div class="field grow"><label for="pedidos-query">Buscar</label><input id="pedidos-query" type="search" value="${esc(ui.pedidosQuery || "")}" placeholder="Nº do pedido, cliente ou código de retirada" autocomplete="off"></div>${
    active ? '<button type="button" class="link" data-action="clear-order-filters">Limpar filtros</button>' : ""
  }</div>`;
}
