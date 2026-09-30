"use strict";
// Retiradas — cliente comprou pelo site, WhatsApp ou marketplace e veio buscar na loja.

function retiradasPage() {
  const ready = state.orders.filter((o) => o.status === "pronto");
  const preparing = state.orders.filter((o) => o.type === "retirada" && (o.status === "novo" || o.status === "separando"));
  return (
    heading(
      "Retiradas",
      "O cliente comprou online e veio buscar na loja. Bipe o QR code que ele recebeu no WhatsApp para entregar.",
      `<a class="btn" href="#pedidos">Ver todos os pedidos</a>`,
    ) +
    `<section class="card pickup-card"><div class="section-head"><div><h2>🏪 Cliente veio retirar um pedido?</h2><p>Bipe o QR code que o cliente recebeu no WhatsApp (ou digite o código de retirada).</p></div>${badge(plural(ready.length, "pedido pronto", "pedidos prontos"), ready.length ? "" : "neutral")}</div><form id="retirada-form" class="scan-form"><div class="field grow"><label for="retirada-code">Código de retirada</label><input id="retirada-code" name="code" placeholder="Ex.: RET-123456" autocomplete="off" required></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Entregar pedido</button>${cameraButton("retirada", "📷 Ler QR")}</form>${cameraBox("retirada")}${
      ui.pickupFeedback ? `<div class="validation ${ui.pickupFeedback.ok ? "ok" : ""}">${ui.pickupFeedback.ok ? "✓ " : "⚠ "}${esc(ui.pickupFeedback.text)}</div>` : ""
    }${
      ready.length
        ? `<div class="pickup-list">${ready
            .map((o) => `<button type="button" class="pickup-chip" data-order="${o.id}">${logo(o.channel, "xs")}<span><b>${esc(o.customer.name)}</b><small>${o.id} · ${esc(o.pickupCode)}</small></span></button>`)
            .join("")}</div>`
        : ""
    }</section>` +
    `<section class="card table-card"><div class="section-head pad"><div><h2>Ainda em separação</h2><p>Estes pedidos ainda não estão prontos. Separe em Pedidos: o cliente é avisado quando ficar pronto.</p></div></div>${ordersTable(preparing)}</section>`
  );
}
