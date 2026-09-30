"use strict";
// ADS · Anúncios — cadastre uma vez, a IA adapta o anúncio para cada canal e publica.
// Etapas: 0 formulário · 1 IA analisando · 2 revisão com avisos · 3 pronto · 4 publicando · 5 publicado

function blankDraft() {
  return {
    name: "",
    category: "",
    sku: "",
    barcode: "",
    price: "",
    cost: "",
    stockLoja: "",
    stockDeposito: "",
    minStock: "5",
    supplierId: state.suppliers[0]?.id || "",
    description: "",
    emoji: "📦",
    image: "",
    sizes: "",
    shelfLifeDays: "",
  };
}
function resetOne() {
  ui.one = {
    stage: 0,
    progress: 0,
    selected: state.connected.filter((c) => c !== "loja"),
    ads: [],
    draft: blankDraft(),
    publishedId: null,
  };
}

// Exemplo pronto por tipo de loja (botão "Preencher exemplo")
const adsExamples = {
  moda: { name: "Tênis Esportivo Leve", category: "Calçados", price: 219.9, cost: 118, emoji: "👟", sizes: "37, 38, 39, 40, 41, 42" },
  alimentacao: { name: "Café Gourmet em Grãos 1kg", category: "Cafés", price: 79.9, cost: 41, emoji: "☕", shelfLifeDays: "180" },
  eletronicos: { name: "Capinha de Silicone Colorida", category: "Capinhas", price: 34.9, cost: 11, emoji: "📱", sizes: "iPhone 13, iPhone 14, iPhone 15" },
};

// "IA" local que escreve a descrição a partir do nome e da categoria
function aiDescription(d) {
  const name = d.name || "Este produto";
  const cat = (d.category || "produto").toLowerCase();
  return `${name}: qualidade de ${cat} que você encontra aqui no bairro. Compre pelo site e retire na loja no mesmo dia, ou receba em casa. Garantia e troca facilitada direto com a ${state.store.name}.`;
}

function buildAds(d, selected) {
  const price = money(Number(d.price) || 0);
  return selected.map((id) => {
    const base = { channel: id, fixed: false, warning: "" };
    if (id === "ml") return { ...base, title: `${d.name} ${d.category} Original`, description: d.description, warning: d.barcode ? "" : "Código de barras (GTIN) não informado." };
    if (id === "shopee")
      return { ...base, title: `${d.name} | ${d.category} · Qualidade e conforto para todos os momentos do seu dia a dia`, description: "Conheça " + d.name + ". " + d.description, warning: "Título ultrapassa o tamanho recomendado pela Shopee." };
    if (id === "tiktok") return { ...base, title: `${d.name} ✨ seu novo favorito`, description: "Descubra " + d.name + "! " + d.description };
    if (id === "whats") return { ...base, title: `🔥 ${d.name} por ${price}!`, description: `Chegou na ${state.store.name}! Retire na loja ou receba em casa. Peça pelo link do nosso site.` };
    if (id === "site") return { ...base, title: d.name, description: d.description };
    if (["ifood", "rappi", "food99"].includes(id))
      return { ...base, title: d.name + " · " + d.category, description: "Direto do nosso empório para a sua casa. " + d.description, warning: d.image ? "" : "Apps de delivery vendem mais com foto do produto." };
    if (id === "shein") return { ...base, title: d.name + " | " + d.category + " tendência", description: d.description + (d.sizes ? " Tamanhos: " + d.sizes + "." : "") };
    if (id === "amazon") return { ...base, title: d.name + " - " + d.category + " - Original com nota fiscal", description: d.description };
    return { ...base, title: `${d.name} - ${d.category}`, description: d.description };
  });
}

function stepbar(stage) {
  const current = stage === 0 ? 0 : stage < 4 ? 1 : 2;
  return `<div class="steps">${["Produto", "IA prepara os anúncios", "Publicar em todos os canais"]
    .map((s, i) => `<span class="${current >= i ? "current" : ""}"><b>${i + 1}</b>${s}</span>`)
    .join("")}</div>`;
}

function adsPage() {
  if (!ui.one) resetOne();
  const o = ui.one;
  const d = o.draft;
  const head = heading(
    "ADS · Anúncios",
    "Cadastre uma vez. A WedTech AI adapta o anúncio para cada canal e publica em todos.",
    o.stage === 0 ? '<button class="btn" data-action="ads-example">Preencher exemplo</button>' : "",
  );
  if (o.stage === 0) {
    const field = (key, label, type = "text", extra = "") =>
      `<div class="field ${key === "name" ? "full" : ""}"><label for="ad-${key}">${label}</label><input id="ad-${key}" name="${key}" type="${type}" value="${esc(d[key])}" ${extra}></div>`;
    return (
      head +
      stepbar(0) +
      `<form id="ads-form" class="form-layout"><section class="card"><div class="section-head"><div><h2>Informações do produto</h2><p>O ponto de partida de todos os anúncios.</p></div></div><div class="form-grid">${field("name", "Nome do produto", "text", 'required maxlength="120"')}${field("category", "Categoria", "text", 'required maxlength="60"')}${field("sku", "SKU (código interno)", "text", 'required maxlength="40"')}${field("barcode", 'Código de barras (EAN) <span class="muted">(opcional)</span>', "text", 'maxlength="14" inputmode="numeric"')}${field("price", "Preço de venda (R$)", "number", 'required min="0.01" step="0.01"')}${field("cost", 'Custo (R$) <span class="muted">(opcional)</span>', "number", 'min="0" step="0.01"')}${field("stockLoja", "Quantidade na loja", "number", 'min="0" step="1" required')}${field("stockDeposito", "Quantidade no depósito", "number", 'min="0" step="1"')}${field("minStock", "Estoque mínimo", "number", 'min="0" step="1" required')}${
        state.tipo === "alimentacao"
          ? field("shelfLifeDays", 'Validade (dias) <span class="muted">(perecível)</span>', "number", 'min="0" step="1"')
          : field("sizes", state.tipo === "moda" ? 'Tamanhos <span class="muted">(ex.: P, M, G)</span>' : 'Modelos <span class="muted">(ex.: iPhone 14, iPhone 15)</span>', "text", 'maxlength="120"')
      }<div class="field"><label for="ad-supplierId">Fornecedor</label><select id="ad-supplierId" name="supplierId"><option value="">— sem fornecedor —</option>${state.suppliers
        .map((f) => `<option value="${f.id}" ${f.id === d.supplierId ? "selected" : ""}>${esc(f.name)}</option>`)
        .join("")}</select></div><div class="field full"><label for="ad-description">Descrição <button type="button" class="link" data-action="ads-ai-description">✧ Escrever com a IA</button></label><textarea id="ad-description" name="description" required maxlength="2000">${esc(d.description)}</textarea></div><div class="field full"><label for="ad-image">Foto do produto <span class="muted">(opcional)</span></label><input id="ad-image" type="file" accept="image/png,image/jpeg,image/webp"><span class="help">PNG, JPG ou WebP até 1 MB. Fica só neste navegador.</span>${d.image ? `<img src="${esc(d.image)}" class="image-preview" alt="Prévia do produto">` : ""}</div></div></section><aside><section class="card"><h2>Onde você quer vender?</h2><p class="muted small-text">A IA adapta título e descrição para cada canal. A loja física entra sempre.</p>${W.channelsFor(state)
        .filter((c) => c.id !== "loja")
        .map((c) => {
          const on = state.connected.includes(c.id);
          return `<label class="check-row ${on ? "" : "off"}"><input type="checkbox" name="channel" value="${c.id}" ${o.selected.includes(c.id) && on ? "checked" : ""} ${on ? "" : "disabled"}>${logo(c.id, "sm")}<span>${esc(c.name)}${on ? "" : ' <small class="muted">não conectado</small>'}</span></label>`;
        })
        .join("")}<button class="btn primary wide" type="submit">✧ Preparar anúncios com a WedTech AI</button><p class="caption">IA e publicação simuladas. Nenhum anúncio é enviado para plataformas reais.</p></section></aside></form>`
    );
  }
  if (o.stage === 1) {
    const steps = ["Produto identificado", "Categoria analisada", "Regras de cada canal verificadas", "Títulos e descrições adaptados", "Anúncios prontos"];
    return (
      head +
      stepbar(1) +
      `<section class="card progress-card"><h2><span class="spin"></span>A WedTech AI está preparando seus anúncios...</h2>${steps
        .map((s, i) => `<div class="progress-line" style="opacity:${o.progress > i ? 1 : 0.35}">${o.progress > i ? "✓" : "○"} ${s}</div>`)
        .join("")}<p class="caption">Preparando versões para ${plural(o.selected.length, "canal", "canais")}.</p></section>`
    );
  }
  const pending = o.ads.some((a) => a.warning && !a.fixed);
  return (
    head +
    stepbar(o.stage) +
    (o.stage === 5 ? '<div class="success-banner"><h2>✓ Produto publicado em todos os canais.</h2><p>Ele já está no catálogo central e todos os canais vendem do mesmo estoque.</p></div>' : "") +
    `<section class="card"><div class="section-head flat"><div><span class="wedtech-label">PRODUTO ORIGINAL</span><h2>${esc(d.emoji)} ${esc(d.name)}</h2><p>${esc(d.description)}</p></div><strong>${money(Number(d.price))}</strong></div></section><div class="ad-grid">${o.ads
      .map(
        (a, i) =>
          `<section class="card ad-card"><div class="section-head">${logo(a.channel)}${badge(o.stage === 5 ? "✓ Publicado" : o.stage === 4 ? (o.progress > i ? "✓ Publicado" : "Publicando…") : "Pronto", o.stage === 4 ? "neutral" : "")}</div><small>${esc(W.channelById(a.channel).name)}</small><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p><p class="ad-price">${money(Number(d.price))}</p><div class="validation ${a.fixed || !a.warning ? "ok" : ""}">${a.fixed ? "✓ Ajustado pela WedTech AI." : a.warning ? "⚠ " + esc(a.warning) : "✓ Nenhum problema encontrado."}</div></section>`,
      )
      .join("")}</div><div class="card"><div class="section-head flat"><div><h2>${
      o.stage === 5 ? "Tudo pronto para vender." : o.stage === 4 ? "Publicando nos canais selecionados…" : pending ? "A IA encontrou ajustes a fazer." : "Todos os anúncios estão prontos."
    }</h2><p>${o.stage === 5 ? "Abra o produto para ver o estoque por canal." : "Validação ilustrativa, sem consulta às regras reais dos marketplaces."}</p></div><div class="actions">${
      o.stage === 5
        ? `<button class="btn" data-action="ads-another">Novo cadastro</button><button class="btn primary" data-product="${o.publishedId}">Ver produto</button>`
        : o.stage === 4
          ? '<span class="spin"></span>'
          : `<button class="btn" data-action="ads-edit" ${ui.busy ? "disabled" : ""}>Editar produto</button>${
              pending
                ? `<button class="btn primary" data-action="ads-fix" ${ui.busy ? "disabled" : ""}>${ui.busy ? "Corrigindo…" : "✧ Corrigir com a WedTech AI"}</button>`
                : '<button class="btn primary" data-action="ads-publish">Publicar em todos</button>'
            }`
    }</div></div></div>`
  );
}
