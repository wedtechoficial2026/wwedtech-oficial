"use strict";
// Devoluções e trocas — pós-venda de todos os canais, como nas plataformas reais:
// a devolução começa com uma solicitação (do marketplace ou da loja) e passa por
// análise → produto a caminho → conferência → reembolso. Regras no núcleo (requestReturn...).

const returnTabs = [
  ["analisar", "Para analisar", (r) => r.status === "aberta"],
  ["aguardando", "Aguardando o produto", (r) => r.status === "aprovada"],
  ["conferir", "Para conferir", (r) => r.status === "recebida"],
  ["disputa", "Em disputa", (r) => r.status === "contestada"],
  ["encerradas", "Encerradas", (r) => r.status === "concluida" || r.status === "recusada"],
];
const returnTone = { aberta: "warn", aprovada: "neutral", recebida: "warn", contestada: "danger", concluida: "", recusada: "neutral" };
const originLabel = { marketplace: "Marketplace", online: "Site / WhatsApp", loja: "Loja física" };

function devolucoesPage() {
  const all = state.returnRequests || [];
  const tab = returnTabs.find((t) => t[0] === ui.returnsTab) || returnTabs[0];
  const list = all.filter(tab[2]);
  const hasMarketplace = state.connected.some((c) => W.channelById(c)?.kind === "marketplace");
  return (
    heading(
      "Devoluções e trocas",
      "Toda devolução começa com uma solicitação: do cliente no marketplace ou registrada pela loja. Depois vem a análise, a chegada do produto, a conferência e o reembolso.",
      hasMarketplace ? `<button class="btn" data-action="simulate-return" ${ui.busy ? "disabled" : ""}>+ Simular devolução de marketplace</button>` : "",
    ) +
    returnLookupCard() +
    `<div class="tabs" role="tablist">${returnTabs
      .map(([id, label, fn]) => {
        const n = all.filter(fn).length;
        return `<button type="button" role="tab" class="tab ${tab[0] === id ? "active" : ""}" aria-selected="${tab[0] === id}" data-returns-tab="${id}">${label}${id !== "encerradas" && n ? ` <span class="tab-count">${n}</span>` : ""}</button>`;
      })
      .join("")}</div><section class="card table-card">${returnsTable(list, tab[0])}</section>`
  );
}

function returnsTable(list, tab) {
  if (!list.length)
    return emptyBox(
      {
        analisar: "Nenhuma solicitação esperando você. Quando um cliente pedir devolução pela loja, site ou WhatsApp, ela aparece aqui.",
        aguardando: "Nenhum produto a caminho.",
        conferir: "Nenhum produto para conferir.",
        disputa: "Nenhuma disputa aberta.",
        encerradas: "Nenhuma devolução encerrada ainda.",
      }[tab],
    );
  return `<div class="table-wrap"><table><thead><tr><th>Solicitação</th><th>Canal</th><th>Cliente</th><th>Motivo</th><th>Valor</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>${list
    .map(
      (r) =>
        `<tr><td><b>${r.id}</b><small>pedido ${esc(r.orderId)} · ${esc(ago(r.createdAt))}</small></td><td>${logo(r.channel, "sm")}</td><td>${esc(r.customer)}</td><td>${esc(W.returnReasons[r.reasonType])}</td><td>${money(r.value)}</td><td>${badge(r.window.within ? "no prazo" : "fora do prazo", r.window.within ? "" : "warn")}</td><td>${badge(W.returnStatus[r.status], returnTone[r.status])}</td><td><button class="btn small ${["aberta", "recebida"].includes(r.status) ? "primary" : ""}" data-return="${r.id}">${r.status === "aberta" ? "Analisar" : r.status === "recebida" ? "Conferir" : "Ver"}</button></td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

// Cliente chegou na loja (ou mandou mensagem) pedindo devolução: acha o pedido pelo número, nota ou código
function returnLookupCard() {
  return `<section class="card"><div class="section-head"><div><h2>↩️ Registrar uma solicitação</h2><p>O cliente pediu devolução ou troca na loja, pelo site ou pelo WhatsApp? Busque a compra. Devoluções de marketplace chegam sozinhas: o cliente abre no próprio marketplace.</p></div></div><form id="return-lookup-form" class="scan-form"><div class="field grow"><label for="return-code">Número do pedido, da nota fiscal ou código de retirada</label><input id="return-code" name="code" required placeholder="Ex.: PED-1002, NF-1003 ou RET-123456" autocomplete="off"></div><button class="btn primary">Buscar compra</button></form>${
    ui.returnFeedback ? `<div class="validation">⚠ ${esc(ui.returnFeedback)}</div>` : ""
  }</section>`;
}

// Gaveta: nova solicitação a partir de um pedido entregue
function newReturnDrawer(orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return "";
  const ch = W.channelById(o.channel);
  const origin = W.returnOrigin(o);
  const head = `<h1 id="drawer-title">Devolução do ${esc(o.id)}</h1><p class="muted drawer-sub">${logo(o.channel, "xs")} ${esc(ch.name)} · ${esc(o.customer.name)} · comprado ${esc(ago(o.ts))}</p>`;
  if (origin === "marketplace")
    return drawerShell(
      "NOVA DEVOLUÇÃO",
      "Fechar",
      head +
        `<div class="validation">Esta compra foi feita no ${esc(ch.name)}. A devolução precisa ser aberta pelo cliente no próprio ${esc(ch.name)}: o marketplace analisa, envia o código de postagem e reembolsa o comprador. Ela aparece aqui sozinha.</div>`,
    );
  const rows = o.items.map((it, i) => ({ it, i, left: it.qty - W.committedReturnQty(state, o, i) })).filter((x) => x.left > 0);
  if (!rows.length) return drawerShell("NOVA DEVOLUÇÃO", "Fechar", head + `<p class="caption">Todos os itens deste pedido já foram devolvidos ou estão em uma solicitação aberta.</p>`);
  const windows = ["arrependimento", "defeito"].map((t) => W.returnWindow(state, o, t));
  return drawerShell(
    "NOVA DEVOLUÇÃO",
    "Fechar",
    head +
      `<div class="return-rules">${windows
        .map((w) => `<div>${badge(w.within ? "no prazo" : "fora do prazo", w.within ? "" : "warn")}<span>${esc(w.rule)} · ${plural(w.days, "dia", "dias")} desde a compra</span></div>`)
        .join("")}</div><form id="return-request-form" class="return-form" data-order="${o.id}"><h3 class="block-title">O que o cliente quer devolver?</h3><div class="return-items">${rows
        .map(
          ({ it, i, left }) =>
            `<label class="return-item"><span>${esc(it.emoji || "")} ${esc(it.name)}<small>${money(it.price)} · até ${left} un.</small></span><input type="number" name="qty-${i}" min="0" max="${left}" value="${i === rows[0].i ? 1 : 0}" aria-label="Quantidade devolvida de ${esc(it.name)}"></label>`,
        )
        .join("")}</div><div class="form-grid compact"><div class="field"><label for="rr-reason">Motivo</label><select id="rr-reason" name="reasonType">${Object.entries(W.returnReasons)
        .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`)
        .join("")}</select></div>${
        origin === "online"
          ? `<div class="field"><label for="rr-where">Como o cliente pediu?</label><select id="rr-where" name="inPerson"><option value="">Pelo ${esc(ch.name)} (vai enviar ou trazer)</option><option value="1">Veio à loja com o produto</option></select></div>`
          : ""
      }<div class="field full"><label for="rr-note">Observação (opcional)</label><input id="rr-note" name="note" maxlength="200" placeholder="Ex.: caixa aberta, quer trocar pelo tamanho M"></div></div><button class="btn primary wide" ${ui.busy ? "disabled" : ""}>Registrar solicitação</button><p class="caption">Depois de registrar, você analisa, confere o produto e escolhe o reembolso.</p></form>`,
  );
}

// Gaveta: uma solicitação, com linha do tempo e a ação da etapa atual
function returnRequestDrawer(id) {
  const r = (state.returnRequests || []).find((x) => x.id === id);
  if (!r) return "";
  const ch = W.channelById(r.channel);
  const marketplace = r.origin === "marketplace";
  const shops = W.shopsOf(state);
  const storeField =
    shops.length > 1
      ? `<div class="field"><label for="rs-store">Recebido na</label><select id="rs-store" name="store">${shops.map((sh) => `<option value="${sh.id}">${esc(sh.name)}</option>`).join("")}</select></div>`
      : "";
  let action = "";
  if (r.status === "aberta") {
    const mustAccept = (r.origin === "online" && r.reasonType === "arrependimento" && r.window.within) || (["defeito", "errado"].includes(r.reasonType) && r.window.within);
    action = `<h3 class="block-title">Sua análise</h3>${
      mustAccept
        ? `<div class="validation">⚖️ ${esc(r.window.rule)}. Dentro do prazo, a loja não pode recusar.</div>`
        : `<div class="validation">${esc(r.window.rule)}. ${r.window.within ? "Está dentro do prazo." : "Está fora do prazo: você pode recusar explicando o motivo."}</div>`
    }<div class="field full"><label for="return-note">Resposta ao cliente ${mustAccept ? "(opcional)" : "(obrigatória para recusar)"}</label><input id="return-note" maxlength="160" placeholder="Ex.: produto usado, fora da política de troca"></div><div class="actions wrap"><button class="btn primary" data-return-approve="${r.id}" ${ui.busy ? "disabled" : ""}>✓ Aprovar${r.origin === "loja" || r.inPerson ? " e receber o produto" : ""}</button>${
      mustAccept ? "" : `<button class="btn" data-return-reject="${r.id}" ${ui.busy ? "disabled" : ""}>Recusar</button>`
    }</div>`;
  } else if (r.status === "aprovada") {
    action = `<h3 class="block-title">Aguardando o produto</h3>${
      r.reverseCode
        ? `<div class="validation">📦 O cliente posta o produto com o código <b>${esc(r.reverseCode)}</b> (logística reversa do ${esc(ch.name)}). Quando o pacote chegar, confirme abaixo.</div>`
        : `<div class="validation">O cliente vai enviar ou trazer o produto. Quando chegar, confirme abaixo.</div>`
    }<button class="btn primary wide" data-return-receive="${r.id}" ${ui.busy ? "disabled" : ""}>📥 O produto chegou</button>`;
  } else if (r.status === "recebida") {
    action = `<h3 class="block-title">Conferir o produto</h3><form id="return-resolve-form" class="return-form" data-return="${r.id}"><div class="form-grid compact"><div class="field"><label for="rs-condition">O produto está…</label><select id="rs-condition" name="condition"><option value="venda">Em bom estado (volta para a venda)</option><option value="defeito">Com defeito ou danificado (avaria)</option></select></div>${
      marketplace
        ? ""
        : `<div class="field"><label for="rs-refund">Reembolso</label><select id="rs-refund" name="refund"><option value="vale">Vale-troca (troca por outro produto)</option><option value="estorno">Devolver o dinheiro (estorno)</option></select></div>`
    }${storeField}</div><button class="btn primary wide" ${ui.busy ? "disabled" : ""}>Concluir devolução</button><p class="caption">${
      marketplace
        ? "Quem reembolsa o comprador é o " + esc(ch.name) + ": o valor da venda é descontado do seu próximo repasse."
        : "Estorno de venda paga em dinheiro sai da gaveta do caixa aberto. Vale-troca pode ser usado na loja, no site e no WhatsApp."
    }</p></form>${
      marketplace
        ? `<form id="return-contest-form" class="scan-form" data-return="${r.id}"><div class="field grow"><label for="rc-note">Produto voltou danificado ou diferente?</label><input id="rc-note" name="note" maxlength="160" placeholder="Descreva o problema para o marketplace analisar"></div><button class="btn">Contestar no ${esc(ch.name)}</button></form>`
        : ""
    }`;
  } else if (r.status === "contestada") {
    action = `<h3 class="block-title">Em disputa</h3><div class="validation">O ${esc(ch.name)} está analisando as provas das duas partes. Nesta demonstração, registre a decisão quando ela chegar:</div><div class="actions wrap"><button class="btn primary" data-dispute="${r.id}:loja" ${ui.busy ? "disabled" : ""}>A loja ganhou</button><button class="btn" data-dispute="${r.id}:cliente" ${ui.busy ? "disabled" : ""}>O cliente ganhou</button></div>`;
  } else {
    action = `<div class="validation ${r.status === "concluida" ? "ok" : ""}">${r.status === "concluida" ? "✓ " + esc(r.resolution || "Concluída") : "Recusada."}</div>`;
  }
  return drawerShell(
    "DEVOLUÇÃO · " + esc(originLabel[r.origin].toUpperCase()),
    "Fechar devolução",
    `<h1 id="drawer-title">${esc(r.id)}</h1><p class="muted drawer-sub">${logo(r.channel, "xs")} ${esc(ch.name)} · pedido <button class="link" data-order="${esc(r.orderId)}">${esc(r.orderId)}</button> · ${esc(r.customer)}</p><div class="order-meta">${badge(W.returnStatus[r.status], returnTone[r.status])}<span><b>${esc(W.returnReasons[r.reasonType])}</b>${r.note ? "<br>“" + esc(r.note) + "”" : ""}<br>${esc(r.window.rule)} · ${badge(r.window.within ? "no prazo" : "fora do prazo", r.window.within ? "" : "warn")}</span></div><h3 class="block-title">Itens</h3>${r.lines
      .map((l) => `<div class="channel-row"><span>↩️</span><div>${esc(l.name)}<div class="muted">Qtd. ${l.qty} · ${money(l.price)} cada</div></div></div>`)
      .join("")}<div class="order-total"><span>Valor</span><b>${money(r.value)}</b></div>${action}<h3 class="block-title">Linha do tempo</h3><ol class="return-timeline">${r.history
      .map((h) => `<li><b>${esc(W.returnStatus[h.status])}</b><span>${esc(h.text)}</span><small>${esc(ago(h.ts))}</small></li>`)
      .join("")}</ol>`,
  );
}

// Na ficha do pedido: só o resumo. Registrar devolução é pela tela Devoluções.
function returnSummaryBlock(o) {
  const requests = (state.returnRequests || []).filter((r) => r.orderId === o.id);
  const list = requests
    .map((r) => `<button type="button" class="channel-row row-button" data-return="${r.id}"><span>↩️</span><div>${r.id} · ${esc(W.returnReasons[r.reasonType])}<div class="muted">${money(r.value)} · ${esc(ago(r.createdAt))}</div></div>${badge(W.returnStatus[r.status], returnTone[r.status])}</button>`)
    .join("");
  // Devoluções já executadas que não vieram de uma solicitação (registradas antes do fluxo atual)
  const fromRequests = new Set(requests.map((r) => r.returnId).filter(Boolean));
  const legacy = (o.returns || [])
    .filter((d) => !fromRequests.has(d.id))
    .map(
      (d) =>
        `<div class="channel-row"><span>↩️</span><div>${d.lines.map((l) => esc(l.name) + " × " + l.qty).join(", ")}<div class="muted">${esc(d.reason)} · ${d.lines.some((l) => l.back) ? "voltou para a venda" : "avaria"} · ${esc(ago(d.ts))}</div></div>${badge(d.creditCode ? "Vale " + d.creditCode + " · " + money(d.value) : "Estorno " + money(d.value), "neutral")}</div>`,
    )
    .join("");
  const origin = W.returnOrigin(o);
  const hint =
    origin === "marketplace"
      ? `Se o cliente quiser devolver, ele abre a solicitação no ${esc(W.channelById(o.channel).name)} e ela aparece em Devoluções.`
      : `Cliente quer devolver ou trocar? <button class="link" data-new-return="${o.id}">Registrar solicitação</button>.`;
  return `<h3 class="block-title">↩️ Devoluções</h3>${list}${legacy}<p class="caption">${hint}</p>`;
}
