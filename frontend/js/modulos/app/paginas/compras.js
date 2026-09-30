"use strict";
// Compras e fornecedores — a IA prepara o pedido quando o produto chega ao
// estoque mínimo; o lojista só confere e confirma. O prazo de entrega de cada
// fornecedor decide quando os anúncios dos marketplaces são travados.

const supplierName = (id) => state.suppliers.find((f) => f.id === id)?.name || "Fornecedor";
const dateLabel = (ts) => new Date(ts).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

function comprasPage() {
  const awaiting = state.purchaseOrders.filter((po) => po.status === "aguardando");
  const sent = state.purchaseOrders.filter((po) => po.status === "enviado");
  const received = state.purchaseOrders.filter((po) => po.status === "recebido").slice(0, 4);
  return (
    heading(
      "Compras e fornecedores",
      "A IA prepara o pedido quando o produto chega ao mínimo. Você só confere e confirma.",
      `<button class="btn primary" data-supplier="novo">+ Novo fornecedor</button>`,
    ) +
    `<section class="card"><div class="section-head"><div><h2>🧾 Preparados pela IA · aguardando sua confirmação</h2><p>Confira a quantidade, ajuste se quiser e envie para o fornecedor.</p></div>${badge(String(awaiting.length), awaiting.length ? "warn" : "neutral")}</div>${
      awaiting.length
        ? awaiting
            .map((po) => {
              const sup = state.suppliers.find((f) => f.id === po.supplierId);
              const total = po.items.reduce((a, it) => a + it.qty * it.cost, 0);
              return `<div class="po-card"><div class="po-head"><div><b>${po.id}</b> · ${esc(sup?.name || "Fornecedor")}<small>Entrega em ${plural(sup?.leadTimeDays || 0, "dia", "dias")} · pedido mínimo ${money(sup?.minOrder || 0)}</small></div>${badge("✧ Sugerido pela IA", "neutral")}</div><p class="po-reason">${esc(po.reason)}</p>${po.items
                .map(
                  (it) =>
                    `<div class="po-item">${productThumb(productById(it.productId) || {}, "sm")}<span>${esc(it.name)}<small>custo ${money(it.cost)} / un.</small></span><label>Qtd. <input type="number" min="1" max="9999" value="${it.qty}" data-po-qty="${po.id}:${it.productId}" aria-label="Quantidade de ${esc(it.name)}"></label></div>`,
                )
                .join("")}<div class="po-foot"><span>Total estimado <b>${money(total)}</b></span><div class="actions"><button class="btn" data-discard-po="${po.id}" ${ui.busy ? "disabled" : ""}>Descartar</button><button class="btn primary" data-confirm-po="${po.id}" ${ui.busy ? "disabled" : ""}>✓ Confirmar e enviar</button></div></div></div>`;
            })
            .join("")
        : emptyBox("Nenhum pedido esperando você. Quando um produto chegar ao estoque mínimo, a IA prepara o pedido aqui.")
    }</section>` +
    entradaCard() +
    `<section class="card table-card"><div class="section-head pad"><div><h2>🚚 A caminho</h2><p>Quando a mercadoria chegar, bipe a entrada: o estoque soma e os anúncios pausados voltam sozinhos.</p></div></div>${
      sent.length
        ? `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Fornecedor</th><th>Itens</th><th>Previsão</th><th>Recebido</th><th></th></tr></thead><tbody>${sent
            .map((po) => {
              const qty = po.items.reduce((a, i) => a + i.qty, 0);
              const got = po.items.reduce((a, i) => a + i.received, 0);
              return `<tr><td><b>${po.id}</b><small>${esc(ago(po.sentTs || po.ts))}</small></td><td>${esc(supplierName(po.supplierId))}</td><td>${po.items.map((i) => esc(i.name) + " × " + i.qty).join("<br>")}</td><td>${esc(dateLabel(po.etaTs))}</td><td>${got}/${qty}</td><td><div class="actions"><button class="btn small primary" data-receive-scan="${po.id}">📡 Receber (bipar)</button><button class="btn small" data-receive-all="${po.id}" ${ui.busy ? "disabled" : ""}>Receber tudo</button></div></td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : emptyBox("Nenhum pedido a caminho.")
    }${received.length ? `<p class="caption pad">Recebidos recentemente: ${received.map((po) => po.id).join(", ")}.</p>` : ""}</section>` +
    `<section class="card table-card"><div class="section-head pad"><div><h2>Fornecedores</h2><p>Abra a ficha para ver e editar tudo: contato, endereço, condições e os produtos que cada um vende. O <b>prazo de entrega</b> é usado pela IA para decidir quando travar os anúncios.</p></div></div><div class="table-wrap"><table><thead><tr><th>Fornecedor</th><th>Contato</th><th>Prazo de entrega</th><th>Pedido mínimo</th><th>Produtos</th><th></th></tr></thead><tbody>${
      state.suppliers
        .map((f) => {
          const products = state.products.filter((p) => p.supplierId === f.id);
          return `<tr><td><b>${esc(f.name)}</b><small>${esc(f.cnpj)}</small></td><td class="muted">${esc(f.contactName || f.contact || "—")}<small>${esc(f.phone || f.whatsapp || f.contact || "")}</small></td><td>${plural(f.leadTimeDays, "dia", "dias")}</td><td>${money(f.minOrder || 0)}</td><td>${products.length}<small>${esc(products.slice(0, 2).map((p) => p.name).join(", "))}${products.length > 2 ? "…" : ""}</small></td><td><button class="btn small" data-supplier="${f.id}">Abrir ficha</button></td></tr>`;
        })
        .join("") || `<tr><td colspan="6">${emptyBox("Nenhum fornecedor cadastrado.")}</td></tr>`
    }</tbody></table></div></section>` +
    aiStrip(
      "Como a IA decide",
      "Produto chegou ao mínimo → a IA calcula a quantidade (vendas por dia × prazo do fornecedor, respeitando o pedido mínimo) e prepara o pedido. Se o que sobrou acaba antes da entrega, ela pausa os anúncios nos marketplaces e guarda o restante para a loja e o site.",
      "automacoes",
      "Ver automações →",
    )
  );
}

// Gaveta de recebimento: bipa os produtos que chegaram do fornecedor
function receiveDrawer(poId) {
  const po = state.purchaseOrders.find((x) => x.id === poId);
  if (!po) return "";
  return drawerShell(
    "RECEBER MERCADORIA",
    "Fechar recebimento",
    `<h1 id="drawer-title">${esc(po.id)}</h1><p class="muted drawer-sub">${esc(supplierName(po.supplierId))} · ${W.poStatus[po.status]}</p>${po.items
      .map((it) => {
        const pct = Math.round((it.received / it.qty) * 100);
        return `<div class="channel-row">${productThumb(productById(it.productId) || {}, "sm")}<div>${esc(it.name)}<div class="muted">${esc(it.sku)} · recebido ${it.received} de ${it.qty}</div><div class="shelf-bar"><span style="width:${pct}%"></span></div></div>${badge(it.received >= it.qty ? "Completo" : "Pendente", it.received >= it.qty ? "" : "neutral")}</div>`;
      })
      .join("")}${
      po.status === "enviado"
        ? `<form id="receber-form" class="scan-form"><div class="field grow"><label for="receber-code">Bipe o produto que chegou</label><input id="receber-code" name="code" autocomplete="off" required placeholder="Código de barras ou SKU"></div><div class="field narrow"><label for="receber-qty">Qtd.</label><input id="receber-qty" name="qty" type="number" min="1" max="9999" placeholder="tudo"></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Dar entrada</button>${cameraButton("receber", "📷 Câmera")}</form>${cameraBox("receber")}${
            ui.receiveFeedback ? `<div class="validation">⚠ ${esc(ui.receiveFeedback)}</div>` : ""
          }<p class="caption">Deixe a quantidade em branco para dar entrada em tudo que falta daquele produto. A mercadoria vai para o depósito.</p>`
        : `<div class="validation ok">✓ Pedido recebido. Estoque reposto e anúncios reativados pela automação.</div>`
    }`,
  );
}

// Recebimento por bipagem: soma no estoque e confere o pedido ao fornecedor a caminho
function entradaCard() {
  const dep = state.store.hasDeposito;
  const shops = W.shopsOf(state);
  const multi = shops.length > 1;
  return `<section class="card"><div class="section-head"><div><h2>📥 Receber mercadoria</h2><p>Chegou mercadoria do fornecedor? Bipe cada produto: o estoque soma e o pedido a caminho é conferido sozinho.</p></div>${badge("🟢 Leitor conectado")}</div><form id="entrada-form" class="scan-form"><div class="field grow"><label for="entrada-code">Código de barras ou SKU</label><input id="entrada-code" name="code" placeholder="Bipe ou digite o código" autocomplete="off" required></div><div class="field narrow"><label for="entrada-qty">Qtd.</label><input id="entrada-qty" name="qty" type="number" min="1" max="9999" value="1"></div>${dep ? `<div class="field narrow"><label for="entrada-local">Guardar em</label><select id="entrada-local" name="local"><option value="deposito" ${ui.entradaLocal === "deposito" ? "selected" : ""}>Depósito</option>${shops
    .map((sh) => `<option value="${sh.id}" ${ui.entradaLocal === sh.id ? "selected" : ""}>${esc(multi ? sh.name : "Prateleira")}</option>`)
    .join("")}</select></div>` : ""}<button class="btn primary" ${ui.busy ? "disabled" : ""}>Dar entrada</button>${cameraButton("entrada")}</form>${cameraBox("entrada")}${
      ui.scanFeedback ? `<div class="validation ${ui.scanFeedback.ok ? "ok" : ""}">${ui.scanFeedback.ok ? "✓ " : "⚠ "}${esc(ui.scanFeedback.text)}</div>` : ""
    }</section>`;
}

// Reposição de um produto: mostra o pedido em andamento ou oferece pedir ao fornecedor
function restockAction(p) {
  const po = state.purchaseOrders.find((x) => (x.status === "aguardando" || x.status === "enviado") && x.items.some((it) => it.productId === p.id));
  if (po) return `<button class="btn small" data-nav="compras">${po.status === "enviado" ? "🚚 " + po.id + " a caminho" : "🧾 " + po.id + " para confirmar"}</button>`;
  if (!p.supplierId || !state.suppliers.some((f) => f.id === p.supplierId)) return `<button class="btn small" data-nav="compras">Definir fornecedor</button>`;
  return `<button class="btn small primary" data-order-supplier="${p.id}" ${ui.busy ? "disabled" : ""}>Pedir ao fornecedor</button>`;
}

// Ficha do fornecedor ("novo" para cadastrar): empresa, contato, condições, produtos e observações
function supplierDrawer(id) {
  const isNew = id === "novo";
  const f = isNew ? { leadTimeDays: 5, minOrder: 0 } : state.suppliers.find((x) => x.id === id);
  if (!f) return "";
  const val = (key) => esc(f[key] ?? "");
  const field = (key, label, attrs = "", cls = "") =>
    `<div class="field ${cls}"><label for="sup-${key}">${label}</label><input id="sup-${key}" name="${key}" value="${val(key)}" ${attrs}></div>`;
  const low = isNew ? [] : state.products.filter((p) => p.supplierId === f.id && W.stockOf(state, p).disponivel <= p.minStock);
  const open = isNew ? [] : state.purchaseOrders.filter((po) => po.supplierId === f.id && (po.status === "aguardando" || po.status === "enviado"));
  return drawerShell(
    isNew ? "NOVO FORNECEDOR" : "FICHA DO FORNECEDOR",
    "Fechar ficha",
    `<h1 id="drawer-title">${isNew ? "Novo fornecedor" : esc(f.name)}</h1><p class="muted drawer-sub">${isNew ? "Preencha os dados e marque os produtos que ele vende." : esc(f.cnpj)}</p>${
      open.length
        ? `<div class="validation">${open.map((po) => `${po.id} · ${po.status === "enviado" ? "a caminho" : "aguardando sua confirmação"}`).join("<br>")} <button class="link" data-nav="compras">Ver pedidos →</button></div>`
        : ""
    }${
      low.length
        ? `<h3 class="block-title">Precisa repor</h3>${low.map((p) => `<div class="channel-row">${productThumb(p, "sm")}<div>${esc(p.name)}<div class="muted">${W.stockOf(state, p).disponivel} disponíveis · mínimo ${p.minStock}</div></div>${restockAction(p)}</div>`).join("")}`
        : ""
    }<form id="supplier-form" class="form-grid compact supplier-form" data-id="${isNew ? "novo" : f.id}"><h3 class="block-title full">Empresa</h3>${field("name", "Nome ou razão social", 'required maxlength="80" placeholder="Ex.: Distribuidora Beta"', "full")}${field("cnpj", "CNPJ", 'required maxlength="20" placeholder="00.000.000/0000-00"')}${field("address", "Endereço", 'maxlength="160" placeholder="Rua, número, bairro, cidade"', "full")}<h3 class="block-title full">Contato</h3>${field("contactName", "Responsável", 'maxlength="80" placeholder="Com quem você fala"')}${field("contact", "E-mail", 'type="email" maxlength="120"')}${field("phone", "Telefone", 'inputmode="tel" maxlength="20"')}${field("whatsapp", "WhatsApp", 'inputmode="tel" maxlength="20"')}<h3 class="block-title full">Condições</h3>${field("leadTimeDays", "Prazo de entrega (dias)", 'type="number" min="1" max="60" required')}${field("minOrder", "Pedido mínimo (R$)", 'type="number" min="0" step="0.01"')}${field("paymentTerms", "Condição de pagamento", 'maxlength="80" placeholder="Ex.: boleto 28 dias"', "full")}<h3 class="block-title full">Produtos que vende</h3><div class="field full supplier-products">${state.products
      .map((p) => {
        const other = p.supplierId && p.supplierId !== f.id ? state.suppliers.find((x) => x.id === p.supplierId) : null;
        return `<label class="check-row"><input type="checkbox" name="product" value="${p.id}" ${!isNew && p.supplierId === f.id ? "checked" : ""}><span>${esc(p.name)}<small>${esc(p.sku)}${other ? " · hoje com " + esc(other.name) : ""}</small></span></label>`;
      })
      .join("")}</div><div class="field full"><label for="sup-notes">Observações</label><textarea id="sup-notes" name="notes" maxlength="400" rows="3" placeholder="Ex.: entrega só às terças; pedir com 2 dias de antecedência">${val("notes")}</textarea></div><div class="field full"><button class="btn primary wide" ${ui.busy ? "disabled" : ""}>${isNew ? "Cadastrar fornecedor" : "Salvar ficha"}</button></div></form><p class="caption">Marcar um produto aqui troca o fornecedor dele: os próximos pedidos de reposição saem para este fornecedor.</p>`,
  );
}
