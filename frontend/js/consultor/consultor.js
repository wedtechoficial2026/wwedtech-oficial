"use strict";
// Área do consultor WedTech: contatos do site, cotações, lojas (cadastro, contrato, liberações,
// modo suporte), chamados de suporte, tabela de preços, consultores (administrador) e registro de ações.
// Todos os dados vêm de api/consultor.php, que confere o perfil a cada chamada.
// Tempo real: a cada 3 segundos a tela pergunta ao servidor o que mudou (?acao=pulso) e só
// recarrega as listas afetadas; novidades (mensagem de lojista, contato, cotação respondida)
// aparecem numa janela flutuante com som.

(() => {
  const me = window.CONSULTOR || { nome: "", papel: "consultor" };
  const isAdmin = me.papel === "admin";
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  const badge = (text, tone = "") => `<span class="badge ${tone}">${esc(text)}</span>`;
  const empty = (text) => `<div class="empty">${esc(text)}</div>`;
  const heading = (title, sub, actions = "") => `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`;
  // Datas do SQLite vêm em UTC ("AAAA-MM-DD HH:MM:SS")
  const sqlDate = (v) => (v ? new Date(String(v).replace(" ", "T") + (String(v).length > 10 ? "Z" : "T12:00:00")) : null);
  const when = (v) => (v ? sqlDate(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
  const day = (v) => (v ? sqlDate(v).toLocaleDateString("pt-BR") : "—");
  // O painel do lojista registra o acesso a cada minuto: visto há menos de 3 minutos = online
  const onlineNow = (v) => !!v && Date.now() - sqlDate(v).getTime() < 3 * 60 * 1000;
  const lastSeen = (v) => (onlineNow(v) ? `<span class="online-now">online agora</span>` : v ? "último acesso " + when(v) : "nunca entrou");
  const sum = (lines) => Math.round(lines.reduce((t, [, v]) => t + Number(v), 0) * 100) / 100;

  const pages = {
    inicio: "Visão geral",
    contatos: "Contatos do site",
    cotacoes: "Cotações",
    lojas: "Lojas",
    "nova-loja": "Cadastrar loja",
    chamados: "Suporte",
    precos: "Tabela de preços",
    consultores: "Consultores",
    historico: "Registro de ações",
  };
  const detailPages = { loja: "Loja", chamado: "Chamado", cotacao: "Cotação" };
  const nav = [
    ["Atendimento", ["inicio", "contatos", "cotacoes", "lojas", "nova-loja", "chamados"]],
    ["Gestão", ["precos", ...(isAdmin ? ["consultores"] : []), "historico"]],
  ];
  const storeTone = { teste: "neutral", ativa: "", suspensa: "warn", cancelada: "danger" };
  const healthLabel = { boa: ["Vendendo", ""], atencao: ["Atenção", "warn"], parada: ["Parada", "danger"] };
  const ticketTone = { aberto: "warn", em_atendimento: "neutral", resolvido: "" };
  const quoteTone = { rascunho: "neutral", aprovacao: "warn", enviada: "", aceita: "", recusada: "danger", vencida: "danger" };
  const limitInfo = [
    ["maxChannels", "Canais de venda", "loja física, site, WhatsApp e marketplaces somados"],
    ["maxMarketplaces", "Marketplaces e apps", "Mercado Livre, Shopee, Amazon, iFood…"],
    ["maxShops", "Lojas físicas", "cada uma com seu estoque e seu caixa"],
  ];

  const ui = {
    page: "inicio",
    id: null,
    options: null,
    data: {},
    meta: {},
    fields: {},
    busy: false,
    credential: null,
    leadTab: "novo",
    ticketTab: "aberto",
    quoteTab: "todas",
    storeFilter: "",
    storeQuery: "",
    editingLead: null,
    prefill: null,
    contract: null,
    quote: null,
    counts: {},
    sig: null,
    seen: null,
  };

  // ---------------------------------------------------------------------------
  // Comunicação com o servidor
  async function api(acao, { id, body } = {}) {
    const url = new URL("../api/consultor.php", location.href);
    url.searchParams.set("acao", acao);
    if (id) url.searchParams.set("id", id);
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) location.href = "../login.php";
    if (!response.ok || !result.ok) throw new Error(result.erro || "Não foi possível concluir.");
    return result.dados;
  }
  async function load(key, acao, id) {
    try {
      ui.data[key] = await api(acao, { id });
    } catch (err) {
      ui.data[key] = { erro: err.message };
    }
    render();
  }
  function need(key, acao, id) {
    ui.meta[key] = [acao, id];
    if (!(key in ui.data)) {
      ui.data[key] = null;
      load(key, acao, id);
    }
    return ui.data[key];
  }
  function invalidate(...keys) {
    for (const k of keys.length ? keys : Object.keys(ui.data)) delete ui.data[k];
  }
  // Recarrega em segundo plano: a tela continua com os dados atuais até a versão nova chegar
  async function refresh(keys) {
    const list = keys.filter((k) => ui.data[k] && !ui.data[k].erro && ui.meta[k]);
    if (!list.length) return;
    await Promise.all(
      list.map(async (k) => {
        try {
          ui.data[k] = await api(ui.meta[k][0], { id: ui.meta[k][1] });
        } catch {
          // Mantém o que já estava na tela; tenta de novo na próxima rodada
        }
      }),
    );
    render();
  }
  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 4200);
  }
  async function run(fn, success) {
    if (ui.busy) return;
    ui.busy = true;
    render();
    try {
      const result = await fn();
      if (success) toast(typeof success === "function" ? success(result) : success);
      ui.busy = false;
      render();
      return result;
    } catch (err) {
      toast(err.message);
      ui.busy = false;
      render();
      return null;
    }
  }
  const loading = () => `<section class="card">${empty("Carregando…")}</section>`;
  const failed = (d) => (d && d.erro ? `<div class="validation">⚠ ${esc(d.erro)}</div>` : "");
  const clearFields = (form) => {
    for (const el of form.elements) if (el.id) delete ui.fields[el.id];
  };

  // ---------------------------------------------------------------------------
  // Tempo real
  const affects = {
    contatos: ["contatos", "resumo"],
    chamados: ["chamados", "resumo", "chamado/", "loja/"],
    lojas: ["lojas", "resumo", "loja/"],
    cotacoes: ["cotacoes", "cotacao/"],
    historico: ["historico", "loja/"],
  };
  const currentDetail = () => (detailPages[ui.page] && ui.id ? `${ui.page}/${ui.id}` : "");
  const eventIcon = (e) => ({ chamado: "💬", contato: "📨" })[e.tipo] || (e.status === "aceita" ? "✅" : e.status === "recusada" ? "❌" : "⏳");
  const eventRoute = (e) => (e.tipo === "chamado" ? "chamado/" + e.id : e.tipo === "contato" ? "contatos" : "cotacao/" + e.id);
  function announce(events) {
    // Primeira consulta: só registra o que já existia (não toca som ao abrir a tela)
    if (!ui.seen) {
      ui.seen = new Set(events.map((e) => e.chave));
      return;
    }
    const fresh = events.filter((e) => !ui.seen.has(e.chave));
    fresh.forEach((e) => ui.seen.add(e.chave));
    // Mensagem do chamado que já está aberto na tela entra direto na conversa
    const shown = fresh.filter((e) => !(e.tipo === "chamado" && ui.page === "chamado" && ui.id === e.id && !document.hidden));
    if (!shown.length || !window.WedTechAlerts) return;
    shown
      .slice(0, 3)
      .reverse()
      .forEach((e) => WedTechAlerts.show({ icon: eventIcon(e), title: e.titulo, text: e.texto, onClick: () => go(eventRoute(e)) }));
    WedTechAlerts.chime();
  }
  let pulsing = false;
  async function pulse() {
    if (pulsing || document.hidden || !ui.options) return;
    pulsing = true;
    try {
      const p = await api("pulso");
      const countsChanged = JSON.stringify(p.contadores) !== JSON.stringify(ui.counts);
      ui.counts = p.contadores;
      const changed = ui.sig ? Object.keys(p.sig).filter((k) => p.sig[k] !== ui.sig[k]) : [];
      ui.sig = p.sig;
      announce(p.eventos);
      const keys = new Set();
      for (const group of changed) {
        for (const k of affects[group] || []) {
          if (!k.endsWith("/")) keys.add(k);
          else
            for (const key of Object.keys(ui.data)) {
              if (!key.startsWith(k)) continue;
              // Só a tela aberta recarrega; as outras buscam de novo quando forem abertas
              if (key === currentDetail()) keys.add(key);
              else delete ui.data[key];
            }
        }
      }
      if (keys.size) await refresh([...keys]);
      else if (countsChanged) render();
    } catch {
      // Sem conexão agora: tenta de novo na próxima rodada
    }
    pulsing = false;
  }

  // ---------------------------------------------------------------------------
  // Páginas
  function inicioPage() {
    const s = need("resumo", "resumo");
    const stores = need("lojas", "lojas");
    const tickets = need("chamados", "chamados");
    if (!s || s.erro) return heading("Visão geral", "") + (failed(s) || loading());
    const kpi = (nav, label, value, detail, attention) => `<button type="button" class="card big-kpi ${attention ? "attention" : ""}" data-go="${nav}"><small>${label}</small><strong>${value}</strong><span>${detail}</span></button>`;
    const attention = Array.isArray(stores) ? stores.filter((x) => x.saude !== "boa").slice(0, 6) : [];
    const open = Array.isArray(tickets) ? tickets.filter((t) => t.status !== "resolvido").slice(0, 6) : [];
    const online = Array.isArray(stores) ? stores.filter((x) => onlineNow(x.ultimo_acesso)).length : 0;
    return (
      heading(
        `Olá, ${esc(me.nome.split(" ")[0])}!`,
        isAdmin ? "Visão de todas as lojas e consultores da WedTech." : "Suas lojas, contatos e chamados num lugar só.",
        `<button class="btn" data-new-quote>+ Nova cotação</button><button class="btn primary" data-go="nova-loja">+ Cadastrar loja</button>`,
      ) +
      `<div class="big-kpis five">${[
        kpi("contatos", "Contatos novos", s.contatos_novos, "pedidos de contato pelo site", s.contatos_novos > 0),
        kpi("lojas", "Lojas ativas", s.ativas, `${plural(s.teste, "em teste", "em teste")} · ${online} online agora`, false),
        kpi("lojas:atencao", "Precisam de atenção", s.atencao, "sem venda, sem acesso ou com chamado", s.atencao > 0),
        kpi("chamados", "Chamados abertos", s.chamados_abertos, ui.counts.nao_lidas ? plural(ui.counts.nao_lidas, "mensagem nova", "mensagens novas") : "aguardando resposta ou em atendimento", s.chamados_abertos > 0),
        kpi("lojas", "Mensalidades", money(s.mensalidades), "por mês nas lojas ativas e em teste", false),
      ].join("")}</div>` +
      `<div class="chart-grid"><section class="card"><div class="section-head"><div><h2>Lojas que precisam de atenção</h2><p>Sem vendas na semana, sem acesso recente, com chamado aberto ou suspensas.</p></div></div>${
        stores === null ? empty("Carregando…") : attention.length ? attention.map(storeRow).join("") : empty("Todas as lojas estão vendendo. 🎉")
      }</section><section class="card"><div class="section-head"><div><h2>Chamados em aberto</h2></div><button class="link" data-go="chamados">Ver todos →</button></div>${
        tickets === null ? empty("Carregando…") : open.length ? open.map(ticketRow).join("") : empty("Nenhum chamado aberto.")
      }</section></div>`
    );
  }
  function ticketRow(t) {
    const unread = Number(t.nao_lidas);
    return `<button type="button" class="channel-row row-button" data-go="chamado/${t.id}"><span>🛟</span><div>#${t.id} · ${esc(t.assunto)}<div class="muted">${esc(t.loja)} · ${when(t.atualizado_em)}</div></div>${unread ? `<span class="unread-pill">${plural(unread, "nova", "novas")}</span>` : ""}${badge(ui.options?.situacoes_chamado?.[t.status] || t.status, ticketTone[t.status])}</button>`;
  }
  function storeRow(x) {
    const [label, tone] = healthLabel[x.saude] || ["", ""];
    return `<button type="button" class="channel-row row-button" data-go="loja/${x.id}"><span>🏪</span><div>${esc(x.nome)}<div class="muted">${esc(x.dono_email)} · ${lastSeen(x.ultimo_acesso)}${Number(x.chamados_abertos) ? " · " + plural(Number(x.chamados_abertos), "chamado", "chamados") : ""}</div></div>${badge(label, tone)}</button>`;
  }

  function contatosPage() {
    const leads = need("contatos", "contatos");
    const stages = ui.options?.etapas_contato || {};
    if (!Array.isArray(leads)) return heading("Contatos do site", "") + (failed(leads) || loading());
    const list = leads.filter((l) => l.status === ui.leadTab);
    return (
      heading("Contatos do site", "Quem pediu para falar com um consultor pela página inicial. Atenda, faça a cotação e, quando o cliente aceitar, cadastre a loja com um clique.") +
      `<div class="tabs" role="tablist">${Object.entries(stages)
        .map(([id, label]) => {
          const n = leads.filter((l) => l.status === id).length;
          return `<button type="button" role="tab" class="tab ${ui.leadTab === id ? "active" : ""}" aria-selected="${ui.leadTab === id}" data-lead-tab="${id}">${esc(label)}${n ? ` <span class="tab-count">${n}</span>` : ""}</button>`;
        })
        .join("")}</div><section class="card table-card">${
        list.length
          ? `<div class="table-wrap"><table><thead><tr><th>Contato</th><th>Loja</th><th>Como falar</th><th>Recebido</th><th>Anotações</th><th></th></tr></thead><tbody>${list.map(leadRow).join("")}</tbody></table></div>`
          : empty(ui.leadTab === "novo" ? "Nenhum contato novo. Quando alguém pedir para falar com um consultor na página inicial, ele aparece aqui." : "Nenhum contato nesta etapa.")
      }</section>`
    );
  }
  function leadRow(l) {
    const editing = ui.editingLead === l.id;
    const stages = ui.options?.etapas_contato || {};
    const o = ui.options || {};
    const shopFacts = [l.ramo ? o.ramos?.[l.ramo] : l.ramo_outro ? "Outro ramo" : "", l.cidade, l.lojas != null ? plural(l.lojas, "loja física", "lojas físicas") : "", l.produtos ? "~" + l.produtos + " produtos" : ""].filter(Boolean);
    return `<tr><td><b>${esc(l.nome)}</b><small>${esc(l.origem === "ia" ? "Montou plano com a IA" : l.origem === "vendedor" ? "Conversou com o vendedor" : "Pediu proposta")}${l.consultor_nome ? " · com " + esc(l.consultor_nome) : ""}</small></td><td><b>${esc(l.loja || "—")}</b>${l.cnpj ? `<small>CNPJ ${esc(l.cnpj)}</small>` : ""}${shopFacts.length ? `<small>${esc(shopFacts.join(" · "))}</small>` : ""}${l.plano_interesse ? `<small>interesse: plano ${esc(l.plano_interesse)}</small>` : ""}${l.canais?.length ? `<small class="lead-channels">${esc(l.canais.join(", "))}</small>` : ""}</td><td>${esc(l.whatsapp || "—")}<small>${esc(l.email || "")}</small></td><td>${when(l.criado_em)}</td><td>${
      editing
        ? `<form id="lead-form" data-id="${l.id}" class="lead-form"><select id="lead-status" name="status">${Object.entries(stages).map(([id, label]) => `<option value="${id}" ${id === l.status ? "selected" : ""}>${esc(label)}</option>`).join("")}</select><textarea id="lead-notas" name="notas" rows="2" maxlength="600" placeholder="Anotações da conversa">${esc(l.notas)}</textarea><div class="actions"><button class="btn small primary">Salvar</button><button type="button" class="btn small" data-lead-edit="">Cancelar</button></div></form>`
        : esc(l.notas || l.mensagem || "—")
    }</td><td><div class="actions">${editing ? "" : `<button class="btn small" data-lead-edit="${l.id}">Atender</button>`}${
      l.business_id ? `<button class="btn small" data-go="loja/${l.business_id}">Ver loja</button>` : `<button class="btn small primary" data-lead-quote="${l.id}">Fazer cotação</button><button class="btn small" data-lead-convert="${l.id}">Cadastrar loja</button>`
    }</div></td></tr>`;
  }

  function lojasPage() {
    const stores = need("lojas", "lojas");
    if (!Array.isArray(stores)) return heading("Lojas", "") + (failed(stores) || loading());
    const statuses = ui.options?.situacoes || {};
    const q = ui.storeQuery.trim().toLowerCase();
    const list = stores.filter(
      (x) =>
        (!ui.storeFilter || (ui.storeFilter === "atencao" ? x.saude !== "boa" : x.situacao === ui.storeFilter)) &&
        (!q || `${x.nome} ${x.dono_email} ${x.dono_nome}`.toLowerCase().includes(q)),
    );
    const chip = (id, label) => `<button type="button" class="chip ${ui.storeFilter === id ? "active" : ""}" data-store-filter="${id}">${esc(label)}</button>`;
    return (
      heading("Lojas", isAdmin ? "Todas as lojas da WedTech." : "As lojas que você atende.", `<button class="btn primary" data-go="nova-loja">+ Cadastrar loja</button>`) +
      `<div class="filter-bar"><div class="field grow"><label for="store-q">Buscar</label><input id="store-q" type="search" value="${esc(ui.storeQuery)}" placeholder="Nome da loja, dono ou e-mail" autocomplete="off"></div></div><div class="chips">${chip("", "Todas")}${chip("atencao", "Precisam de atenção")}${Object.entries(statuses).map(([id, label]) => chip(id, label)).join("")}</div>` +
      `<section class="card table-card">${
        list.length
          ? `<div class="table-wrap"><table><thead><tr><th>Loja</th><th>Plano</th><th>Situação</th><th>Saúde</th><th>Últimos 7 dias</th><th>Canais</th><th>Acesso</th>${isAdmin ? "<th>Consultor</th>" : ""}<th></th></tr></thead><tbody>${list
              .map((x) => {
                const [label, tone] = healthLabel[x.saude] || ["", ""];
                return `<tr><td><b>${esc(x.nome)}</b><small>${esc(x.dono_nome)} · ${esc(x.dono_email)}</small></td><td>${esc(ui.options?.planos?.[x.plano] || x.plano)}<small>${money(x.valor_mensal)}/mês</small></td><td>${badge(statuses[x.situacao] || x.situacao, storeTone[x.situacao])}${x.situacao === "teste" && x.teste_ate ? `<small>até ${day(x.teste_ate)}</small>` : ""}</td><td>${badge(label, tone)}${Number(x.chamados_abertos) ? `<small>${plural(Number(x.chamados_abertos), "chamado aberto", "chamados abertos")}</small>` : ""}</td><td>${plural(Number(x.pedidos_7d), "pedido", "pedidos")}<small>${money(x.vendas_7d)}</small></td><td>${x.canais}</td><td>${lastSeen(x.ultimo_acesso)}</td>${isAdmin ? `<td>${esc(x.consultor_nome || "—")}</td>` : ""}<td><button class="btn small" data-go="loja/${x.id}">Abrir</button></td></tr>`;
              })
              .join("")}</tbody></table></div>`
          : empty(stores.length ? "Nenhuma loja com esses filtros." : "Nenhuma loja ainda. Cadastre a primeira em Cadastrar loja.")
      }</section>`
    );
  }

  function lojaPage(id) {
    const b = need("loja/" + id, "loja", id);
    if (!b || b.erro) return heading("Loja", "") + (failed(b) || loading()) + `<button class="btn" data-go="lojas">← Lojas</button>`;
    const o = ui.options || {};
    return (
      heading(
        esc(b.nome),
        `${esc(o.ramos?.[b.tipo] || b.tipo)} · cliente desde ${day(b.criado_em)} · consultor ${esc(b.consultor_nome || "—")} · ${lastSeen(b.ultimo_acesso)}`,
        `<button class="btn" data-go="lojas">← Lojas</button><button class="btn" data-reset-password="${b.id}" ${ui.busy ? "disabled" : ""}>🔑 Redefinir senha</button><button class="btn primary" data-support="${b.id}" ${ui.busy ? "disabled" : ""}>🛟 Ver painel (modo suporte)</button>`,
      ) +
      `<div class="chart-grid"><section class="card"><div class="section-head"><h2>Dados da loja</h2></div><dl class="facts"><dt>Agora</dt><dd>${lastSeen(b.ultimo_acesso)}</dd><dt>Hoje</dt><dd>${plural(b.pedidos_hoje, "pedido", "pedidos")} · ${money(b.vendas_hoje)}</dd><dt>Responsável</dt><dd>${esc(b.dono_nome)}</dd><dt>Acesso</dt><dd>${esc(b.dono_email)}${Number(b.trocar_senha) ? " " + badge("ainda com senha provisória", "warn") : ""}</dd><dt>CNPJ</dt><dd>${esc(b.cnpj || "—")}</dd><dt>Endereço</dt><dd>${esc(b.endereco || "—")}</dd><dt>WhatsApp</dt><dd>${esc(b.whatsapp || "—")}</dd></dl><p class="caption">Os dados cadastrais são mantidos pelo próprio lojista em Configurações do painel.</p></section>` +
      `<section class="card"><div class="section-head"><h2>Chamados</h2></div>${b.chamados.length ? b.chamados.map((t) => ticketRow({ ...t, loja: b.nome })).join("") : empty("Nenhum chamado desta loja.")}</section></div>` +
      contractSection(b) +
      `<section class="card table-card"><div class="section-head pad"><h2>Histórico desta loja</h2></div>${auditTable(b.historico, false)}</section>`
    );
  }

  // ---------------------------------------------------------------------------
  // Contrato e liberações: plano em cartões, recursos com 3 estados, limites com + e −,
  // e um resumo que mostra o preço pela tabela e o que muda para o lojista antes de salvar.
  function contractDraft(b) {
    if (ui.contract && ui.contract.id === b.id) return ui.contract;
    return {
      id: b.id,
      plano: b.plano,
      situacao: b.situacao,
      valor_mensal: Number(b.valor_mensal).toFixed(2),
      teste_ate: b.teste_ate || "",
      consultor_id: b.consultor_id,
      observacoes: b.observacoes || "",
      limites: { ...b.limites },
      modulos: { ...b.modulos },
    };
  }
  const touchContract = (b) => (ui.contract = contractDraft(b));
  function contractPrice(b, d) {
    const o = ui.options;
    const t = o.precos;
    const lines = [["Plano " + o.planos[d.plano], t.planos[d.plano]]];
    for (const c of b.canais_conectados || []) if (t.canais[c]) lines.push(["Integração " + o.canais[c].nome, t.canais[c].mensal]);
    for (const [k, on] of Object.entries(d.modulos)) if (on && !o.modulos_padrao[d.plano][k]) lines.push(["Módulo " + o.modulos[k], t.modulos[k]]);
    const extraShops = Math.max(0, Number(d.limites.maxShops) - o.limites_padrao[d.plano].maxShops);
    if (extraShops) lines.push([plural(extraShops, "loja física extra", "lojas físicas extras"), extraShops * t.loja_extra]);
    return { lines, total: sum(lines) };
  }
  function contractChanges(b, d) {
    const o = ui.options;
    const out = [];
    if (d.plano !== b.plano) out.push([`Plano ${o.planos[b.plano]} → ${o.planos[d.plano]}`, ""]);
    for (const [k, label] of Object.entries(o.modulos)) {
      if (!!d.modulos[k] !== !!b.modulos[k]) out.push([d.modulos[k] ? `Ganha acesso a ${label}` : `Perde o acesso a ${label}`, d.modulos[k] ? "gain" : "loss"]);
    }
    for (const [k, label] of limitInfo) {
      if (Number(d.limites[k]) !== Number(b.limites[k])) out.push([`${label}: ${b.limites[k]} → ${d.limites[k]}`, Number(d.limites[k]) > Number(b.limites[k]) ? "gain" : "loss"]);
    }
    if (d.situacao !== b.situacao) {
      const text = {
        suspensa: "Loja suspensa: o lojista não consegue mais entrar no painel",
        cancelada: "Loja cancelada: o lojista perde o acesso ao painel",
        ativa: b.situacao === "teste" ? "Sai do período de teste e passa a ser cobrada" : "Loja reativada: o lojista volta a entrar",
        teste: "Volta para o período de teste",
      }[d.situacao];
      out.push([text, ["suspensa", "cancelada"].includes(d.situacao) ? "loss" : "gain"]);
    }
    if (Math.abs(Number(d.valor_mensal) - Number(b.valor_mensal)) > 0.004) out.push([`Mensalidade ${money(b.valor_mensal)} → ${money(d.valor_mensal)}`, ""]);
    if ((d.teste_ate || "") !== (b.teste_ate || "")) out.push([`Teste até ${d.teste_ate ? day(d.teste_ate) : "sem data"}`, ""]);
    if (isAdmin && Number(d.consultor_id) !== Number(b.consultor_id)) out.push(["Consultor responsável alterado", ""]);
    if ((d.observacoes || "") !== (b.observacoes || "")) out.push(["Observações internas atualizadas", ""]);
    return out;
  }
  function contractSection(b) {
    const o = ui.options;
    const t = o.precos;
    const d = contractDraft(b);
    const planCards = Object.entries(o.planos)
      .map(([k, name]) => {
        const lim = o.limites_padrao[k];
        const mods = Object.entries(o.modulos)
          .filter(([m]) => o.modulos_padrao[k][m])
          .map(([, l]) => l);
        const on = d.plano === k;
        return `<button type="button" class="plan-card ${on ? "selected" : ""}" data-plan-pick="${k}" aria-pressed="${on}"><span class="plan-name">${esc(name)}${b.plano === k ? " <small>atual</small>" : ""}</span><strong>${money(t.planos[k])}<small>/mês</small></strong><span>${plural(lim.maxChannels, "canal", "canais")} · ${plural(lim.maxMarketplaces, "marketplace", "marketplaces")} · ${plural(lim.maxShops, "loja física", "lojas físicas")}</span><span class="muted">${mods.length ? "Inclui " + esc(mods.join(", ")) : "Sem recursos extras"}</span></button>`;
      })
      .join("");
    const moduleRows = Object.entries(o.modulos)
      .map(([k, label]) => {
        const included = !!o.modulos_padrao[d.plano][k];
        const on = !!d.modulos[k];
        return `<div class="feature-row"><div class="feature-text"><b>${esc(label)}</b><small class="muted">${included ? "faz parte do plano " + esc(o.planos[d.plano]) : "fora do plano · " + money(t.modulos[k]) + "/mês como extra"}</small></div>${
          included
            ? `<span class="feature-state included">✓ Incluído no plano</span>`
            : `<div class="segmented" role="group" aria-label="${esc(label)}"><button type="button" class="${on ? "" : "active"}" aria-pressed="${!on}" data-module-set="${k}:off">✕ Bloqueado</button><button type="button" class="${on ? "active extra" : ""}" aria-pressed="${on}" data-module-set="${k}:extra">+ Liberar como extra</button></div>`
        }</div>`;
      })
      .join("");
    const limitRows = limitInfo
      .map(([k, label, hint]) => {
        const base = o.limites_padrao[d.plano][k];
        const v = Number(d.limites[k]);
        const extra = v - base;
        return `<div class="feature-row"><div class="feature-text"><b>${label}</b><small class="muted">${hint} · o plano dá ${base}</small></div><div class="stepper"><button type="button" data-limit-step="${k}:-1" ${v <= base ? "disabled" : ""} aria-label="Menos ${label}">−</button><output aria-live="polite">${v}</output><button type="button" data-limit-step="${k}:1" ${v >= 50 ? "disabled" : ""} aria-label="Mais ${label}">+</button></div>${
          extra > 0 ? `<span class="feature-state extra">+${plural(extra, "extra", "extras")}</span>` : `<span class="feature-state included">no plano</span>`
        }</div>`;
      })
      .join("");
    const price = contractPrice(b, d);
    const changes = contractChanges(b, d);
    const agreed = Number(d.valor_mensal) || 0;
    return `<section class="card contract"><div class="section-head"><div><h2>Contrato e liberações</h2><p>Escolha o plano, libere o que for extra e confira o resumo. Ao salvar, o painel da loja muda na hora.</p></div></div>
      <div class="contract-grid"><div class="contract-main">
        <h3 class="block-title">1. Plano</h3><div class="plan-cards">${planCards}</div>
        <h3 class="block-title">2. Recursos</h3><div class="feature-list">${moduleRows}</div>
        <h3 class="block-title">3. Limites</h3><div class="feature-list">${limitRows}</div>
      </div>
      <aside class="contract-summary"><h3>Resumo</h3>
        <div class="price-lines">${price.lines.map(([l, v]) => `<div><span>${esc(l)}</span><span>${v ? money(v) : "incluso"}</span></div>`).join("")}<div class="total"><span>Pela tabela</span><span>${money(price.total)}</span></div></div>
        <div class="field"><label for="ct-valor">Mensalidade combinada (R$)</label><div class="inline-field"><input id="ct-valor" type="number" min="0" step="0.01" inputmode="decimal" data-draft="valor_mensal" value="${esc(d.valor_mensal)}"><button type="button" class="btn small" data-use-table-price="${price.total}">Usar tabela</button></div>${
          Math.abs(agreed - price.total) > 0.004 ? `<small class="muted">${agreed < price.total ? "Desconto de " + money(price.total - agreed) + " sobre a tabela" : "Acima da tabela em " + money(agreed - price.total)}</small>` : ""
        }</div>
        <div class="field"><label for="ct-situacao">Situação</label><select id="ct-situacao" data-draft="situacao">${Object.entries(o.situacoes).map(([k, v]) => `<option value="${k}" ${k === d.situacao ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>
        <div class="field"><label for="ct-teste">Teste até</label><input id="ct-teste" type="date" data-draft="teste_ate" value="${esc(d.teste_ate)}"></div>
        ${isAdmin ? `<div class="field"><label for="ct-consultor">Consultor</label><select id="ct-consultor" data-draft="consultor_id">${(o.consultores || []).map((c) => `<option value="${c.id}" ${Number(c.id) === Number(d.consultor_id) ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></div>` : ""}
        <div class="field"><label for="ct-obs">Observações internas</label><textarea id="ct-obs" rows="2" maxlength="400" data-draft="observacoes">${esc(d.observacoes)}</textarea></div>
        <h3>O que muda para o lojista</h3>
        ${changes.length ? `<ul class="change-list">${changes.map(([text, tone]) => `<li class="${tone}">${esc(text)}</li>`).join("")}</ul>` : `<p class="muted">Nenhuma alteração ainda.</p>`}
        <div class="actions"><button type="button" class="btn primary" data-contract-save="${b.id}" ${!changes.length || ui.busy ? "disabled" : ""}>Salvar e aplicar agora</button>${changes.length ? `<button type="button" class="btn" data-contract-reset>Descartar</button>` : ""}</div>
      </aside></div></section>`;
  }

  function novaLojaPage() {
    const o = ui.options || {};
    const p = ui.prefill || {};
    const field = (name, label, attrs = "", cls = "") => `<div class="field ${cls}"><label for="nl-${name}">${label}</label><input id="nl-${name}" name="${name}" value="${esc(p[name] ?? "")}" ${attrs}></div>`;
    const trials = [0, 7, 14, 30];
    if (p.teste_dias != null && !trials.includes(Number(p.teste_dias))) trials.push(Number(p.teste_dias));
    const trial = p.teste_dias != null ? Number(p.teste_dias) : 14;
    return (
      heading("Cadastrar loja", p.quote_id ? `A partir da cotação #${p.quote_id} aceita pelo cliente: plano, limites, recursos e mensalidade já vêm do que foi contratado.` : "Crie o acesso do lojista. Ele recebe uma senha provisória e troca no primeiro acesso; o painel já abre com os dados da loja.") +
      `<section class="card"><form id="new-store-form" class="form-grid compact" data-lead="${esc(p.lead_id || "")}" data-quote="${esc(p.quote_id || "")}"><h3 class="block-title full">Loja</h3>${field("nome", "Nome da loja", 'required minlength="2" maxlength="80"', "full")}<div class="field"><label for="nl-tipo">Ramo</label><select id="nl-tipo" name="tipo" required>${Object.entries(o.ramos || {}).map(([k, v]) => `<option value="${k}" ${k === p.tipo ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>${field("cnpj", "CNPJ", 'maxlength="20" placeholder="00.000.000/0000-00"')}${field("endereco", "Endereço", 'maxlength="160"', "full")}<h3 class="block-title full">Responsável (acesso ao painel)</h3>${field("responsavel", "Nome", 'required minlength="2" maxlength="80"')}${field("email", "E-mail de acesso", 'type="email" required maxlength="120"')}${field("whatsapp", "WhatsApp", 'inputmode="tel" maxlength="20"')}<h3 class="block-title full">Contrato</h3><div class="field"><label for="nl-plano">Plano</label><select id="nl-plano" name="plano">${Object.entries(o.planos || {}).map(([k, v]) => `<option value="${k}" ${k === (p.plano || "profissional") ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>${field("valor_mensal", "Mensalidade combinada (R$)", 'type="number" min="0" step="0.01"')}<div class="field"><label for="nl-teste">Período de teste</label><select id="nl-teste" name="teste_dias">${trials.map((n) => `<option value="${n}" ${n === trial ? "selected" : ""}>${n ? n + " dias" : "Sem teste (já ativa)"}</option>`).join("")}</select></div>${
        isAdmin ? `<div class="field"><label for="nl-consultor">Consultor responsável</label><select id="nl-consultor" name="consultor_id">${(o.consultores || []).map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select></div>` : ""
      }<div class="field full"><label for="nl-obs">Observações internas</label><textarea id="nl-obs" name="observacoes" rows="2" maxlength="400">${esc(p.observacoes || "")}</textarea></div><div class="field full"><button class="btn primary big" ${ui.busy ? "disabled" : ""}>Cadastrar loja e gerar acesso</button></div></form></section>`
    );
  }

  function chamadosPage() {
    const tickets = need("chamados", "chamados");
    if (!Array.isArray(tickets)) return heading("Suporte", "") + (failed(tickets) || loading());
    const statuses = ui.options?.situacoes_chamado || {};
    const list = tickets.filter((t) => t.status === ui.ticketTab);
    return (
      heading("Suporte", "Chamados abertos pelos lojistas no painel. As mensagens chegam aqui na hora e a sua resposta aparece na tela Suporte do lojista.") +
      `<div class="tabs" role="tablist">${Object.entries(statuses)
        .map(([id, label]) => {
          const n = tickets.filter((t) => t.status === id).length;
          return `<button type="button" role="tab" class="tab ${ui.ticketTab === id ? "active" : ""}" aria-selected="${ui.ticketTab === id}" data-ticket-tab="${id}">${esc(label)}${id !== "resolvido" && n ? ` <span class="tab-count">${n}</span>` : ""}</button>`;
        })
        .join("")}</div><section class="card table-card">${
        list.length
          ? `<div class="table-wrap"><table><thead><tr><th>Chamado</th><th>Loja</th><th>Aberto</th><th>Última atualização</th><th></th></tr></thead><tbody>${list
              .map(
                (t) =>
                  `<tr class="${Number(t.nao_lidas) ? "row-unread" : ""}"><td><b>#${t.id} · ${esc(t.assunto)}</b>${Number(t.nao_lidas) ? ` <span class="unread-pill">${plural(Number(t.nao_lidas), "nova", "novas")}</span>` : ""}</td><td>${esc(t.loja)}</td><td>${when(t.criado_em)}</td><td>${when(t.atualizado_em)}</td><td><button class="btn small ${t.status === "aberto" || Number(t.nao_lidas) ? "primary" : ""}" data-go="chamado/${t.id}">${t.status === "aberto" || Number(t.nao_lidas) ? "Responder" : "Abrir"}</button></td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : empty("Nenhum chamado nesta etapa.")
      }</section>`
    );
  }
  function chamadoPage(id) {
    const t = need("chamado/" + id, "chamado", id);
    if (!t || t.erro) return heading("Chamado", "") + (failed(t) || loading());
    const statuses = ui.options?.situacoes_chamado || {};
    return (
      heading(`#${t.id} · ${esc(t.assunto)}`, `${esc(t.loja)} · aberto em ${when(t.criado_em)} · ${badge(statuses[t.status] || t.status, ticketTone[t.status])}`, `<button class="btn" data-go="chamados">← Suporte</button><button class="btn" data-go="loja/${t.business_id}">Ver loja</button>`) +
      `<section class="card chat"><div class="ticket-thread" aria-live="polite">${t.mensagens
        .map((m) => `<div class="ticket-msg ${m.autor_papel === "lojista" ? "" : "mine"}"><small>${esc(m.autor || "")} · ${when(m.criado_em)}</small>${esc(m.texto)}</div>`)
        .join("")}</div><form id="ticket-form" data-id="${t.id}" class="chat-form"><div class="field grow"><label for="tk-texto">Resposta ao lojista <small class="muted">(Ctrl + Enter envia)</small></label><textarea id="tk-texto" name="texto" rows="2" maxlength="2000"></textarea></div><div class="field"><label for="tk-status">Situação</label><select id="tk-status" name="status"><option value="">Manter (${esc(statuses[t.status] || t.status)})</option>${Object.entries(statuses).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Enviar</button></form></section>`
    );
  }

  // ---------------------------------------------------------------------------
  // Cotações
  function blankQuote(p = {}) {
    return {
      id: null,
      lead_id: p.lead_id || null,
      cliente: { nome: p.nome || "", loja: p.loja || "", email: p.email || "", whatsapp: p.whatsapp || "", cnpj: p.cnpj || "", endereco: p.endereco || "" },
      config: {
        tipo: p.tipo || "moda",
        canais: p.canais || ["whats", "ml"],
        lojas: p.lojas ?? 1,
        produtos: p.produtos ?? 50,
        modulos: {},
        plano: "auto",
        desconto: 0,
        implantacao: true,
        teste_dias: 14,
      },
      observacoes: "",
      calc: null,
    };
  }
  function quoteFromData(q) {
    return { id: q.id, lead_id: q.lead_id, cliente: { ...blankQuote().cliente, ...q.cliente }, config: { ...blankQuote().config, ...q.config }, observacoes: q.observacoes || "", calc: q.resultado };
  }
  const proposalUrl = (token, extra = "") => new URL("../proposta.php?t=" + token + extra, location.href).href;
  const contractUrl = (token, extra = "") => new URL("../contrato.php?t=" + token + extra, location.href).href;
  // Número do cliente no formato internacional do WhatsApp (55 + DDD + número); vazio se incompleto
  function whatsappNumber(raw) {
    let digits = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
    return /^55\d{10,11}$/.test(digits) ? digits : "";
  }
  const phoneLabel = (n) => `(${n.slice(2, 4)}) ${n.slice(4, -4)}-${n.slice(-4)}`;
  function proposalMessage(q, data) {
    const first = q.cliente.nome.trim().split(" ")[0];
    const url = proposalUrl(data.token);
    const subject = `Proposta WedTech para a ${q.cliente.loja}`;
    const lines = [
      `Olá, ${first}!`,
      "",
      `Segue a proposta da WedTech para a ${q.cliente.loja}:`,
      url,
      "",
      "Pelo link você vê os valores, lê o contrato, imprime ou salva em PDF e aceita a proposta.",
      `Mensalidade: ${money(data.mensal_total)}${data.unico_total ? " · Pagamento único: " + money(data.unico_total) : ""}`,
      data.validade ? `Proposta válida até ${day(data.validade)}.` : "",
      "",
      "Qualquer dúvida, é só me chamar.",
      me.nome,
    ].filter((l, i, all) => l !== "" || all[i - 1] !== "");
    return { subject, text: lines.join("\n") };
  }
  function whatsappLink(phone, q, data) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(proposalMessage(q, data).text)}`;
  }
  function mailLinks(email, q, data) {
    const { subject, text } = proposalMessage(q, data);
    return {
      mailto: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
    };
  }
  let calcTimer = null;
  let calcSeq = 0;
  function recalc(delay = 250) {
    clearTimeout(calcTimer);
    calcTimer = setTimeout(async () => {
      const q = ui.quote;
      if (!q) return;
      const seq = ++calcSeq;
      try {
        const r = await api("calcular_cotacao", { body: { config: q.config } });
        if (seq !== calcSeq || ui.quote !== q) return;
        q.calc = r;
        const el = $("#quote-summary");
        if (el) el.innerHTML = quoteSummary(q);
        else render();
      } catch (err) {
        toast(err.message);
      }
    }, delay);
  }
  function quoteSummary(q) {
    const c = q.calc;
    if (!c) return empty("Calculando…");
    const o = ui.options;
    const lines = (list) => list.map(([l, v]) => `<div class="${v < 0 ? "discount" : ""}"><span>${esc(l)}</span><span>${Number(v) === 0 ? "incluso" : money(v)}</span></div>`).join("");
    const suggestion =
      q.config.plano === "auto"
        ? `Plano ${esc(o.planos[c.plano])}: o mais barato que comporta ${plural(q.config.canais.filter((ch) => ["marketplace", "delivery"].includes(o.canais[ch]?.tipo)).length, "marketplace", "marketplaces")}.`
        : c.plano_sugerido !== c.plano
          ? `A tabela sugere o plano ${esc(o.planos[c.plano_sugerido])}.`
          : "";
    return (
      (suggestion ? `<p class="caption">${suggestion}</p>` : "") +
      `<h3>Mensalidade</h3><div class="price-lines">${lines(c.mensal)}<div class="total"><span>Por mês</span><span>${money(c.mensal_total)}</span></div></div>` +
      (c.unico.length ? `<h3>Pagamento único</h3><div class="price-lines">${lines(c.unico)}<div class="total"><span>Cadastro e implantação</span><span>${money(c.unico_total)}</span></div></div>` : "") +
      `<div class="quote-totals"><div><small>Por mês</small><strong>${money(c.mensal_total)}</strong></div><div><small>Primeiro pagamento</small><strong>${money(c.primeiro_pagamento)}</strong>${c.teste_dias ? `<em>mensalidade depois de ${c.teste_dias} dias de teste</em>` : ""}</div></div>` +
      (c.precisa_aprovacao ? `<div class="validation">⚠ Desconto acima de ${o.precos.desconto_max}%: ${isAdmin ? "como administrador, você pode enviar direto." : "a cotação vai para aprovação do administrador antes de chegar ao cliente."}</div>` : "")
    );
  }
  function cotacoesPage() {
    const list = need("cotacoes", "cotacoes");
    if (!Array.isArray(list)) return heading("Cotações", "") + (failed(list) || loading());
    const statuses = ui.options.situacoes_cotacao;
    const shown = ui.quoteTab === "todas" ? list : list.filter((q) => q.status === ui.quoteTab);
    const tab = (id, label) => {
      const n = id === "todas" ? list.length : list.filter((q) => q.status === id).length;
      return `<button type="button" role="tab" class="tab ${ui.quoteTab === id ? "active" : ""}" aria-selected="${ui.quoteTab === id}" data-quote-tab="${id}">${esc(label)}${n ? ` <span class="tab-count">${n}</span>` : ""}</button>`;
    };
    return (
      heading("Cotações", "Monte a proposta com o preço de cada marketplace e dos produtos a cadastrar, envie o link e acompanhe: quando o cliente aceita, você é avisado na hora.", `<button class="btn primary" data-new-quote>+ Nova cotação</button>`) +
      `<div class="tabs" role="tablist">${tab("todas", "Todas")}${Object.entries(statuses).map(([id, label]) => tab(id, label)).join("")}</div>` +
      `<section class="card table-card">${
        shown.length
          ? `<div class="table-wrap"><table><thead><tr><th>Cotação</th><th>Mensalidade</th><th>Pagamento único</th><th>Situação</th><th>Atualizada</th>${isAdmin ? "<th>Consultor</th>" : ""}<th></th></tr></thead><tbody>${shown
              .map(
                (q) =>
                  `<tr><td><b>#${q.id} · ${esc(q.cliente.loja)}</b><small>${esc(q.cliente.nome)}</small></td><td>${money(q.mensal_total)}${q.desconto_pct ? `<small>${q.desconto_pct}% de desconto</small>` : ""}</td><td>${money(q.unico_total)}</td><td>${badge(statuses[q.status] || q.status, quoteTone[q.status])}${q.status === "enviada" && q.validade ? `<small>válida até ${day(q.validade)}</small>` : ""}${q.business_id ? `<small>virou loja</small>` : ""}</td><td>${when(q.atualizado_em)}</td>${isAdmin ? `<td>${esc(q.consultor_nome)}</td>` : ""}<td><button class="btn small ${q.status === "aceita" && !q.business_id ? "primary" : ""}" data-go="cotacao/${q.id}">Abrir</button></td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : empty(list.length ? "Nenhuma cotação nesta situação." : "Nenhuma cotação ainda. Clique em Nova cotação ou em Fazer cotação num contato do site.")
      }</section>`
    );
  }
  function cotacaoPage(id) {
    const data = id ? need("cotacao/" + id, "cotacao", id) : null;
    if (id && (!data || data.erro)) return heading("Cotação", "") + (failed(data) || loading()) + `<button class="btn" data-go="cotacoes">← Cotações</button>`;
    if (!ui.quote || ui.quote.id !== (id || null)) ui.quote = id ? quoteFromData(data) : blankQuote();
    const q = ui.quote;
    if (!q.calc) recalc(0);
    const o = ui.options;
    const status = data?.status || "rascunho";
    const locked = ["aceita", "recusada"].includes(status) || (status === "aprovacao" && !isAdmin);
    const channels = o.canais_por_ramo[q.config.tipo] || [];
    const text = (key, label, attrs = "") => `<div class="field"><label for="qt-${key}">${label}</label><input id="qt-${key}" data-q="cliente.${key}" value="${esc(q.cliente[key])}" ${attrs}></div>`;
    const num = (key, label, attrs, hint = "") => `<div class="field"><label for="qt-${key}">${label}</label><input id="qt-${key}" type="number" inputmode="numeric" data-q="config.${key}" value="${esc(q.config[key])}" ${attrs}>${hint ? `<small class="muted">${hint}</small>` : ""}</div>`;
    const channelChips = channels
      .map((c) => {
        const on = q.config.canais.includes(c);
        const price = o.precos.canais[c];
        return `<button type="button" class="pick-chip ${on ? "active" : ""}" aria-pressed="${on}" data-quote-channel="${c}"><b>${esc(o.canais[c].nome)}</b><small>${price.mensal ? money(price.mensal) + "/mês" : "sem mensalidade"}${price.cadastro ? " · " + money(price.cadastro) + "/produto" : ""}</small></button>`;
      })
      .join("");
    const moduleChips = Object.entries(o.modulos)
      .map(([k, label]) => {
        const on = !!q.config.modulos[k];
        return `<button type="button" class="pick-chip ${on ? "active" : ""}" aria-pressed="${on}" data-quote-module="${k}"><b>${esc(label)}</b><small>${money(o.precos.modulos[k])}/mês se não estiver no plano</small></button>`;
      })
      .join("");
    const builder = `<fieldset class="quote-builder" ${locked ? "disabled" : ""}>
      <section class="card"><h2>Cliente</h2><div class="form-grid compact">${text("nome", "Nome do cliente", 'required maxlength="80" autocomplete="off"')}${text("loja", "Nome da loja", 'required maxlength="80" autocomplete="off"')}${text("whatsapp", "WhatsApp", 'inputmode="tel" maxlength="20"')}${text("email", "E-mail", 'type="email" maxlength="120"')}${text("cnpj", "CNPJ (vai no contrato)", 'maxlength="20"')}${text("endereco", "Endereço (vai no contrato)", 'maxlength="160"')}</div></section>
      <section class="card"><h2>O que a loja precisa</h2><div class="form-grid compact"><div class="field"><label for="qt-tipo">Ramo</label><select id="qt-tipo" data-q="config.tipo">${Object.entries(o.ramos).map(([k, v]) => `<option value="${k}" ${k === q.config.tipo ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>${num("lojas", "Lojas físicas", 'min="0" max="50"')}${num("produtos", "Produtos a cadastrar", 'min="0" max="100000"', "cada produto é cadastrado em cada canal escolhido")}</div>
        <h3 class="block-title">Onde vai vender</h3><div class="pick-grid">${channelChips}</div>
        <h3 class="block-title">Recursos</h3><div class="pick-grid">${moduleChips}</div></section>
      <section class="card"><h2>Condições</h2><div class="form-grid compact"><div class="field"><label for="qt-plano">Plano</label><select id="qt-plano" data-q="config.plano"><option value="auto">Automático (o mais barato que atende)</option>${Object.entries(o.planos).map(([k, v]) => `<option value="${k}" ${k === q.config.plano ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div>${num("desconto", "Desconto na mensalidade (%)", 'min="0" max="100" step="0.5"', `até ${o.precos.desconto_max}% sem aprovação`)}${num("teste_dias", "Dias de teste", 'min="0" max="60"')}<div class="field"><label class="check-line"><input type="checkbox" id="qt-implantacao" data-q="config.implantacao" ${q.config.implantacao ? "checked" : ""}> Cobrar implantação (${money(o.precos.implantacao)})</label></div><div class="field full"><label for="qt-obs">Observações para o cliente</label><textarea id="qt-obs" data-q="observacoes" rows="2" maxlength="600">${esc(q.observacoes)}</textarea></div></div></section>
    </fieldset>`;
    return (
      heading(
        id ? `Cotação #${id} ${badge(o.situacoes_cotacao[status] || status, quoteTone[status])}` : "Nova cotação",
        id ? `${esc(data.cliente.loja)} · criada em ${when(data.criado_em)}${isAdmin ? " · consultor " + esc(data.consultor_nome) : ""}` : "Escolha os canais e a quantidade de produtos: o preço é calculado pela tabela na hora.",
        `<button class="btn" data-go="cotacoes">← Cotações</button>`,
      ) +
      `<div class="quote-grid"><div>${builder}</div><aside class="quote-side"><section class="card"><h2>Proposta</h2><div id="quote-summary">${quoteSummary(q)}</div></section>${quoteShare(q, data, status)}</aside></div>`
    );
  }
  function quoteShare(q, data, status) {
    const o = ui.options;
    const busy = ui.busy ? "disabled" : "";
    if (!data) {
      return `<section class="card quote-actions"><button type="button" class="btn primary" data-quote-send ${busy}>Salvar e enviar ao cliente</button><button type="button" class="btn" data-quote-save ${busy}>Salvar rascunho</button></section>`;
    }
    const url = proposalUrl(data.token);
    const phone = whatsappNumber(q.cliente.whatsapp);
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q.cliente.email || "") ? q.cliente.email.trim() : "";
    const mail = email ? mailLinks(email, q, data) : null;
    const send = `<div class="send-options"><h3>Enviar para o cliente</h3>${
      phone
        ? `<a class="btn whatsapp" href="${esc(whatsappLink(phone, q, data))}" target="_blank" rel="noopener">💬 WhatsApp · ${esc(phoneLabel(phone))}</a>`
        : `<button type="button" class="btn" disabled>💬 WhatsApp</button><small class="muted">Preencha o WhatsApp do cliente com DDD (ex.: 11 98888-7777).</small>`
    }${
      mail
        ? `<div class="actions wrap"><a class="btn" href="${esc(mail.mailto)}">✉️ E-mail · ${esc(email)}</a><a class="btn small" href="${esc(mail.gmail)}" target="_blank" rel="noopener">Abrir no Gmail</a></div>`
        : `<button type="button" class="btn" disabled>✉️ E-mail</button><small class="muted">Preencha o e-mail do cliente para enviar por e-mail.</small>`
    }</div>`;
    const links = `<div class="share-link"><label for="qt-link">Link da proposta</label><div class="inline-field"><input id="qt-link" readonly value="${esc(url)}"><button type="button" class="btn small" data-copy="${esc(url)}">Copiar</button></div></div>${send}<div class="actions wrap"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">👁 Ver proposta</a><a class="btn" href="${esc(contractUrl(data.token))}" target="_blank" rel="noopener">📄 Contrato</a><a class="btn" href="${esc(proposalUrl(data.token, "&imprimir=1"))}" target="_blank" rel="noopener">🖨️ Imprimir proposta</a><a class="btn" href="${esc(contractUrl(data.token, "&imprimir=1"))}" target="_blank" rel="noopener">🖨️ Imprimir contrato</a></div>`;
    const editNote = `<p class="caption">Mudou algo? Salvar volta a cotação para rascunho e ela precisa ser enviada de novo.</p>`;
    switch (status) {
      case "rascunho":
        return `<section class="card quote-actions"><button type="button" class="btn primary" data-quote-send ${busy}>Salvar e enviar ao cliente</button><button type="button" class="btn" data-quote-save ${busy}>Salvar rascunho</button><a class="link" href="${esc(url)}" target="_blank" rel="noopener">Pré-visualizar como o cliente vê</a></section>`;
      case "aprovacao":
        return isAdmin
          ? `<section class="card quote-actions"><div class="validation">⏳ O consultor pediu ${data.desconto_pct}% de desconto (acima de ${o.precos.desconto_max}%).</div><button type="button" class="btn primary" data-quote-send ${busy}>Aprovar e enviar ao cliente</button><a class="link" href="${esc(url)}" target="_blank" rel="noopener">Pré-visualizar</a></section>`
          : `<section class="card quote-actions"><div class="validation">⏳ Aguardando o administrador aprovar o desconto de ${data.desconto_pct}%. Você é avisado quando for enviada.</div></section>`;
      case "enviada":
        return `<section class="card quote-actions"><p>Enviada em ${when(data.enviada_em)} · válida até <b>${day(data.validade)}</b>. Quando o cliente responder, você recebe um aviso aqui.</p>${links}<button type="button" class="btn" data-quote-save ${busy}>Salvar alterações</button>${editNote}</section>`;
      case "vencida":
        return `<section class="card quote-actions"><div class="validation">A proposta venceu em ${day(data.validade)}.</div><button type="button" class="btn primary" data-quote-send ${busy}>Reenviar com nova validade</button>${links}</section>`;
      case "aceita":
        return `<section class="card quote-actions accepted"><p>✅ Aceita por <b>${esc(data.aceite_nome)}</b> em ${when(data.respondido_em)}.</p>${
          data.business_id ? `<button type="button" class="btn" data-go="loja/${data.business_id}">Ver a loja</button>` : `<button type="button" class="btn primary" data-quote-store ${busy}>Cadastrar a loja com esta cotação</button>`
        }${links}</section>`;
      case "recusada":
        return `<section class="card quote-actions"><p>❌ Recusada em ${when(data.respondido_em)}.${data.recusa_motivo ? ` Motivo: “${esc(data.recusa_motivo)}”` : ""}</p><button type="button" class="btn" data-quote-copy ${busy}>Fazer nova cotação a partir desta</button></section>`;
      default:
        return "";
    }
  }

  function precosPage() {
    const o = ui.options;
    const t = o.precos;
    const ro = isAdmin ? "" : "disabled";
    const input = (id, value, attrs = 'min="0" step="0.01"') => `<input id="${id}" name="${id}" type="number" ${attrs} value="${value}" ${ro}>`;
    const field = (id, label, value, attrs) => `<div class="field"><label for="${id}">${label}</label>${input(id, value, attrs)}</div>`;
    const kindLabel = { proprio: "Canal próprio", social: "Rede social", marketplace: "Marketplace", delivery: "App de delivery" };
    return (
      heading("Tabela de preços", isAdmin ? "Os valores usados nas cotações e no resumo do contrato. Mudanças valem para as próximas cotações; as já enviadas não mudam." : "Os valores usados nas cotações. Só o administrador altera esta tabela.") +
      `<form id="prices-form" class="prices"><section class="card"><h2>Plataforma (mensalidade do plano)</h2><div class="form-grid compact">${Object.entries(o.planos)
        .map(([k, v]) => field("pl-" + k, esc(v), t.planos[k]))
        .join("")}</div></section>` +
      `<section class="card table-card"><div class="section-head pad"><div><h2>Canais e marketplaces</h2><p>Mensalidade da integração e o valor para cadastrar cada produto no canal (cobrado uma vez).</p></div></div><div class="table-wrap"><table><thead><tr><th>Canal</th><th>Tipo</th><th>Mensalidade (R$)</th><th>Cadastro por produto (R$)</th></tr></thead><tbody>${Object.entries(o.canais)
        .map(([k, c]) => `<tr><td><b>${esc(c.nome)}</b></td><td>${esc(kindLabel[c.tipo] || c.tipo)}</td><td><label class="sr-only" for="cm-${k}">Mensalidade ${esc(c.nome)}</label>${input("cm-" + k, t.canais[k].mensal)}</td><td><label class="sr-only" for="cc-${k}">Cadastro por produto ${esc(c.nome)}</label>${input("cc-" + k, t.canais[k].cadastro)}</td></tr>`)
        .join("")}</tbody></table></div></section>` +
      `<section class="card"><h2>Recursos fora do plano (por mês)</h2><div class="form-grid compact">${Object.entries(o.modulos)
        .map(([k, v]) => field("md-" + k, esc(v), t.modulos[k]))
        .join("")}</div></section>` +
      `<section class="card"><h2>Outros valores e regras</h2><div class="form-grid compact">${field("loja_extra", "Loja física além do plano (por mês)", t.loja_extra)}${field("implantacao", "Implantação e treinamento (único)", t.implantacao)}${field("desconto_max", "Desconto máximo sem aprovação (%)", t.desconto_max, 'min="0" max="100" step="0.5"')}${field("validade_dias", "Validade da proposta (dias)", t.validade_dias, 'min="1" max="90" step="1"')}</div></section>` +
      `<section class="card"><h2>Dados da WedTech no contrato</h2><p class="caption">Aparecem como "Contratada" no contrato gerado pelas cotações. Campo vazio vira uma linha para completar à mão. Revise o modelo de contrato com um advogado antes de usar com clientes reais.</p><div class="form-grid compact">${[
        ["razao", "Razão social", 120],
        ["cnpj", "CNPJ", 20],
        ["endereco", "Endereço", 200],
        ["email", "E-mail de contato", 120],
        ["foro", "Foro (cidade/UF)", 80],
      ]
        .map(([k, label, max]) => `<div class="field ${k === "endereco" ? "full" : ""}"><label for="em-${k}">${label}</label><input id="em-${k}" name="em-${k}" maxlength="${max}" value="${esc(t.empresa?.[k] || "")}" ${ro}></div>`)
        .join("")}</div></section>` +
      (isAdmin ? `<div class="form-actions"><button class="btn primary big" ${ui.busy ? "disabled" : ""}>Salvar tabela de preços</button></div>` : "") +
      `</form>`
    );
  }

  function consultoresPage() {
    if (!isAdmin) return heading("Consultores", "Só o administrador vê esta área.");
    const list = need("consultores", "consultores");
    if (!Array.isArray(list)) return heading("Consultores", "") + (failed(list) || loading());
    return (
      heading("Consultores", "Quem atende as lojas. Cada consultor vê só as lojas dele; o administrador vê todas.") +
      `<section class="card"><form id="consultant-form" class="scan-form"><div class="field grow"><label for="cs-nome">Nome</label><input id="cs-nome" name="nome" required minlength="2" maxlength="80"></div><div class="field grow"><label for="cs-email">E-mail</label><input id="cs-email" name="email" type="email" required maxlength="120"></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Cadastrar consultor</button></form></section>` +
      `<section class="card table-card"><div class="table-wrap"><table><thead><tr><th>Consultor</th><th>Perfil</th><th>Lojas</th><th>Acesso</th></tr></thead><tbody>${list
        .map((c) => `<tr><td><b>${esc(c.nome)}</b><small>${esc(c.email)}</small></td><td>${badge(c.papel === "admin" ? "Administrador" : "Consultor", c.papel === "admin" ? "" : "neutral")}</td><td>${c.lojas}</td><td>${lastSeen(c.ultimo_acesso)}</td></tr>`)
        .join("")}</tbody></table></div></section>`
    );
  }

  const auditLabels = {
    loja_criada: "Loja cadastrada",
    loja_alterada: "Contrato alterado",
    senha_redefinida: "Senha redefinida",
    suporte_iniciado: "Entrou em modo suporte",
    suporte_encerrado: "Saiu do modo suporte",
    chamado_respondido: "Chamado respondido",
    contato_atualizado: "Contato atualizado",
    consultor_criado: "Consultor cadastrado",
    cotacao_criada: "Cotação criada",
    cotacao_enviada: "Cotação enviada",
    cotacao_aprovacao: "Cotação aguardando aprovação",
    cotacao_aprovada: "Desconto aprovado e cotação enviada",
    cotacao_aceita: "Cotação aceita pelo cliente",
    cotacao_recusada: "Cotação recusada pelo cliente",
    precos_alterados: "Tabela de preços alterada",
  };
  function auditTable(rows, withStore = true) {
    if (!rows?.length) return empty("Nenhuma ação registrada ainda.");
    return `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Quem</th>${withStore ? "<th>Loja</th>" : ""}<th>O quê</th><th>Detalhe</th></tr></thead><tbody>${rows
      .map((a) => `<tr><td>${when(a.criado_em)}</td><td>${esc(a.ator || "—")}</td>${withStore ? `<td>${esc(a.loja || "—")}</td>` : ""}<td>${esc(auditLabels[a.acao] || a.acao)}</td><td class="muted">${esc(a.detalhe)}</td></tr>`)
      .join("")}</tbody></table></div>`;
  }
  function historicoPage() {
    const rows = need("historico", "historico");
    if (!Array.isArray(rows)) return heading("Registro de ações", "") + (failed(rows) || loading());
    return heading("Registro de ações", isAdmin ? "Tudo o que os consultores fizeram: cadastros, cotações, liberações, senhas e acessos em modo suporte." : "Tudo o que você fez nas lojas e nas cotações.") + `<section class="card table-card">${auditTable(rows)}</section>`;
  }

  // ---------------------------------------------------------------------------
  // Estrutura
  function credentialModal() {
    const c = ui.credential;
    if (!c) return "";
    return `<div class="modal-overlay centered"><section class="tour-card credential-card" role="dialog" aria-modal="true" aria-labelledby="cred-title"><h2 id="cred-title">${esc(c.title)}</h2><p>Envie estes dados para ${esc(c.who)}. A senha é provisória: ${esc(c.who)} cria a própria senha no primeiro acesso. <b>Ela não aparece de novo.</b></p><dl class="facts"><dt>Endereço</dt><dd>${esc(new URL("../login.php", location.href).href)}</dd><dt>E-mail</dt><dd>${esc(c.email)}</dd><dt>Senha provisória</dt><dd><code>${esc(c.senha)}</code></dd></dl><div class="tour-actions"><button type="button" class="btn" data-copy-credential>Copiar dados</button><button type="button" class="btn primary" data-close-credential>${c.next ? "Abrir a loja" : "Fechar"}</button></div></section></div>`;
  }
  function sidebar() {
    const c = ui.counts;
    const counts = {
      contatos: c.contatos ?? ui.data.resumo?.contatos_novos,
      chamados: c.nao_lidas || c.chamados || ui.data.resumo?.chamados_abertos,
      cotacoes: isAdmin ? c.cotacoes : 0,
    };
    const hot = { chamados: c.nao_lidas > 0, cotacoes: c.cotacoes > 0 };
    const link = (id) => {
      const active = ui.page === id || (id === "lojas" && ui.page === "loja") || (id === "chamados" && ui.page === "chamado") || (id === "cotacoes" && ui.page === "cotacao");
      return `<a href="#${id}" class="${active ? "active" : ""}" ${active ? 'aria-current="page"' : ""}><span>${pages[id]}</span>${counts[id] ? `<span class="nav-badge ${hot[id] ? "hot" : ""}">${counts[id]}</span>` : ""}</a>`;
    };
    const sound = window.WedTechAlerts?.soundOn();
    return `<aside class="sidebar expanded"><div class="brand"><span class="mark"><img src="../frontend/img/modulos/wedtech-symbol.png" alt="" width="48" height="48"></span><span class="wordmark"><b>Wed</b>Tech</span></div><div class="brand-sub">Área do consultor</div><nav class="nav">${nav
      .map(([label, ids]) => `<div class="nav-label">${label}</div>${ids.map(link).join("")}`)
      .join("")}</nav><div class="sidebar-bottom"><div><span class="dot"></span>${esc(me.nome)} · ${isAdmin ? "Administrador" : "Consultor"}</div><button type="button" class="link side-link" data-toggle-sound aria-pressed="${!!sound}">${sound ? "🔔 Som dos avisos ligado" : "🔕 Som dos avisos desligado"}</button><a class="link side-link" href="../trocar-senha.php?conta=equipe">🔑 Trocar senha</a><a class="link side-link" href="../logout.php?conta=equipe">⏻ Sair</a></div></aside>`;
  }
  function content() {
    switch (ui.page) {
      case "contatos": return contatosPage();
      case "cotacoes": return cotacoesPage();
      case "cotacao": return cotacaoPage(ui.id);
      case "lojas": return lojasPage();
      case "loja": return lojaPage(ui.id);
      case "nova-loja": return novaLojaPage();
      case "chamados": return chamadosPage();
      case "chamado": return chamadoPage(ui.id);
      case "precos": return precosPage();
      case "consultores": return consultoresPage();
      case "historico": return historicoPage();
      default: return inicioPage();
    }
  }
  // Refazer a tela não pode apagar o que a pessoa está digitando: guarda o foco, a posição do
  // cursor e os campos já editados, e devolve tudo depois de redesenhar.
  function render() {
    const active = document.activeElement;
    const focusId = active?.id && $("#app")?.contains(active) ? active.id : null;
    let caret = null;
    try {
      if (focusId && typeof active.selectionStart === "number") caret = [active.selectionStart, active.selectionEnd];
    } catch {}
    const oldThread = $(".ticket-thread");
    const stickToBottom = !oldThread || oldThread.scrollHeight - oldThread.scrollTop - oldThread.clientHeight < 60;
    const title = detailPages[ui.page] || pages[ui.page] || pages.inicio;
    $("#app").innerHTML = `<div class="layout">${sidebar()}<div class="workspace"><header class="topbar"><div class="crumb"><span class="muted">Área do consultor</span><span class="separator muted">/</span><span>${esc(title)}</span></div></header><main id="main-content">${ui.options ? content() : loading()}</main></div></div>${credentialModal()}`;
    for (const [id, value] of Object.entries(ui.fields)) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = value;
      else if (el.value !== value) el.value = value;
    }
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el && !el.disabled) {
        el.focus({ preventScroll: true });
        try {
          if (caret) el.setSelectionRange(caret[0], caret[1]);
        } catch {}
      }
    }
    const thread = $(".ticket-thread");
    if (thread && stickToBottom) thread.scrollTop = thread.scrollHeight;
  }
  function route() {
    const hash = decodeURIComponent(location.hash.slice(1)) || "inicio";
    const [page, id] = hash.split("/");
    const prev = ui.page + "/" + ui.id;
    ui.page = detailPages[page] ? page : pages[page] ? page : "inicio";
    ui.id = id && id !== "nova" ? Number(id) : null;
    if (ui.page + "/" + ui.id !== prev) ui.fields = {};
    // Telas de detalhe sempre abrem com os dados mais recentes
    if (detailPages[ui.page] && ui.id) delete ui.data[ui.page + "/" + ui.id];
    if (ui.page !== "nova-loja") ui.prefill = null;
    if (ui.page !== "loja" || ui.contract?.id !== ui.id) ui.contract = null;
    if (ui.page !== "cotacao") ui.quote = null;
    else if (ui.id && ui.quote?.id !== ui.id) ui.quote = null;
    render();
    window.scrollTo(0, 0);
  }
  function go(target) {
    const [page, filter] = target.split(":");
    if (page === "lojas") ui.storeFilter = filter || "";
    if (location.hash === "#" + page) route();
    else location.hash = page;
  }
  function newQuote(prefill) {
    ui.quote = blankQuote(prefill);
    if (location.hash === "#cotacao/nova") route();
    else location.hash = "cotacao/nova";
  }
  async function saveQuote() {
    const q = ui.quote;
    const r = await api("salvar_cotacao", { id: q.id || undefined, body: { lead_id: q.lead_id, cliente: q.cliente, config: q.config, observacoes: q.observacoes } });
    ui.data["cotacao/" + r.id] = r;
    ui.meta["cotacao/" + r.id] = ["cotacao", r.id];
    ui.quote = quoteFromData(r);
    invalidate("cotacoes");
    return r;
  }
  function openSaved(r) {
    if (location.hash !== "#cotacao/" + r.id) {
      history.replaceState(null, "", "#cotacao/" + r.id);
      ui.id = r.id;
    }
    ui.fields = {};
    render();
  }

  // ---------------------------------------------------------------------------
  // Eventos
  document.addEventListener("click", async (e) => {
    const el = e.target.closest("button, a[data-go]");
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (d.go) return go(d.go);
    if (d.leadTab) {
      ui.leadTab = d.leadTab;
      return render();
    }
    if (d.ticketTab) {
      ui.ticketTab = d.ticketTab;
      return render();
    }
    if (d.quoteTab) {
      ui.quoteTab = d.quoteTab;
      return render();
    }
    if ("storeFilter" in d) {
      ui.storeFilter = d.storeFilter;
      return render();
    }
    if ("leadEdit" in d) {
      ui.editingLead = d.leadEdit ? Number(d.leadEdit) : null;
      return render();
    }
    if (d.leadConvert) {
      const l = (ui.data.contatos || []).find((x) => x.id === Number(d.leadConvert));
      ui.prefill = l ? { lead_id: l.id, nome: l.loja, responsavel: l.nome, email: l.email, whatsapp: l.whatsapp, cnpj: l.cnpj, tipo: l.ramo, endereco: l.cidade, observacoes: l.notas } : null;
      location.hash = "nova-loja";
      return;
    }
    if (d.leadQuote) {
      const l = (ui.data.contatos || []).find((x) => x.id === Number(d.leadQuote));
      if (!l) return newQuote();
      // Canais pedidos pelo cliente que existem no ramo escolhido
      const tipo = l.ramo || "moda";
      const allowed = ui.options.canais_por_ramo[tipo] || [];
      const canais = (l.canais_ids || []).filter((c) => allowed.includes(c));
      return newQuote({
        lead_id: l.id,
        nome: l.nome,
        loja: l.loja,
        email: l.email,
        whatsapp: l.whatsapp,
        cnpj: l.cnpj,
        endereco: l.cidade,
        tipo,
        canais: canais.length ? canais : undefined,
        lojas: l.lojas ?? undefined,
        produtos: l.produtos ?? undefined,
      });
    }
    if ("newQuote" in d) return newQuote();
    if ("toggleSound" in d) {
      window.WedTechAlerts?.setSound(!WedTechAlerts.soundOn());
      if (WedTechAlerts.soundOn()) WedTechAlerts.chime();
      return render();
    }
    if (d.copy) {
      try {
        await navigator.clipboard.writeText(d.copy);
        toast("Link copiado.");
      } catch {
        $("#qt-link")?.select();
        toast("Selecione o link e copie com Ctrl + C.");
      }
      return;
    }

    // Contrato (rascunho local até salvar)
    const store = ui.page === "loja" ? ui.data["loja/" + ui.id] : null;
    if (store && d.planPick) {
      const dr = touchContract(store);
      const o = ui.options;
      const old = dr.plano;
      for (const k of Object.keys(o.modulos)) {
        const wasExtra = dr.modulos[k] && !o.modulos_padrao[old][k];
        dr.modulos[k] = !!o.modulos_padrao[d.planPick][k] || wasExtra;
      }
      for (const k of Object.keys(o.limites_padrao[old])) {
        const extra = Math.max(0, Number(dr.limites[k]) - o.limites_padrao[old][k]);
        dr.limites[k] = o.limites_padrao[d.planPick][k] + extra;
      }
      dr.plano = d.planPick;
      return render();
    }
    if (store && d.moduleSet) {
      const [k, mode] = d.moduleSet.split(":");
      touchContract(store).modulos[k] = mode === "extra";
      return render();
    }
    if (store && d.limitStep) {
      const [k, step] = d.limitStep.split(":");
      const dr = touchContract(store);
      const base = ui.options.limites_padrao[dr.plano][k];
      dr.limites[k] = Math.max(base, Math.min(50, Number(dr.limites[k]) + Number(step)));
      return render();
    }
    if (store && d.useTablePrice) {
      touchContract(store).valor_mensal = Number(d.useTablePrice).toFixed(2);
      return render();
    }
    if (store && "contractReset" in d) {
      ui.contract = null;
      return render();
    }
    if (store && d.contractSave) {
      const dr = contractDraft(store);
      const losses = contractChanges(store, dr).filter(([, tone]) => tone === "loss");
      if (losses.length && !confirm("Atenção, o lojista vai perder acesso:\n\n• " + losses.map(([t]) => t).join("\n• ") + "\n\nSalvar mesmo assim?")) return;
      const body = { plano: dr.plano, situacao: dr.situacao, valor_mensal: dr.valor_mensal, teste_ate: dr.teste_ate, limites: dr.limites, modulos: dr.modulos, observacoes: dr.observacoes };
      if (isAdmin) body.consultor_id = dr.consultor_id;
      const r = await run(() => api("atualizar_loja", { id: store.id, body }), "Contrato salvo. O painel da loja já está aplicando as mudanças.");
      if (r) {
        ui.data["loja/" + store.id] = r;
        ui.contract = null;
        invalidate("lojas", "resumo");
        render();
      }
      return;
    }

    // Cotação
    const q = ui.page === "cotacao" ? ui.quote : null;
    if (q && d.quoteChannel) {
      const list = q.config.canais;
      q.config.canais = list.includes(d.quoteChannel) ? list.filter((c) => c !== d.quoteChannel) : [...list, d.quoteChannel];
      render();
      return recalc(0);
    }
    if (q && d.quoteModule) {
      q.config.modulos = { ...q.config.modulos, [d.quoteModule]: !q.config.modulos[d.quoteModule] };
      render();
      return recalc(0);
    }
    if (q && ("quoteSave" in d || "quoteSend" in d)) {
      const sending = "quoteSend" in d;
      const r = await run(async () => {
        const saved = await saveQuote();
        if (!sending) return saved;
        const sent = await api("enviar_cotacao", { id: saved.id, body: {} });
        ui.data["cotacao/" + sent.id] = sent;
        return sent;
      }, (res) => (!sending ? "Cotação salva." : res.status === "aprovacao" ? "Enviada para aprovação do administrador." : "Proposta pronta: copie o link ou envie pelo WhatsApp."));
      if (r) openSaved(r);
      return;
    }
    if (q && "quoteStore" in d) {
      const data = ui.data["cotacao/" + q.id];
      ui.prefill = {
        quote_id: data.id,
        lead_id: data.lead_id || "",
        nome: data.cliente.loja,
        responsavel: data.cliente.nome,
        email: data.cliente.email,
        whatsapp: data.cliente.whatsapp,
        cnpj: data.cliente.cnpj,
        tipo: q.config.tipo,
        plano: data.plano,
        valor_mensal: Number(data.mensal_total).toFixed(2),
        teste_dias: q.config.teste_dias,
        observacoes: `Cotação #${data.id} aceita por ${data.aceite_nome}.`,
      };
      location.hash = "nova-loja";
      return;
    }
    if (q && "quoteCopy" in d) {
      const copy = { ...blankQuote(), cliente: { ...q.cliente }, config: { ...q.config, canais: [...q.config.canais], modulos: { ...q.config.modulos } }, lead_id: q.lead_id, observacoes: q.observacoes };
      ui.quote = copy;
      if (location.hash === "#cotacao/nova") route();
      else location.hash = "cotacao/nova";
      ui.quote = copy;
      return;
    }

    if (d.support) {
      const r = await run(() => api("suporte_iniciar", { id: d.support, body: {} }));
      if (r) location.href = new URL(r.redirect, location.href).href;
      return;
    }
    if (d.resetPassword) {
      if (!confirm("Gerar uma nova senha provisória para o lojista? A senha atual deixa de funcionar.")) return;
      const b = ui.data["loja/" + d.resetPassword];
      const r = await run(() => api("redefinir_senha", { id: d.resetPassword, body: {} }), "Nova senha provisória gerada.");
      if (r) {
        ui.credential = { title: "Nova senha provisória", who: b?.dono_nome || "o lojista", email: b?.dono_email || "", senha: r.senha_provisoria };
        delete ui.data["loja/" + d.resetPassword];
        render();
      }
      return;
    }
    if ("copyCredential" in d) {
      const c = ui.credential;
      const text = `Acesso WedTech\nEndereço: ${new URL("../login.php", location.href).href}\nE-mail: ${c.email}\nSenha provisória: ${c.senha}`;
      try {
        await navigator.clipboard.writeText(text);
        toast("Dados copiados.");
      } catch {
        toast("Não foi possível copiar: selecione e copie manualmente.");
      }
      return;
    }
    if ("closeCredential" in d) {
      const next = ui.credential?.next;
      ui.credential = null;
      if (next) return go(next);
      return render();
    }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.id || !$("#main-content")?.contains(el)) return;
    const value = el.type === "checkbox" ? el.checked : el.value;
    if (el.id === "store-q") {
      ui.storeQuery = el.value;
      return render();
    }
    // Contrato: o resumo e "o que muda" acompanham a digitação
    if (el.dataset.draft && ui.page === "loja") {
      touchContract(ui.data["loja/" + ui.id])[el.dataset.draft] = value;
      return render();
    }
    // Cotação: cliente só guarda; números, ramo e plano recalculam o preço
    if (el.dataset.q && ui.quote) {
      const [group, key] = el.dataset.q.split(".");
      if (!key) ui.quote[group] = value;
      else if (group === "cliente") {
        ui.quote.cliente[key] = value;
        // Os botões de WhatsApp e e-mail acompanham o número e o endereço digitados
        if (key === "whatsapp" || key === "email") render();
      }
      else {
        const numeric = ["lojas", "produtos", "desconto", "teste_dias"].includes(key);
        ui.quote.config[key] = numeric ? (value === "" ? 0 : Number(value)) : value;
        if (key === "tipo") {
          // Trocar o ramo mantém só os canais que existem no novo ramo
          const allowed = ui.options.canais_por_ramo[value] || [];
          ui.quote.config.canais = ui.quote.config.canais.filter((c) => allowed.includes(c));
          render();
        }
        recalc(numeric ? 300 : 0);
      }
      return;
    }
    ui.fields[el.id] = value;
  });
  // Ctrl + Enter envia a resposta do chamado
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.id === "tk-texto") {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target;
    e.preventDefault();
    const v = (name) => f.elements[name]?.value ?? "";
    if (f.id === "lead-form") {
      const ok = await run(() => api("contato", { id: f.dataset.id, body: { status: v("status"), notas: v("notas") } }), "Contato atualizado.");
      if (ok) {
        clearFields(f);
        ui.editingLead = null;
        invalidate("contatos", "resumo");
        render();
      }
    }
    if (f.id === "new-store-form") {
      const body = Object.fromEntries(["nome", "tipo", "cnpj", "endereco", "responsavel", "email", "whatsapp", "plano", "valor_mensal", "teste_dias", "consultor_id", "observacoes"].map((k) => [k, v(k)]));
      if (f.dataset.lead) body.lead_id = f.dataset.lead;
      if (f.dataset.quote) body.quote_id = f.dataset.quote;
      const r = await run(() => api("criar_loja", { body }), "Loja cadastrada.");
      if (r) {
        clearFields(f);
        invalidate();
        ui.prefill = null;
        ui.credential = { title: "Loja cadastrada! Acesso do lojista", who: body.responsavel, email: r.email, senha: r.senha_provisoria, next: "loja/" + r.business_id };
        render();
      }
    }
    if (f.id === "ticket-form") {
      if (!v("texto").trim() && !v("status")) return toast("Escreva a resposta.");
      const r = await run(() => api("responder_chamado", { id: f.dataset.id, body: { texto: v("texto"), status: v("status") } }), "Resposta enviada ao lojista.");
      if (r) {
        clearFields(f);
        ui.data["chamado/" + f.dataset.id] = r;
        invalidate("chamados", "resumo");
        render();
        $("#tk-texto")?.focus();
      }
    }
    if (f.id === "consultant-form") {
      const r = await run(() => api("criar_consultor", { body: { nome: v("nome"), email: v("email") } }), "Consultor cadastrado.");
      if (r) {
        clearFields(f);
        ui.credential = { title: "Consultor cadastrado", who: v("nome"), email: r.email, senha: r.senha_provisoria };
        invalidate("consultores");
        ui.options = await api("opcoes");
        render();
      }
    }
    if (f.id === "prices-form") {
      const o = ui.options;
      const body = {
        planos: Object.fromEntries(Object.keys(o.planos).map((k) => [k, v("pl-" + k)])),
        canais: Object.fromEntries(Object.keys(o.canais).map((k) => [k, { mensal: v("cm-" + k), cadastro: v("cc-" + k) }])),
        modulos: Object.fromEntries(Object.keys(o.modulos).map((k) => [k, v("md-" + k)])),
        loja_extra: v("loja_extra"),
        implantacao: v("implantacao"),
        desconto_max: v("desconto_max"),
        validade_dias: v("validade_dias"),
        empresa: Object.fromEntries(["razao", "cnpj", "endereco", "email", "foro"].map((k) => [k, v("em-" + k)])),
      };
      const r = await run(() => api("salvar_precos", { body }), "Tabela de preços salva. Vale para as próximas cotações.");
      if (r) {
        clearFields(f);
        ui.options.precos = r;
        render();
      }
    }
  });
  window.addEventListener("hashchange", route);

  // Início: opções (planos, ramos, preços) e primeira página; depois, a consulta de novidades
  (async () => {
    try {
      ui.options = await api("opcoes");
    } catch (err) {
      ui.options = null;
      toast(err.message);
    }
    need("resumo", "resumo");
    route();
    pulse();
    setInterval(pulse, 3000);
    document.addEventListener("visibilitychange", () => !document.hidden && pulse());
  })();
})();
