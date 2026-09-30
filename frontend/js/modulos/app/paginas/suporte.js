"use strict";
// Suporte — o lojista fala com o consultor WedTech dele: abre chamados e acompanha as respostas.
// Os chamados ficam no servidor (api/suporte.php), fora do estado da loja.
// Tempo real: a cada poucos segundos o painel confere se o consultor respondeu; a resposta
// entra na conversa aberta e, em qualquer outra tela, vira uma janela flutuante com som.

const supportStatus = { aberto: ["Aberto", "warn"], em_atendimento: ["Em atendimento", "neutral"], resolvido: ["Resolvido", ""] };
const supportEndpoint = () => new URL("../api/suporte.php", location.href);
const supportTime = (v) => new Date(v.replace(" ", "T") + "Z");

async function supportRequest(query = "", body = null) {
  const url = supportEndpoint();
  for (const [k, v] of new URLSearchParams(query)) url.searchParams.set(k, v);
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.erro || "Não foi possível falar com o suporte agora.");
  return result.dados;
}
async function loadSupport() {
  ui.supportLoading = true;
  try {
    ui.supportData = await supportRequest();
    ui.supportError = "";
  } catch (err) {
    ui.supportError = err.message;
  }
  ui.supportLoading = false;
  if (ui.page === "suporte") showSupportUpdate();
}
// Conversa aberta: marca as respostas do consultor como lidas (o contador do menu zera)
function markSupportRead(ticketId) {
  if (READONLY || !ticketId) return;
  const t = ui.supportData?.chamados?.find((x) => x.id === ticketId);
  if (t && !t.nao_lidas) return;
  if (t) t.nao_lidas = 0;
  supportRequest("acao=lido&id=" + ticketId, {})
    .then(() => pollSupport())
    .catch(() => {});
}

function suportePage() {
  if (!ui.supportData && !ui.supportLoading && !ui.supportError) loadSupport();
  const data = ui.supportData;
  const consultant = data?.consultor || state.account?.consultant;
  const tickets = data?.chamados || [];
  return (
    heading("Suporte", "Fale com o seu consultor WedTech: abra um chamado e acompanhe a resposta por aqui. As respostas chegam sozinhas, sem recarregar.", `<button class="btn primary" data-action="support-new">+ Abrir chamado</button>`) +
    (consultant
      ? `<section class="card consultant-card"><span class="consultant-avatar">${esc(consultant.name.split(" ").map((w) => w[0]).slice(0, 2).join(""))}</span><div><small>Seu consultor</small><b>${esc(consultant.name)}</b><a href="mailto:${esc(consultant.email)}">${esc(consultant.email)}</a></div></section>`
      : "") +
    (ui.supportFormOpen
      ? `<section class="card"><div class="section-head"><h2>Novo chamado</h2><button class="link" data-action="support-new">Cancelar</button></div><form id="support-open-form" class="form-grid compact"><div class="field full"><label for="sup-subject">Assunto</label><input id="sup-subject" name="assunto" required minlength="3" maxlength="120" placeholder="Ex.: não consigo despachar um pedido"></div><div class="field full"><label for="sup-message">O que aconteceu?</label><textarea id="sup-message" name="mensagem" required minlength="5" maxlength="2000" rows="4" placeholder="Conte o que você estava fazendo e o que apareceu na tela"></textarea></div><div class="field full"><button class="btn primary" ${ui.busy ? "disabled" : ""}>Enviar chamado</button></div></form></section>`
      : "") +
    (ui.supportError ? `<div class="validation">⚠ ${esc(ui.supportError)}</div>` : "") +
    (ui.supportLoading && !data
      ? `<section class="card">${emptyBox("Carregando seus chamados…")}</section>`
      : tickets.length
        ? tickets.map(ticketCard).join("")
        : `<section class="card">${emptyBox("Nenhum chamado ainda. Precisa de ajuda? Clique em Abrir chamado.")}</section>`)
  );
}

function supportThread(t) {
  return t.mensagens
    .map(
      (m) =>
        `<div class="ticket-msg ${m.autor_papel === "lojista" ? "mine" : ""}"><small>${esc(m.autor || "")} · ${esc(supportTime(m.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</small>${esc(m.texto)}</div>`,
    )
    .join("");
}
function ticketCard(t) {
  const [label, tone] = supportStatus[t.status] || [t.status, "neutral"];
  const open = ui.supportTicket === t.id;
  const unread = Number(t.nao_lidas) || 0;
  return `<section class="card ticket-card"><button type="button" class="ticket-head" data-support-ticket="${t.id}" aria-expanded="${open}"><div><b>#${t.id} · ${esc(t.assunto)}</b><small>aberto em ${esc(supportTime(t.criado_em).toLocaleDateString("pt-BR"))} · ${plural(t.mensagens.length, "mensagem", "mensagens")}</small></div>${
    unread ? `<span class="badge danger">${plural(unread, "resposta nova", "respostas novas")}</span>` : ""
  }${badge(label, tone)}</button>${
    open
      ? `<div class="ticket-thread" data-thread="${t.id}" aria-live="polite">${supportThread(t)}</div><form id="support-reply-form" class="scan-form" data-id="${t.id}"><div class="field grow"><label for="sup-reply-${t.id}">${t.status === "resolvido" ? "Voltou a acontecer? Responda para reabrir" : "Responder"}</label><input id="sup-reply-${t.id}" name="texto" required maxlength="2000" autocomplete="off"></div><button class="btn primary" ${ui.busy ? "disabled" : ""}>Enviar</button></form>`
      : ""
  }</section>`;
}
// Resposta nova com o lojista digitando: atualiza só a conversa (o campo não perde o que foi escrito)
function showSupportUpdate() {
  const open = ui.supportData?.chamados?.find((t) => t.id === ui.supportTicket);
  const thread = open && document.querySelector(`[data-thread="${open.id}"]`);
  if (thread && isTyping()) {
    thread.innerHTML = supportThread(open);
    thread.lastElementChild?.scrollIntoView({ block: "nearest" });
    ui.renderDeferred = true;
  } else {
    refreshView();
  }
  if (open && document.visibilityState === "visible") markSupportRead(open.id);
}

// Consulta leve (a cada poucos segundos): contador do menu, janela com som e conversa ao vivo
let supportPulsing = false;
async function pollSupport() {
  if (supportPulsing || document.hidden || READONLY) return;
  supportPulsing = true;
  try {
    const p = await supportRequest("pulso=1");
    const unreadChanged = p.nao_lidas !== (ui.supportUnread || 0);
    ui.supportUnread = p.nao_lidas;
    // Primeira consulta só registra o que já existia; depois, cada resposta nova avisa uma vez
    const first = !ui.supportSeen;
    ui.supportSeen ||= new Set();
    const fresh = first ? [] : p.novas.filter((m) => !ui.supportSeen.has(m.id));
    p.novas.forEach((m) => ui.supportSeen.add(m.id));
    const changed = ui.supportSig !== undefined && p.sig !== ui.supportSig;
    ui.supportSig = p.sig;
    const onScreen = (m) => ui.page === "suporte" && ui.supportTicket === Number(m.ticket_id);
    const toAnnounce = fresh.filter((m) => !onScreen(m));
    if (toAnnounce.length && window.WedTechAlerts) {
      toAnnounce
        .slice(0, 3)
        .reverse()
        .forEach((m) =>
          WedTechAlerts.show({
            icon: "💬",
            title: `${m.autor || "Seu consultor"} respondeu · #${m.ticket_id}`,
            text: m.texto,
            onClick: () => {
              ui.supportTicket = Number(m.ticket_id);
              if (ui.page === "suporte") showSupportUpdate();
              else go("suporte");
              markSupportRead(Number(m.ticket_id));
            },
          }),
        );
      WedTechAlerts.chime();
    }
    if (changed && (ui.page === "suporte" || ui.supportData)) {
      await loadSupport();
    } else if (unreadChanged) {
      refreshView();
    }
  } catch {
    // Sem conexão agora: tenta de novo na próxima rodada
  }
  supportPulsing = false;
}

async function submitSupportTicket(form) {
  if (READONLY) return toast("Modo suporte: responda os chamados pela área do consultor.");
  ui.busy = true;
  render();
  try {
    const t = await supportRequest("acao=abrir", { assunto: form.elements.assunto.value, mensagem: form.elements.mensagem.value });
    ui.supportFormOpen = false;
    ui.supportTicket = t.id;
    toast("Chamado #" + t.id + " aberto. Seu consultor é avisado na hora e responde por aqui.");
    await loadSupport();
  } catch (err) {
    toast(err.message);
  }
  ui.busy = false;
  render();
}
async function submitSupportReply(form) {
  if (READONLY) return toast("Modo suporte: responda os chamados pela área do consultor.");
  ui.busy = true;
  render();
  try {
    await supportRequest("acao=responder&id=" + form.dataset.id, { texto: form.elements.texto.value });
    await loadSupport();
  } catch (err) {
    toast(err.message);
  }
  ui.busy = false;
  render();
  document.getElementById("sup-reply-" + form.dataset.id)?.focus();
}
