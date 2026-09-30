"use strict";
// Dispositivos (IoT) — leitor de código de barras, sensores de prateleira e etiquetas eletrônicas.
// Cada leitura atualiza o estoque de todos os canais na hora.

function iotPage() {
  const dep = state.store.hasDeposito;
  const shelfAlerts = state.products.filter((p) => p.shelfAlert).length;
  const outdated = state.products.filter((p) => p.esl?.outdated).length;
  return (
    heading(
      "Dispositivos (IoT)",
      "Leitor, sensores de prateleira e etiquetas eletrônicas ligados ao estoque. No dia a dia você não precisa abrir esta tela: os avisos importantes chegam nas notificações.",
    ) +
    `<div class="kpis three"><div class="card kpi"><div class="kpi-label">📡 Leitor de código</div><strong>Conectado</strong><small>${plural(state.scanLog.length, "leitura registrada", "leituras registradas")}</small></div><div class="card kpi ${shelfAlerts ? "warn-line" : ""}"><div class="kpi-label">⚖️ Sensores de prateleira</div><strong>${shelfAlerts ? plural(shelfAlerts, "alerta", "alertas") : "Tudo certo"}</strong><small>${plural(state.products.length, "prateleira monitorada", "prateleiras monitoradas")}</small></div><div class="card kpi ${outdated ? "warn-line" : ""}"><div class="kpi-label">📟 Etiquetas eletrônicas</div><strong>${outdated ? plural(outdated, "desatualizada", "desatualizadas") : "Sincronizadas"}</strong><small>${plural(state.products.length, "etiqueta", "etiquetas")}</small></div></div>` +
    `<div class="chart-grid"><section class="card"><div class="section-head"><div><h2>📡 Leitor de código de barras</h2><p>Cada bipagem no caixa, na separação e no recebimento aparece aqui.</p></div>${badge("🟢 Conectado")}</div><h3 class="block-title">Últimas leituras</h3>${
      state.scanLog.length
        ? state.scanLog
            .slice(0, 5)
            .map(
              (l) =>
                `<div class="channel-row"><span>${{ entrada: "↘", saida: "↗", separacao: "📦", retirada: "🏪", transferencia: "⇄" }[l.type] || "•"}</span><div>${esc(l.product)}<div class="muted">${esc(l.sku)} · ${esc(l.location)} · ${esc(ago(l.ts))}</div></div>${badge({ entrada: "Entrada", saida: "Venda", separacao: "Separação", retirada: "Retirada", transferencia: "Reposição" }[l.type] || l.type, l.type === "entrada" ? "" : "neutral")}</div>`,
            )
            .join("")
        : emptyBox("Nenhuma leitura ainda. Bipe um código para começar.")
    }</section><section class="card"><div class="section-head"><div><h2>Prateleira inteligente</h2><p>Sensores de peso na prateleira avisam quando o produto está acabando na loja${dep ? " e ainda tem no depósito" : ""}.</p></div>${badge("IoT · ao vivo", "neutral")}</div><div class="shelf-grid">${state.products
      .map((p) => {
        const st = W.stockOf(state, p);
        const pct = Math.min(100, Math.round((st.livreLoja / (p.shelfCap || 12)) * 100));
        const refill = W.shelfRefill(state, p);
        return `<div class="shelf ${p.shelfAlert ? "low" : ""}"><div class="shelf-top"><span>${esc(p.emoji)}</span><div><b>${esc(p.name)}</b><small>${esc(p.shelf)} · ${st.livreLoja} un.</small></div></div><div class="shelf-bar"><span style="width:${pct}%"></span></div>${
          p.shelfAlert
            ? `<button class="btn small primary" data-refill="${p.id}" ${ui.busy || !refill ? "disabled" : ""}>Repor ${refill} do depósito</button>`
            : `<small class="sensor-ok">📡 Sensor OK</small>`
        }</div>`;
      })
      .join("")}</div></section></div>` +
    eslSection()
  );
}
// Etiquetas eletrônicas (e-ink) nas prateleiras — o preço acompanha o sistema
function eslSection() {
  const on = state.automations.etiquetaEletronica;
  return `<section class="card"><div class="section-head"><div><h2>📟 Etiquetas eletrônicas (IoT)</h2><p>As etiquetas digitais das prateleiras mostram o mesmo preço do sistema. Criou uma promoção? Elas mudam sozinhas${W.shopsOf(state).length > 1 ? " em todas as lojas" : ""}.</p></div>${badge(on ? "Sincronização automática" : "Automação desligada", on ? "" : "warn")}</div><div class="esl-grid">${state.products
    .map((p) => {
      const e = p.esl || { price: p.price };
      const promo = e.promoPct ? `<s>${money(p.price)}</s><em>-${e.promoPct}%</em>` : "";
      return `<div class="esl ${e.outdated ? "outdated" : ""}"><div class="esl-screen"><small>${esc(p.name)}</small><div class="esl-price">${promo}<b>${money(e.price)}</b></div><div class="esl-foot"><span>${esc(p.sku)}</span><span>${esc(p.shelf)}</span></div></div><small class="esl-status">${e.outdated ? "⚠ desatualizada" : "📡 sincronizada " + esc(ago(e.ts || W.now(state))).toLowerCase()}</small></div>`;
    })
    .join("")}</div></section>`;
}
