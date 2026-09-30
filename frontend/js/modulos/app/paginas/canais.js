"use strict";
// Canais de venda — visão geral de todos os canais e uma página para cada um.

const kindLabel = { proprio: "Canal próprio", social: "Rede social", marketplace: "Marketplace", delivery: "App de delivery" };
// "taxa 16% + R$ 6,25 por unidade abaixo de R$ 79" ou "sem taxa por venda"
const feeText = (id) => {
  const label = W.feeLabel(state, id);
  return label.startsWith("sem") ? label : "taxa " + label;
};

function channelSummary(id) {
  const orders = state.orders.filter((o) => o.channel === id && o.status !== "expirado");
  const statuses = state.products.map((p) => W.channelStatus(state, p, id));
  return {
    revenue: orders.reduce((a, o) => a + o.total, 0),
    orders: orders.length,
    open: orders.filter((o) => OPEN_STATUS.includes(o.status)).length,
    active: statuses.filter((s) => s === "ativo").length,
    paused: statuses.filter((s) => s === "pausado" || s === "sem_estoque").length,
  };
}

function canaisPage() {
  const connected = state.connected.length;
  const use = W.planUsage(state);
  const full = (c) => use.channels >= use.plan.maxChannels || (W.isExternal(c.id) && use.marketplaces >= use.plan.maxMarketplaces);
  return (
    heading(
      "Canais de venda",
      `${connected} canais conectados, todos vendendo do mesmo estoque. Seu plano ${use.plan.name} inclui até ${use.plan.maxChannels} canais (${use.plan.maxMarketplaces} marketplaces).`,
      `<a class="btn" href="loja.html" target="_blank" rel="noopener">🌐 Abrir meu site</a>`,
    ) +
    `<div class="hub"><div class="hub-center"><span>📦</span><b>Estoque único</b><small>${W.metrics(state).unitsDisponiveis} un. disponíveis</small></div><div class="hub-ring">${W.channelsFor(state)
      .map((c) => `<a href="#canal/${c.id}" class="hub-node ${state.connected.includes(c.id) ? "" : "off"}">${logo(c.id, "sm")}<span>${esc(c.name)}</span></a>`)
      .join("")}</div></div>` +
    `<div class="channel-grid">${W.channelsFor(state)
      .map((c) => {
        const on = state.connected.includes(c.id);
        const sm = channelSummary(c.id);
        return `<section class="card channel-card ${on ? "" : "off"}"><div class="market-title">${logo(c.id)}<div><h2>${esc(c.name)}</h2><small>${kindLabel[c.kind]} · ${feeText(c.id)}</small></div>${badge(on ? "Conectado" : "Não conectado", on ? "" : "neutral")}</div>${
          on
            ? `<div class="mini-stats"><div><strong>${money(sm.revenue)}</strong><small>vendas hoje</small></div><div><strong>${sm.open}</strong><small>pedidos abertos</small></div><div><strong>${sm.active}</strong><small>anúncios ativos</small></div></div>${sm.paused ? `<div class="validation">⏸ ${plural(sm.paused, "anúncio pausado", "anúncios pausados")} pela IA para não vender sem estoque.</div>` : ""}<a class="btn wide" href="#canal/${c.id}">Abrir ${esc(c.name)} →</a>`
            : full(c)
              ? `<p class="muted small-text">Seu plano ${use.plan.name} já usa todos os canais incluídos. Cada marketplace tem custo de integração: fale com seu consultor para incluir ${esc(c.name)}.</p><button class="btn wide" data-action="consultant">💬 Falar com meu consultor</button>`
              : `<p class="muted small-text">Conecte para publicar seus ${state.products.length} produtos com o mesmo estoque, sem cadastrar de novo.</p><button class="btn primary wide" data-connect="${c.id}" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Conectando…" : "Conectar"}</button>`
        }</section>`;
      })
      .join("")}</div>`
  );
}

function canalPage(id) {
  const c = W.channelById(id);
  if (!c) return heading("Canal não encontrado", "Volte para a visão geral dos canais.", '<a class="btn" href="#canais">← Canais</a>');
  const on = state.connected.includes(id);
  const back = '<a class="btn" href="#canais">← Todos os canais</a>';
  if (!on)
    return (
      heading(esc(c.name), kindLabel[c.kind] + " · não conectado", back) +
      `<section class="card connect-card">${logo(id, "lg")}<h2>Conectar ${esc(c.name)}</h2><p>Ao conectar, a WedTech publica automaticamente seus <b>${plural(state.products.length, "produto", "produtos")}</b> em ${esc(c.name)}, usando o <b>mesmo estoque</b> da loja, do site e dos outros canais. Produtos pausados pela IA entram pausados.</p><ul class="bullets"><li>Sem cadastrar tudo de novo</li><li>Pedidos chegam na tela Pedidos, junto com os outros canais</li><li>${feeText(id).replace(/^./, (l) => l.toUpperCase())}</li></ul><button class="btn primary big" data-connect="${id}" ${ui.busy ? "disabled" : ""}>${ui.busy ? '<span class="spin"></span>Conectando…' : "Conectar " + esc(c.name)}</button><p class="caption">Conexão simulada, sem credenciais reais.</p></section>`
    );
  const sm = channelSummary(id);
  const orders = state.orders.filter((o) => o.channel === id).sort((a, b) => b.ts - a.ts).slice(0, 8);
  const extra =
    id === "site"
      ? `<a class="btn primary" href="loja.html" target="_blank" rel="noopener">🌐 Abrir meu site</a>`
      : id === "loja"
        ? `<a class="btn primary" href="#balcao">🛒 Abrir o caixa</a>`
        : id === "whats"
          ? `<button class="btn primary" data-action="copy-catalog">🔗 Copiar link do catálogo</button>`
          : `<button class="btn primary" data-simulate="${id}" ${ui.busy ? "disabled" : ""}>+ Simular pedido</button>`;
  const tip =
    W.isExternal(id)
      ? `Cada venda no ${esc(c.name)} custa ${W.feeLabel(state, id)} de taxa.${c.kind === "delivery" ? " O pedido sai da prateleira: o entregador do app retira no balcão." : ""} Quando o estoque está curto, a IA pausa este canal primeiro e guarda o produto para a loja e o site, onde a margem é maior.`
      : id === "site"
        ? "Seu site mostra o estoque real: o cliente escolhe retirar na loja (grátis) ou receber em casa. A compra reserva o produto na hora."
        : id === "whats"
          ? "Envie o link do catálogo para seus clientes no WhatsApp e no Instagram. Os pedidos entram direto na tela Pedidos."
          : "Na loja física, cada venda bipada no balcão atualiza o estoque de todos os canais online na hora.";
  return (
    heading(`${logo(id)} ${esc(c.name)}`, kindLabel[c.kind] + " · " + feeText(id), back + extra) +
    `<div class="kpis four"><div class="card kpi"><div class="kpi-label">Vendas hoje</div><strong>${money(sm.revenue)}</strong><small>${plural(sm.orders, "pedido", "pedidos")}</small></div><div class="card kpi"><div class="kpi-label">Pedidos em aberto</div><strong>${sm.open}</strong><small>para separar ou entregar</small></div><div class="card kpi"><div class="kpi-label">Anúncios ativos</div><strong>${sm.active}</strong><small>de ${state.products.length} produtos</small></div><div class="card kpi"><div class="kpi-label">Pausados pela IA</div><strong>${sm.paused}</strong><small>sem estoque ou aguardando fornecedor</small></div></div>` +
    aiStrip("Dica da WedTech AI", tip) +
    marginWarning(id) +
    (W.isExternal(id) ? pricingCard(c) : "") +
    `<div class="chart-grid"><section class="card table-card"><div class="section-head pad"><h2>Produtos neste canal</h2></div><div class="table-wrap"><table><thead><tr><th>Produto</th><th>Preço neste canal</th><th>Lucro por unidade</th><th>Disponível</th><th>Status</th><th>Publicado</th></tr></thead><tbody>${state.products
      .map((p) => {
        const cs = W.channelStatus(state, p, id);
        return `<tr><td><div class="product-name">${productThumb(p, "sm")}<button class="product-button" data-product="${p.id}">${esc(p.name)}</button></div></td><td>${money(W.priceFor(state, p, id))}${W.priceFor(state, p, id) !== p.price ? `<small>base ${money(p.price)}</small>` : ""}</td><td>${marginCell(p, id)}</td><td>${W.stockOf(state, p).disponivel}</td><td>${channelBadge(cs)}</td><td><label class="toggle"><input type="checkbox" data-publish="${p.id}:${id}" ${p.channels.includes(id) ? "checked" : ""} ${id === "loja" ? "disabled" : ""}><span></span></label></td></tr>`;
      })
      .join("")}</tbody></table></div></section><section class="card"><div class="section-head"><h2>Últimos pedidos</h2><a class="link" href="#pedidos">Todos os pedidos →</a></div>${
      orders.length
        ? orders
            .map(
              (o) =>
                `<button type="button" class="channel-row row-button" data-order="${o.id}"><span>${typeIcon[o.type]}</span><div>${o.id} · ${esc(o.customer.name)}<div class="muted">${money(o.total)} · ${esc(ago(o.ts))}</div></div>${orderBadge(o)}</button>`,
            )
            .join("")
        : emptyBox("Nenhum pedido neste canal ainda.")
    }</section></div>`
  );
}

// Preço por canal: repassar a taxa do marketplace/app para manter a margem
function pricingCard(c) {
  const mk = (state.channelPricing || {})[c.id] || 0;
  const sug = W.suggestedMarkup(c.id, state);
  const fees = W.channelFees(state, c.id);
  const ex = state.products[0];
  return `<section class="card pricing-card"><div class="section-head"><div><h2>💲 Preço neste canal</h2><p>O ${esc(c.name)} cobra ${W.feeLabel(state, c.id)}. Para receber o mesmo que na loja, a IA sugere vender aqui <b>+${sug}%</b>. Na loja, no site e no WhatsApp o preço continua o de sempre.</p></div></div><form id="pricing-form" class="scan-form" data-channel="${c.id}"><div class="field narrow"><label for="pricing-pct">Ajuste (%)</label><input id="pricing-pct" name="pct" type="number" min="-30" max="80" value="${mk}"></div><button class="btn primary">Salvar ajuste</button><button type="button" class="btn" data-apply-markup="${c.id}">✧ Usar sugestão da IA (+${sug}%)</button></form>${
    ex ? `<p class="caption">Exemplo: ${esc(ex.name)} — loja ${money(ex.price)} → ${esc(c.name)} ${money(W.priceFor(state, ex, c.id))}.</p>` : ""
  }<form id="fees-form" class="scan-form" data-channel="${c.id}"><div class="field narrow"><label for="fees-pct">Comissão (%)</label><input id="fees-pct" name="pct" type="number" step="0.1" min="0" max="50" value="${Math.round(fees.pct * 1000) / 10}"></div><div class="field narrow"><label for="fees-fixed">Taxa fixa por unidade (R$)</label><input id="fees-fixed" name="fixed" type="number" step="0.01" min="0" max="50" value="${fees.fixed}"></div><div class="field narrow"><label for="fees-below">Só abaixo de (R$, 0 = sempre)</label><input id="fees-below" name="below" type="number" step="0.01" min="0" max="1000" value="${fees.below}"></div><div class="field narrow"><label for="fees-margin">Margem mínima (%)</label><input id="fees-margin" name="minMargin" type="number" min="0" max="80" value="${W.minMarginOf(state)}"></div><button class="btn primary">Salvar taxas</button></form><p class="caption">Valores de exemplo: confira a tabela atual do ${esc(c.name)} para a sua categoria. A margem mínima vale para todos os canais.</p></section>`;
}

// Lucro de uma unidade vendida no canal, com aviso de prejuízo ou margem baixa
function marginCell(p, id) {
  const m = W.channelMargin(state, p, id);
  const tone = m.level === "prejuizo" ? "danger" : m.level === "baixa" ? "warn" : "";
  return `${badge(money(m.profit) + " · " + W.dec(m.pct) + "%", tone)}<small>taxa ${money(m.fee)} · custo ${money(m.cost)}</small>`;
}
function marginWarning(id) {
  const alerts = W.marginAlerts(state, id);
  if (!alerts.length) return "";
  const loss = alerts.filter((a) => a.level === "prejuizo");
  const low = alerts.length - loss.length;
  const names = alerts.slice(0, 3).map((a) => `${esc(a.product.name)} (${money(a.profit)})`).join(", ");
  return aiStrip(
    loss.length ? "⚠ Produtos com prejuízo neste canal" : "Margem abaixo do mínimo",
    [loss.length ? plural(loss.length, "produto vende", "produtos vendem") + " com prejuízo" : "", low ? plural(low, "produto fica", "produtos ficam") + " abaixo da margem mínima de " + W.minMarginOf(state) + "%" : ""].filter(Boolean).join(" e ") +
      `: ${names}${alerts.length > 3 ? "…" : ""}. Suba o preço neste canal, despublique o produto ou revise as taxas.`,
  );
}
