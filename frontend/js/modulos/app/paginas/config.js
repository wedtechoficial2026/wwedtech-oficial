"use strict";
// Configurações — dados da loja, plano contratado, tipo de loja e locais de estoque.

function usageBar(label, used, max) {
  const pctUsed = Math.min(100, Math.round((used / max) * 100));
  return `<div class="usage"><div class="usage-top"><span>${label}</span><b>${used} de ${max}</b></div><div class="shelf-bar"><span style="width:${pctUsed}%"></span></div></div>`;
}

function configPage() {
  const s = state.store;
  const current = W.storeTypes[state.tipo];
  const use = W.planUsage(state);
  const m = W.metrics(state);
  return (
    heading("Configurações", "Dados da sua loja, plano, tipo de negócio e locais de estoque.") +
    `<div class="bottom-grid"><section class="card"><div class="section-head"><h2>Dados da loja</h2></div><form id="store-form" class="form-grid"><div class="field full"><label for="st-name">Nome da loja</label><input id="st-name" name="name" value="${esc(s.name)}" required maxlength="80"></div><div class="field"><label for="st-owner">Seu nome</label><input id="st-owner" name="owner" value="${esc(s.owner || "")}" maxlength="40"></div><div class="field"><label for="st-cnpj">CNPJ</label><input id="st-cnpj" name="cnpj" value="${esc(s.cnpj)}" maxlength="20"></div><div class="field"><label for="st-whats">WhatsApp da loja</label><input id="st-whats" name="whatsapp" value="${esc(s.whatsapp)}" maxlength="20"></div><div class="field"><label for="st-hours">Horário de retirada</label><input id="st-hours" name="pickupHours" value="${esc(s.pickupHours)}" maxlength="60"></div><div class="field full"><label for="st-address">Endereço (retirada)</label><input id="st-address" name="address" value="${esc(s.address)}" maxlength="140"></div><div class="field full"><button class="btn primary">Salvar dados da loja</button></div></form></section><section class="card plan-card"><div class="section-head"><div><h2>Seu plano: ${esc(use.plan.name)}</h2><p>A partir de ${money(use.plan.price)}/mês. O valor depende dos canais integrados — cada marketplace tem custo de integração.</p></div>${badge("Ativo")}</div>${usageBar("Canais de venda", use.channels, use.plan.maxChannels)}${usageBar("Marketplaces e apps", use.marketplaces, use.plan.maxMarketplaces)}${usageBar("Lojas físicas", W.shopsOf(state).length, use.plan.maxShops)}<p class="caption">Precisa de mais canais? Seu consultor ajusta o plano e as integrações com você.</p><button class="btn wide" data-action="consultant">💬 Falar com meu consultor</button></section></div>` +
    shopsConfig() +
    `<section class="card"><div class="section-head"><div><h2>Onde fica o seu estoque?</h2><p><b>Prateleira (loja)</b> é o que está exposto para o cliente pegar. <b>Depósito</b> é o que fica guardado — nos fundos da loja ou em outro endereço. A WedTech soma os dois para vender em todos os canais e decide de onde sai cada pedido: retiradas saem da prateleira, entregas saem do depósito.</p></div></div><label class="switch-row"><input type="checkbox" id="has-deposito" ${s.hasDeposito ? "checked" : ""}><span>📦 Minha loja tem um <b>depósito separado</b> (estoque guardado fora da prateleira)</span></label>${
      s.hasDeposito
        ? `<div class="loc-cards"><div class="loc-card"><span>🏪</span><div><b>Prateleira (loja)</b><small>${esc(s.address)}</small></div>${badge(m.unitsLoja + " un.")}</div><div class="loc-card"><span>📦</span><div><b>Depósito</b><small>Estoque guardado para repor e enviar</small></div>${badge(m.unitsDeposito + " un.")}</div></div>`
        : `<div class="validation ok">✓ Tudo fica na loja (${m.unitsLoja} un.). Ideal para lojas pequenas: menos coisa para controlar.</div>`
    }</section>` +
    `<section class="card"><div class="section-head"><div><h2>Tipo de loja</h2><p>A plataforma é a mesma para qualquer ramo. Trocar o tipo recomeça a demonstração com produtos de exemplo.</p></div></div><div class="type-list">${Object.values(W.storeTypes)
      .map(
        (t) =>
          `<button type="button" class="type-option ${t.id === state.tipo ? "active" : ""}" data-change-type="${t.id}"><span>${t.emoji}</span><div><b>${esc(t.label)}</b><small>${esc(t.storeName)}</small></div>${t.id === state.tipo ? badge("Atual") : ""}</button>`,
      )
      .join("")}</div><p class="caption">Tipo atual: ${esc(current?.label || "")}.</p></section>` +
    `<section class="card"><div class="section-head"><div><h2>Painel clássico</h2><p>Abra o painel antigo para consultar os dados que ainda não foram migrados. Ele mantém armazenamento separado do painel modular.</p></div><a class="btn" href="../painel.php">Abrir painel clássico</a></div></section>`
  );
}

// Lojas físicas (filiais): todas vendem do mesmo estoque online
function shopsConfig() {
  const shops = W.shopsOf(state);
  const plan = W.planUsage(state).plan;
  const full = shops.length >= plan.maxShops;
  return `<section class="card"><div class="section-head"><div><h2>🏪 Suas lojas</h2><p>Cada loja tem a sua prateleira, mas tudo soma num estoque só para o site, o WhatsApp e os marketplaces. O cliente escolhe em qual loja quer retirar.</p></div>${badge(shops.length + " de " + plan.maxShops + " no plano " + plan.name, full ? "warn" : "neutral")}</div>${shops
    .map((sh) => `<div class="channel-row"><span>🏪</span><div><b>${esc(sh.name)}</b>${sh.main ? " " + badge("Principal", "neutral") : ""}<div class="muted">${esc(sh.address || "")}</div></div>${badge(state.products.reduce((a, p) => a + (p.stock[sh.id] || 0), 0) + " un.")}</div>`)
    .join("")}${
    full
      ? `<p class="caption">Para abrir mais lojas, fale com seu consultor: o plano Avançado inclui até 5.</p>`
      : `<form id="shop-form" class="form-grid compact"><div class="field"><label for="shop-name">Nome da nova loja</label><input id="shop-name" name="name" required maxlength="60" placeholder="Ex.: Loja Centro"></div><div class="field"><label for="shop-address">Endereço</label><input id="shop-address" name="address" maxlength="140" placeholder="Rua, número — bairro"></div><div class="field full"><button class="btn primary">+ Cadastrar loja</button></div></form>`
  }</section>`;
}
