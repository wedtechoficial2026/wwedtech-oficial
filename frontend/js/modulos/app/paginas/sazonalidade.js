"use strict";
// Datas especiais e sazonalidade — a IA prevê os picos do ano (Dia das Crianças,
// Black Friday, Natal…) e prepara os pedidos ao fornecedor a tempo, considerando
// o prazo de entrega de cada um.

const fmtDate = (ts) => new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const pct = (mult) => "+" + Math.round((mult - 1) * 100) + "%";

function eventStatusBadge(r) {
  if (r.status === "coberto") return badge("✓ Coberto");
  if (r.status === "no_prazo") return badge("Peça até " + fmtDate(r.orderBy), "neutral");
  if (r.status === "hoje") return badge("Peça hoje", "warn");
  if (r.status === "atrasado") return badge("Atrasado · chega " + fmtDate(r.arrives), "danger");
  return badge("Sem fornecedor", "danger");
}

function sazonalidadePage() {
  const events = W.upcomingEvents(state, 6);
  if (!ui.eventId || !events.some((e) => e.id === ui.eventId)) ui.eventId = events[0]?.id || null;
  const plan = ui.eventId ? W.eventPlan(state, ui.eventId) : null;
  const months = W.monthlySeasonality(state);
  const maxIdx = Math.max(...months.map((m) => m.index));
  const thisMonth = new Date(W.now(state)).getMonth();
  const top = [...months].sort((a, b) => b.index - a.index).slice(0, 3).map((m) => m.month);
  const e = plan?.event;
  return (
    heading(
      "Datas especiais e sazonalidade",
      "A IA prevê os picos de venda do ano e prepara seu estoque a tempo, respeitando o prazo de cada fornecedor.",
      "",
    ) +
    `<div class="event-strip">${events
      .map(
        (ev) =>
          `<button type="button" class="event-card ${ev.id === ui.eventId ? "active" : ""} ${ev.active ? "live" : ""}" data-event="${ev.id}"><span class="event-emoji">${ev.emoji}</span><b>${esc(ev.name)}</b><small>${fmtDate(ev.ts)} · ${ev.active ? "pico agora!" : "em " + plural(ev.daysUntil, "dia", "dias")}</small><span class="event-impact">${pct(ev.mult)} vendas</span>${
            ev.prepared ? '<span class="event-ok">✓ preparado</span>' : ""
          }</button>`,
      )
      .join("")}</div>` +
    (plan
      ? `<section class="card table-card"><div class="section-head pad"><div><h2>${e.emoji} Plano para ${esc(e.name)} · ${fmtDate(e.ts)}</h2><p>Pico de vendas de ${fmtDate(e.windowStart)} a ${fmtDate(e.ts)} (${plural(e.windowDays, "dia", "dias")}). ${esc(e.tip || "")}</p></div><button class="btn primary" data-action="prepare-event" ${
          ui.busy || e.prepared || !plan.toBuyCount ? "disabled" : ""
        }>${e.prepared ? "✓ Pedidos já preparados" : plan.toBuyCount ? "✧ IA: preparar pedidos para " + esc(e.name) : "✓ Estoque já coberto"}</button></div><div class="event-summary"><div><small>Vendas a mais esperadas</small><strong>${money(plan.extraRevenue)}</strong></div><div><small>Aumento previsto</small><strong>${pct(e.mult)}</strong></div><div><small>Produtos para reforçar</small><strong>${plan.toBuyCount}</strong></div><div><small>Faltam</small><strong>${plural(e.daysUntil, "dia", "dias")}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Produto</th><th>Vendas no pico</th><th>Disponível</th><th>Comprar</th><th>Fornecedor</th><th>Prazo</th></tr></thead><tbody>${plan.rows
          .map(
            (r) =>
              `<tr><td><div class="product-name">${productThumb(productById(r.productId) || {}, "sm")}<b>${esc(r.name)}</b></div></td><td><span class="muted">${r.normal} →</span> <b>${r.expected} un.</b><small>normal → previsto</small></td><td>${r.disponivel}${r.incoming ? `<small>+ ${r.incoming} a caminho</small>` : ""}</td><td><b class="${r.toBuy ? "warn-text" : ""}">${r.toBuy || "—"}</b></td><td class="muted">${esc(r.supplier || "—")}${r.leadTimeDays ? `<small>entrega em ${plural(r.leadTimeDays, "dia", "dias")}</small>` : ""}</td><td>${eventStatusBadge(r)}</td></tr>`,
          )
          .join("")}</tbody></table></div><p class="caption pad-bottom">Cálculo: vendas por dia × aumento do evento × dias de pico, mais o que vende até lá e o seu estoque mínimo, menos o disponível e o que já está a caminho. “Atrasado” = o fornecedor não entrega antes do pico começar: peça hoje e, se precisar, a IA trava os marketplaces para guardar o produto para a loja e o site.</p></section>`
      : "") +
    `<div class="chart-grid"><section class="card"><div class="section-head"><div><h2>Sazonalidade do ano · ${esc(W.storeTypes[state.tipo]?.label || "")}</h2><p>Como as vendas de lojas como a sua variam mês a mês (1,0 = mês médio). Melhores meses: ${top.join(", ")}.</p></div></div><div class="season-chart" role="img" aria-label="Índice de vendas por mês">${months
      .map(
        (m, i) =>
          `<div class="season-col ${i === thisMonth ? "now" : ""}"><span class="season-val">${W.dec(m.index)}</span><span class="season-bar" style="height:${Math.round((m.index / maxIdx) * 100)}%"></span><small>${m.month}</small></div>`,
      )
      .join("")}</div></section><section class="card"><div class="section-head"><div><h2>📌 Evento da sua região</h2><p>Festa do bairro, feira, jogo do time, feriado da cidade… A IA inclui no planejamento.</p></div></div><form id="event-form" class="form-grid"><div class="field full"><label for="ev-name">Nome do evento</label><input id="ev-name" name="name" required maxlength="60" placeholder="Ex.: Festa do bairro"></div><div class="field"><label for="ev-date">Data</label><input id="ev-date" name="date" type="date" required></div><div class="field"><label for="ev-inc">Aumento esperado (%)</label><input id="ev-inc" name="increase" type="number" min="1" max="500" value="30" required></div><div class="field"><label for="ev-days">Dias de pico</label><input id="ev-days" name="windowDays" type="number" min="1" max="60" value="3" required></div><div class="field"><label>&nbsp;</label><button class="btn primary">Adicionar evento</button></div></form>${
      (state.customEvents || []).length
        ? `<h3 class="block-title">Seus eventos</h3>${state.customEvents
            .map((c) => `<div class="channel-row"><span>📌</span><div>${esc(c.name)}<div class="muted">${c.date.split("-").reverse().join("/")} · ${pct(c.mult)} · ${plural(c.windowDays, "dia", "dias")}</div></div><button class="link" data-remove-event="${c.id}">Remover</button></div>`)
            .join("")}`
        : ""
    }</section></div>` +
    reportsSection() +
    aiStrip(
      "A IA se antecipa aos picos.",
      "Durante o pico de uma data especial, a previsão de ruptura, o pedido automático e a trava de anúncios passam a usar a demanda aumentada — o estoque não acaba no meio da Black Friday.",
      "automacoes",
      "Ver automações →",
    )
  );
}

// Relatórios pós-evento: previsto × real, o que faltou, o que sobrou e o que a IA aprendeu
function reportsSection() {
  const reports = state.eventReports || [];
  if (!reports.length) return "";
  return `<section class="card"><div class="section-head"><div><h2>📊 Como foram as últimas datas</h2><p>Depois de cada data especial, a IA compara o que previu com o que aconteceu e ajusta a próxima previsão.</p></div>${badge("Histórico demonstrativo", "neutral")}</div><div class="report-grid">${reports
    .map((r) => {
      const worst = [...r.rows].sort((a, b) => b.lost - a.lost)[0];
      return `<article class="report"><div class="report-head"><span>${r.emoji}</span><div><b>${esc(r.name)}</b><small>${new Date(r.ts).toLocaleDateString("pt-BR")} · pico de ${plural(r.windowDays, "dia", "dias")}</small></div>${badge("Acerto " + r.accuracy + "%", r.accuracy >= 90 ? "" : "warn")}</div><div class="report-stats"><div><small>Previsto</small><b>${r.forecastUnits} un.</b></div><div><small>Procura real</small><b>${r.demandUnits} un.</b></div><div><small>Vendido</small><b>${money(r.revenue)}</b></div><div><small>Faltou</small><b class="${r.lostUnits ? "danger-text" : ""}">${r.lostUnits} un. · ${money(r.lostRevenue)}</b></div><div><small>Sobrou</small><b>${r.leftoverUnits} un.</b></div></div><div class="report-bars">${r.rows
        .slice()
        .sort((a, b) => b.demand - a.demand)
        .slice(0, 4)
        .map((row) => {
          const max = Math.max(row.forecast, row.demand, 1);
          return `<div class="rb"><span>${esc(row.emoji)} ${esc(row.name)}</span><div class="rb-bars"><i class="f" style="width:${(row.forecast / max) * 100}%"></i><i class="d" style="width:${(row.demand / max) * 100}%"></i></div><small>${row.forecast} → ${row.demand}</small></div>`;
        })
        .join("")}<p class="caption">■ previsto  ■ procura real</p></div><div class="ai-strip compact"><span class="spark">✧</span><div><h2>O que a IA aprendeu</h2><p>${esc(r.lesson)} ${worst && worst.lost ? "" : ""}Ajuste para a próxima vez: procura ${W.dec(r.learning)}× a previsão.</p></div></div></article>`;
    })
    .join("")}</div></section>`;
}
