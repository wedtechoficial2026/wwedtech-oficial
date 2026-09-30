"use strict";
// Notificações — todos os avisos num lugar só. Clicar leva para a área que resolve o assunto.

const notifTypes = {
  venda: ["🛒", "Vendas e devoluções"],
  pedido: ["📦", "Pedidos"],
  despacho: ["🚚", "Envios"],
  compra: ["🧾", "Compras"],
  estoque: ["📡", "Estoque"],
  canal: ["🔌", "Canais"],
};
const notifIcon = (type) => notifTypes[type]?.[0] || "🔔";

function notificacoesPage() {
  const all = state.notifications;
  const unread = all.filter((n) => !n.read).length;
  const onlyUnread = ui.notifFilter !== "todas";
  const list = all.filter((n) => (!onlyUnread || !n.read) && (!ui.notifType || n.type === ui.notifType));
  const types = [...new Set(all.map((n) => n.type))].filter((t) => notifTypes[t]);
  return (
    heading(
      "Notificações",
      unread ? `Você tem ${plural(unread, "aviso novo", "avisos novos")}. Clique em um aviso para ir direto ao assunto.` : "Nenhum aviso novo. Clique em um aviso para ir direto ao assunto.",
      `<button class="btn" data-action="toggle-sound" aria-pressed="${!!window.WedTechAlerts?.soundOn()}">${window.WedTechAlerts?.soundOn() ? "🔔 Som ligado" : "🔕 Som desligado"}</button>` +
        (unread ? `<button class="btn" data-action="notif-read-all">✓ Marcar todas como lidas</button>` : ""),
    ) +
    `<div class="tabs" role="tablist"><button type="button" role="tab" class="tab ${onlyUnread ? "active" : ""}" aria-selected="${onlyUnread}" data-notif-filter="novas">Não lidas${unread ? ` <span class="tab-count">${unread}</span>` : ""}</button><button type="button" role="tab" class="tab ${onlyUnread ? "" : "active"}" aria-selected="${!onlyUnread}" data-notif-filter="todas">Todas</button></div>` +
    (types.length > 1
      ? `<div class="chips notif-chips"><button type="button" class="chip ${ui.notifType ? "" : "active"}" data-notif-type="">Todos os assuntos</button>${types
          .map((t) => `<button type="button" class="chip ${ui.notifType === t ? "active" : ""}" data-notif-type="${t}">${notifTypes[t][0]} ${notifTypes[t][1]}</button>`)
          .join("")}</div>`
      : "") +
    `<section class="card notif-list">${
      list.length
        ? list
            .map(
              (n) =>
                `<button type="button" class="notif-row ${n.read ? "" : "unread"}" data-notif="${n.id}"><span class="notif-icon">${notifIcon(n.type)}</span><span class="notif-text">${esc(n.text)}<small>${esc(ago(n.ts))}${n.route ? " · " + esc(routes[n.route] || (n.route.startsWith("canal/") ? "Canal" : "")) : ""}</small></span>${n.read ? "" : '<span class="notif-dot" aria-label="não lida"></span>'}<span class="notif-go">→</span></button>`,
            )
            .join("")
        : emptyBox(onlyUnread ? "Tudo lido! Nenhum aviso novo. 🎉" : "Nenhuma notificação por enquanto.")
    }</section>`
  );
}
