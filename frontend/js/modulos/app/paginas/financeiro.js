"use strict";
// Financeiro — vendas, custo, taxas dos canais, despesas e lucro, sem planilha.

function financeiroPage() {
  const fin = W.financials(state);
  const channelsWithSales = fin.byChannel.filter((c) => c.revenue > 0);
  const best = [...channelsWithSales].sort((a, b) => b.margin - a.margin)[0];
  const worst = [...channelsWithSales].sort((a, b) => a.margin - b.margin)[0];
  const margins = state.products
    .map((p) => ({ ...p, marginPct: p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 1000) / 10 : 0 }))
    .sort((a, b) => a.marginPct - b.marginPct);
  const kpis = [
    ["Vendas hoje", money(fin.revenue), plural(W.metrics(state).orders, "venda", "vendas") + (fin.returns ? " · já sem " + money(fin.returns) + " de devoluções" : "")],
    ["Custo dos produtos", money(fin.cogs), "quanto você pagou nos produtos"],
    ["Taxas", money(fin.fees + fin.paymentFees), "canais " + money(fin.fees) + " · maquininha " + money(fin.paymentFees)],
    ["Despesas e perdas", money(fin.totalExpenses + fin.losses), fin.losses ? "inclui " + money(fin.losses) + " de produtos vencidos" : "aluguel, funcionário, contas"],
    ["Lucro líquido", money(fin.netProfit), fin.netProfit >= 0 ? "no azul 👍" : "no vermelho"],
  ];
  return (
    heading(
      "Financeiro",
      "Quanto você vendeu, gastou e lucrou hoje — por canal e por produto.",
      `<button class="btn" data-action="export-despesas-csv">⇩ Exportar CSV</button><button class="btn primary" data-action="toggle-expense-form">${ui.expenseFormOpen ? "Cancelar" : "+ Nova despesa"}</button>`,
    ) +
    `<div class="kpis five">${kpis
      .map(
        (k, i) =>
          `<div class="card kpi ${i === 4 ? "highlight" : ""}"><div class="kpi-label">${k[0]}</div><strong class="${i === 4 ? (fin.netProfit >= 0 ? "ok-text" : "danger-text") : ""}">${k[1]}</strong><small>${k[2]}</small></div>`,
      )
      .join("")}</div>` +
    (best && worst && best.channel !== worst.channel
      ? aiStrip(
          "Onde você mais lucra",
          `Cada R$ 100 vendidos em ${esc(best.name)} deixam ~${money(best.margin)} de lucro; em ${esc(worst.name)}, ~${money(worst.margin)}. Por isso, quando o estoque está curto, a IA guarda o produto para os canais mais lucrativos.`,
        )
      : "") +
    `<div class="chart-grid fin-grid"><section class="card table-card"><div class="section-head pad"><div><h2>Lucro por canal</h2><p>Vendas menos custo dos produtos e taxa do canal.</p></div></div><div class="table-wrap"><table><thead><tr><th>Canal</th><th>Vendas</th><th>Taxa</th><th>Lucro</th><th>Margem</th></tr></thead><tbody>${channelsWithSales
      .map(
        (c) =>
          `<tr><td><div class="product-name">${logo(c.channel, "sm")}${esc(c.name)}</div></td><td>${money(c.revenue)}</td><td class="muted">${money(c.fees)}<small>${Math.round(c.fee * 100)}%</small></td><td><b>${money(c.profit)}</b></td><td><b class="${c.margin < 40 ? "warn-text" : "ok-text"}">${W.dec(c.margin)}%</b></td></tr>`,
      )
      .join("")}</tbody></table></div></section><section class="card table-card"><div class="section-head pad"><div><h2>Despesas do dia</h2><p>Custos da loja rateados por dia.</p></div></div>${
      ui.expenseFormOpen
        ? '<form id="expense-form" class="form-grid pad"><div class="field"><label for="expense-category">Categoria</label><select id="expense-category" name="category"><option>Aluguel</option><option>Funcionário</option><option>Contas</option><option>Embalagens</option><option>Frete</option><option>Marketing</option><option>Outros</option></select></div><div class="field"><label for="expense-amount">Valor (R$)</label><input id="expense-amount" name="amount" type="number" min="0.01" step=".01" required></div><div class="field full"><label for="expense-description">Descrição</label><input id="expense-description" name="description" maxlength="140" placeholder="Ex.: Impulsionamento no Instagram"></div><div class="field full"><button class="btn primary">Registrar despesa</button></div></form>'
        : ""
    }<div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>${state.expenses
      .map((e) => `<tr><td><b>${esc(e.category)}</b></td><td class="muted">${esc(e.description)}</td><td>${money(e.amount)}</td></tr>`)
      .join("")}</tbody></table></div><div class="table-footer">Total: ${money(fin.totalExpenses)}</div></section></div>` +
    paymentsSection(fin) +
    `<section class="card table-card"><div class="section-head pad"><div><h2>Margem por produto</h2><p>Preço de venda × custo, dos menores para os maiores.</p></div></div><div class="table-wrap"><table><thead><tr><th>Produto</th><th>Custo</th><th>Preço</th><th>Margem</th></tr></thead><tbody>${margins
      .map(
        (p) =>
          `<tr><td><div class="product-name">${productThumb(p, "sm")}<b>${esc(p.name)}</b></div></td><td class="muted">${money(p.cost)}</td><td class="muted">${money(p.price)}</td><td><b class="${p.marginPct < 45 ? "warn-text" : ""}">${W.dec(p.marginPct)}%</b></td></tr>`,
      )
      .join("")}</tbody></table></div></section>`
  );
}

// Vendas do balcão por forma de pagamento (Pix, débito, crédito, dinheiro)
function paymentsSection(fin) {
  const rows = fin.byPayment.filter((p) => p.orders);
  if (!rows.length) return "";
  const total = rows.reduce((a, p) => a + p.revenue, 0) || 1;
  return `<section class="card"><div class="section-head"><div><h2>💳 Pagamentos no balcão</h2><p>Taxas de maquininha de hoje: <b>${money(fin.paymentFees)}</b>. Cada venda no Pix economiza essa taxa.</p></div></div><div class="bars">${rows
    .map(
      (p) =>
        `<div class="bar-row"><span>${{ pix: "⚡", debito: "💳", credito: "💳", dinheiro: "💵" }[p.method]}</span><span class="bar-name">${esc(p.label)}</span><span class="bar"><span style="width:${Math.max(4, (p.revenue / total) * 100)}%"></span></span><b>${money(p.revenue)}</b></div>`,
    )
    .join("")}</div></section>`;
}
