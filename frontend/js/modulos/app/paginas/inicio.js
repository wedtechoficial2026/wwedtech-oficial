"use strict";
// Início — dashboard simplificado para o lojista de bairro:
// números do dia clicáveis (vendas, ruptura, melhor canal, parados, pedidos), reposição,
// "O que fazer agora", primeiros passos, vendas por canal e a IA.

const quickQuestions = ["O que eu faço agora?", "Tenho risco de ficar sem estoque?", "Resuma meu dia."];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function checklistCard() {
  const c = W.checklist(state);
  if (state.onboarding.hidden || c.done === c.total) return "";
  const pct = Math.round((c.done / c.total) * 100);
  return `<section class="card checklist"><div class="section-head"><div><h2>Primeiros passos</h2><p>${c.done} de ${c.total} concluídos — em poucos minutos sua loja está vendendo em todos os canais.</p></div><button class="link" data-action="hide-checklist">Ocultar</button></div><div class="progress"><span style="width:${pct}%"></span></div><div class="checklist-grid">${c.steps
    .map((st) => `<a href="#${st.route}" class="check-step ${st.done ? "done" : ""}"><span class="check-dot">${st.done ? "✓" : ""}</span>${esc(st.text)}</a>`)
    .join("")}</div></section>`;
}

function inicioPage(m) {
  const todo = W.todo(state);
  const sales = W.salesByChannel(state).filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const maxSale = Math.max(1, ...sales.map((c) => c.revenue));
  const firstName = state.store.owner || state.store.name.split(" ")[0];
  const answer = ui.dashAnswer;
  const recentLog = state.automationLog.slice(0, 4);
  const rule = (id) => W.automationRules.find((r) => r.id === id);
  return (
    heading(
      `${greeting()}, ${esc(firstName)}!`,
      "Veja como está sua loja hoje em todos os canais.",
      `<a class="btn" href="#balcao">🛒 Abrir o caixa</a><button class="btn primary" data-action="new-product">+ Novo produto</button>`,
    ) +
    checklistCard() +
    dashboardKpis(m) +
    restockCard() +
    `<div class="home-grid"><section class="card"><div class="section-head"><div><h2>O que fazer agora</h2><p>A WedTech AI organizou suas tarefas por prioridade.</p></div>${badge("✧ WedTech AI", "neutral")}</div>${
      todo.length
        ? `<ul class="todo-list">${todo
            .slice(0, 6)
            .map((t) => `<li class="${t.tone}"><span class="todo-icon">${t.icon}</span><span class="todo-text">${esc(t.text)}</span><a class="btn small" href="#${t.route}">${esc(t.cta)}</a></li>`)
            .join("")}</ul>`
        : emptyBox("Tudo em dia! Nenhuma tarefa pendente. 🎉")
    }</section><section class="card"><div class="section-head"><div><h2>Vendas por canal</h2><p>Um estoque só, vendendo em ${plural(sales.length, "canal", "canais")} hoje.</p></div><a class="link" href="#canais">Ver canais →</a></div>${
      sales.length
        ? `<div class="bars">${sales
            .map(
              (c) =>
                `<a class="bar-row" href="#canal/${c.channel}">${logo(c.channel, "xs")}<span class="bar-name">${esc(c.name)}</span><span class="bar"><span style="width:${Math.max(4, (c.revenue / maxSale) * 100)}%"></span></span><b>${money(c.revenue)}</b></a>`,
            )
            .join("")}</div>`
        : emptyBox("Nenhuma venda hoje ainda.")
    }</section></div>` +
    `<section class="dashboard-ai-hero" aria-labelledby="dashboard-ai-title"><div class="dashboard-ai-main"><div class="dashboard-ai-badge"><span>✧</span> WEDTECH AI · SUA ASSISTENTE</div><h2 id="dashboard-ai-title">Pergunte qualquer coisa sobre a sua loja.</h2><div class="dashboard-ai-answer" aria-live="polite">${
      ui.busy && !answer ? '<span class="spin"></span> Analisando sua loja...' : esc(answer || W.answer(state, "Resuma meu dia."))
    }</div><div class="dashboard-ai-chips">${quickQuestions
      .map((q, i) => `<button type="button" class="dashboard-ai-chip" data-dashboard-ask="${i}" ${ui.busy ? "disabled" : ""}>${q}</button>`)
      .join("")}</div><form class="dashboard-ai-form" id="dashboard-ai-form"><label class="sr-only" for="dashboard-ai-question">Pergunte à WedTech AI</label><input id="dashboard-ai-question" name="question" placeholder="Ex.: o que vai acabar esta semana?" required maxlength="500" ${ui.busy ? "disabled" : ""}><button ${ui.busy ? "disabled" : ""}>Perguntar ↑</button></form></div><aside class="dashboard-ai-side" aria-label="O que a IA fez por você"><div class="ai-side-title"><small>A IA TRABALHOU POR VOCÊ</small></div>${recentLog
      .map((l) => `<div class="ai-side-log"><span>${rule(l.rule)?.icon || (l.rule === "devolucao" ? "↩️" : "✧")}</span><p>${esc(l.text)}<small>${esc(ago(l.ts))}</small></p></div>`)
      .join("")}<a class="dashboard-ai-link" href="#automacoes">Ver todas as automações →</a></aside></section>`
  );
}

// Números do dia: cada cartão leva direto para a área que resolve o assunto
function dashboardKpis(m) {
  const fc = W.forecast(state);
  const impact = W.businessImpact(state);
  const zerados = state.products.filter((p) => W.stockOf(state, p).disponivel === 0).length;
  const acabando = fc.filter((f) => f.risk === "critico" || f.risk === "atencao").length;
  const best = W.salesByChannel(state)
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)[0];
  const card = (nav, cls, label, value, detail) =>
    `<button type="button" class="card big-kpi ${cls}" data-nav="${nav}"><small>${label}</small><strong>${value}</strong><span>${detail}</span></button>`;
  return `<div class="big-kpis five">${[
    card("financeiro", "", "Vendido hoje", money(m.revenue), plural(m.orders, "venda", "vendas") + " em todos os canais"),
    card(
      zerados ? "estoque:zerados" : "estoque:repor",
      zerados || acabando ? "attention" : "",
      "Ruptura de estoque",
      zerados ? plural(zerados, "zerado", "zerados") : acabando ? plural(acabando, "acabando", "acabando") : "Nenhuma",
      zerados && acabando ? "e " + plural(acabando, "produto acabando", "produtos acabando") : zerados || acabando ? "clique para repor" : "estoque sob controle",
    ),
    card(best ? "canal/" + best.channel : "canais", "", "Vendendo bem", best ? esc(best.name) : "—", best ? money(best.revenue) + " · " + plural(best.orders, "venda", "vendas") : "nenhuma venda hoje ainda"),
    card("estoque:parados", impact.paradoCount ? "attention" : "", "Previsão de parados", plural(impact.paradoCount, "produto", "produtos"), impact.capitalParado ? money(impact.capitalParado) + " em estoque sem girar" : "tudo girando"),
    card("pedidos", m.openOrders ? "attention" : "", "Pedidos para resolver", String(m.openOrders), m.toSeparate + " para separar · " + m.pickupsReady + " para retirar"),
  ].join("")}</div>`;
}

// Produtos zerados ou abaixo do mínimo, com o pedido ao fornecedor a um clique
function restockCard() {
  const list = state.products
    .map((p) => ({ p, st: W.stockOf(state, p) }))
    .filter(({ p, st }) => st.disponivel <= p.minStock)
    .sort((a, b) => a.st.disponivel - b.st.disponivel);
  if (!list.length) return "";
  return `<section class="card"><div class="section-head"><div><h2>Ruptura e reposição</h2><p>Produtos zerados ou abaixo do estoque mínimo. Peça ao fornecedor sem sair daqui.</p></div><button class="link" data-nav="estoque:repor">Ver no estoque →</button></div>${list
    .slice(0, 6)
    .map(
      ({ p, st }) =>
        `<div class="channel-row">${productThumb(p, "sm")}<div>${esc(p.name)}<div class="muted">${st.disponivel === 0 ? '<b class="danger-text">zerado</b>' : st.disponivel + " disponíveis"} · mínimo ${p.minStock}</div></div>${restockAction(p)}</div>`,
    )
    .join("")}</section>`;
}
