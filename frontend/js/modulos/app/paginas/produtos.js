"use strict";
// Produtos — catálogo central. Um cadastro, publicado em todos os canais.

// "lucro R$ 12,30" colorido: vermelho com prejuízo, amarelo abaixo da margem mínima
function profitText(m) {
  const cls = m.level === "prejuizo" ? "danger-text" : m.level === "baixa" ? "warn-text" : "ok-text";
  return `<span class="${cls}">${m.profit < 0 ? "prejuízo" : "lucro"} ${money(Math.abs(m.profit))}</span>`;
}

function miniChannels(p) {
  return `<div class="mini-channels">${state.connected
    .map((c) => {
      const st = W.channelStatus(state, p, c);
      return st === "nao_publicado" ? "" : `<span class="mini ${st}" title="${esc(W.channelById(c).name)}: ${W.channelStatusLabel[st]}">${logo(c, "xs")}</span>`;
    })
    .join("")}</div>`;
}

function produtosPage() {
  const q = ui.query.toLowerCase();
  const list = state.products.filter((p) => (p.name + " " + p.sku + " " + p.barcode).toLowerCase().includes(q));
  return (
    heading(
      "Produtos",
      "Um único cadastro para todos os canais. Estoque e informações sempre em sintonia.",
      `<button class="btn primary" data-action="new-product">+ Novo produto</button>`,
    ) +
    `<div class="toolbar"><input class="search" type="search" id="search" placeholder="Buscar por nome, SKU ou código de barras..." aria-label="Buscar produtos" value="${esc(ui.query)}"></div><section class="card table-card"><div class="table-wrap"><table><thead><tr><th>Produto</th><th>SKU / EAN</th><th>Preço</th><th>Disponível</th><th>Mínimo</th><th>Canais</th><th>Status</th></tr></thead><tbody>${list
      .map((p) => {
        const st = W.stockOf(state, p);
        const status = p.issue ? badge("Anúncio com erro", "warn") : p.lock ? badge("⏸ Pausado nos marketplaces", "warn") : st.disponivel <= 0 ? badge("Esgotado", "danger") : badge("Ativo");
        return `<tr><td><div class="product-name">${productThumb(p)}<button class="product-button" data-product="${p.id}">${esc(p.name)}<small>${esc(p.category)}</small></button></div></td><td class="muted">${esc(p.sku)}<small>${esc(p.barcode)}</small></td><td>${money(p.price)}</td><td><b class="${st.disponivel <= p.minStock ? "warn-text" : ""}">${st.disponivel}</b><small>${st.loja} loja · ${st.deposito} depósito</small></td><td>${p.minStock}</td><td>${miniChannels(p)}</td><td>${status}</td></tr>`;
      })
      .join("")}</tbody></table></div>${list.length ? "" : emptyBox("Nenhum produto encontrado.")}<div class="table-footer">${list.length} de ${plural(state.products.length, "produto", "produtos")}</div></section>` +
    aiStrip(
      "Vendeu em um canal, atualizou em todos.",
      "Abra um produto para ver o estoque por local, o status em cada canal e a etiqueta com código de barras para bipar com a câmera.",
    )
  );
}

function productDrawer(id) {
  const p = productById(id);
  if (!p) return "";
  const st = W.stockOf(state, p);
  const fx = W.forecast(state).find((f) => f.productId === p.id);
  const sup = W.supplierOf(state, p);
  const sold = state.orders
    .filter((o) => o.status !== "expirado")
    .reduce((a, o) => a + o.items.filter((i) => i.productId === p.id).reduce((b, i) => b + i.qty, 0), 0);
  const marginPct = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 1000) / 10 : 0;
  const analysis =
    fx.risk === "sem_estoque"
      ? "Produto esgotado. Pausei os anúncios online para não vender sem estoque."
      : p.lock
        ? `Anúncios pausados nos marketplaces: restam ${st.disponivel} un., que acabam em ~${W.dec(fx.daysToStockout)} dias, e ${sup?.name || "o fornecedor"} entrega em ${fx.leadTimeDays}. Reservei o restante para a loja e o site.`
        : fx.risk === "critico"
          ? `Abaixo do mínimo (${p.minStock}). Preparei um pedido ao fornecedor — confira em Compras.`
          : fx.risk === "atencao"
            ? `Acaba em ~${W.dec(fx.daysToStockout)} dias e o fornecedor leva ${fx.leadTimeDays}. Se chegar ao mínimo, preparo o pedido e travo os marketplaces.`
            : fx.risk === "parado"
              ? `Pouca saída: ${st.disponivel} un. para ~${fx.daysToStockout !== null ? W.dec(fx.daysToStockout) : "?"} dias. Sugiro promoção de ${fx.suggestedDiscount}% no site e no WhatsApp.`
              : p.issue
                ? "O título na Shopee está maior que o recomendado."
                : "Estoque saudável. Continuo acompanhando as vendas em todos os canais.";
  const sales = state.orders.filter((o) => o.items.some((i) => i.productId === p.id)).sort((a, b) => b.ts - a.ts).slice(0, 4);
  return drawerShell(
    "CATÁLOGO CENTRAL",
    "Fechar produto",
    `<div class="drawer-product">${productThumb(p, "lg")}<div><h1 id="drawer-title">${esc(p.name)}</h1><p class="muted drawer-sub">${esc(p.sku)} · ${esc(p.category)}</p></div></div><div class="detail-stats four"><div><small>Preço</small><strong>${money(p.price)}</strong></div><div><small>Disponível</small><strong>${st.disponivel}</strong></div><div><small>Vendidos hoje</small><strong>${sold}</strong></div><div><small>Margem</small><strong>${W.dec(marginPct)}%</strong></div></div><div class="loc-row">${st.byLoc
      .filter((l) => l.id !== "deposito" || state.store.hasDeposito)
      .map((l) => `<span>${l.id === "deposito" ? "📦" : "🏪"} ${esc(l.id === "loja" && W.shopsOf(state).length === 1 ? (state.store.hasDeposito ? "Prateleira" : "Na loja") : l.name)} <b>${l.qty}</b></span>`)
      .join("")}<span>🔒 Reservado <b>${st.reservado}</b></span></div>${productExtras(p)}<div class="ai-strip compact"><span class="spark">✧</span><div><h2>Análise da WedTech AI</h2><p>${esc(analysis)}</p></div></div>${
      p.lock ? `<button class="btn wide" data-reactivate="${p.id}" ${ui.busy ? "disabled" : ""}>▶ Reativar anúncios manualmente</button>` : ""
    }${p.issue ? `<button class="btn primary wide" data-action="fix-product" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Corrigindo…" : "✧ Corrigir anúncio com WedTech AI"}</button>` : ""}<h3 class="block-title">Reposição automática</h3><form id="product-settings-form" class="form-grid compact" data-id="${p.id}"><div class="field"><label for="ps-min">Estoque mínimo</label><input id="ps-min" name="minStock" type="number" min="0" max="9999" value="${p.minStock}"></div><div class="field"><label for="ps-supplier">Fornecedor</label><select id="ps-supplier" name="supplierId"><option value="">— sem fornecedor —</option>${state.suppliers
      .map((f) => `<option value="${f.id}" ${f.id === p.supplierId ? "selected" : ""}>${esc(f.name)} (${f.leadTimeDays} d)</option>`)
      .join("")}</select></div><div class="field full"><button class="btn primary">Salvar</button></div></form><p class="caption">Quando o disponível chegar a ${p.minStock} un., a IA prepara o pedido${sup ? " para " + esc(sup.name) + " (entrega em " + plural(sup.leadTimeDays, "dia", "dias") + ")" : ""}.</p><h3 class="block-title">Status em cada canal</h3>${W.channelsFor(state)
      .map((c) => {
        const cs = W.channelStatus(state, p, c.id);
        const connected = state.connected.includes(c.id);
        return `<div class="channel-row">${logo(c.id, "sm")}<div>${esc(c.name)}<div class="muted">${connected ? money(W.priceFor(state, p, c.id)) + " · " + profitText(W.channelMargin(state, p, c.id)) : ""}</div></div>${channelBadge(cs)}${
          connected
            ? `<label class="toggle" title="Publicar em ${esc(c.name)}"><input type="checkbox" data-publish="${p.id}:${c.id}" ${p.channels.includes(c.id) ? "checked" : ""} ${c.id === "loja" ? "disabled" : ""}><span></span></label>`
            : `<a class="link" href="#canal/${c.id}">Conectar</a>`
        }</div>`;
      })
      .join("")}<h3 class="block-title">Etiqueta com código de barras</h3><div class="barcode-box">${renderBarcode(p.barcode)}<span class="caption">Mostre esta etiqueta para a câmera no balcão para bipar de verdade.</span></div><h3 class="block-title">Últimas vendas</h3>${
      sales
        .map(
          (o) =>
            `<div class="channel-row">${logo(o.channel, "xs")}<span>${o.id}<small class="block">${W.orderTypes[o.type]} · ${esc(ago(o.ts))}</small></span>${orderBadge(o)}</div>`,
        )
        .join("") || '<p class="caption">Este produto ainda não teve vendas.</p>'
    }`,
  );
}

// Grade, lotes com validade e promoção do produto
function productExtras(p) {
  let html = "";
  if (p.variants && p.variants.length)
    html += `<h3 class="block-title">${esc(p.variantKind || "Tamanho")} · grade</h3><div class="grade-cells">${p.variants
      .map((v) => {
        const free = W.variantFree(state, p, v);
        return `<span class="grade-cell ${free === 0 ? "out" : free <= 2 ? "low" : ""}"><small>${esc(v.label)}</small><b>${free}</b></span>`;
      })
      .join("")}</div>`;
  const lots = W.lotsOf(state, p);
  if (lots.length)
    html += `<h3 class="block-title">📅 Lotes e validade</h3>${lots
      .map((l) => `<div class="channel-row"><span>${esc(l.code)}</span><div>${l.qty} un.<div class="muted">vence em ${new Date(l.expiry).toLocaleDateString("pt-BR")}</div></div>${badge(l.daysLeft <= 7 ? "Vence em " + plural(Math.max(0, l.daysLeft), "dia", "dias") : "Em dia", l.daysLeft <= 7 ? "warn" : "")}</div>`)
      .join("")}`;
  const promo = p.promo && p.promo.until > W.now(state) ? p.promo : null;
  html += promo
    ? `<div class="validation ok">🏷️ Promoção de ${promo.pct}% ativa no balcão, no site e no WhatsApp até ${new Date(promo.until).toLocaleDateString("pt-BR")}. <button class="link" data-clear-promo="${p.id}">Encerrar</button></div>`
    : `<form id="promo-form" class="scan-form" data-id="${p.id}"><div class="field narrow"><label for="promo-pct">Promoção (%)</label><input id="promo-pct" name="pct" type="number" min="5" max="70" value="15"></div><div class="field narrow"><label for="promo-days">Por (dias)</label><input id="promo-days" name="days" type="number" min="1" max="60" value="7"></div><button class="btn">🏷️ Criar promoção</button></form><p class="caption">A promoção vale na loja, no site e no WhatsApp. Nos marketplaces o preço segue o ajuste de cada canal.</p>`;
  return html;
}
