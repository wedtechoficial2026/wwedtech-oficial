"use strict";
// WedTech AI — conversa com a assistente (respostas locais a partir dos dados atuais).

const suggestions = [
  "O que eu faço agora?",
  "Tenho risco de ficar sem estoque?",
  "Quais anúncios estão pausados?",
  "Tenho pedidos de compra em aberto?",
  "Quem vem retirar na loja?",
  "Tenho produtos parados?",
  "Qual meu lucro hoje?",
  "Tem produto vencendo?",
  "Como está a grade de tamanhos?",
  "Qual preço usar em cada canal?",
  "Como foi o resultado da última data?",
  "Resuma meu dia.",
];

function aiPage(m) {
  return (
    heading("WedTech AI", "Sua assistente para as decisões do dia a dia da loja.", badge("✧ IA local · funciona offline", "neutral")) +
    `<div class="ai-layout"><section class="card chat"><div class="chat-hello"><span class="spark">✧</span><h2>Olá! Sou a WedTech AI.</h2><p>Acompanho seu estoque, seus pedidos e seus canais o tempo todo. Pergunte do seu jeito, como numa conversa.</p></div><div class="suggestions">${suggestions
      .map((s, i) => `<button data-ask="${i}" ${ui.busy ? "disabled" : ""}>${s}</button>`)
      .join("")}</div><div class="messages" aria-live="polite">${ui.chat
      .map((c) => `<div class="message ${c.role}"><small>${c.role === "user" ? "Você" : "✧ WedTech AI"}</small>${esc(c.text)}</div>`)
      .join("")}${ui.busy ? '<div class="message"><span class="spin"></span>Analisando sua loja...</div>' : ""}</div><form class="chat-form" id="chat-form"><input name="question" placeholder="Pergunte sobre sua loja..." aria-label="Pergunta para a WedTech AI" required maxlength="500" ${ui.busy ? "disabled" : ""}><button class="btn primary" ${ui.busy ? "disabled" : ""} aria-label="Enviar pergunta">Enviar ↑</button></form><p class="caption">Respostas geradas a partir dos dados atuais da demonstração.</p></section><aside class="card ai-context"><div class="wedtech-label">O QUE EU ESTOU VENDO</div>${[
      ["Vendas hoje", money(m.revenue)],
      ["Pedidos em aberto", m.openOrders],
      ["Disponível para vender", m.unitsDisponiveis + " un."],
      ["Produtos acabando", m.atRisk],
      ["Anúncios pausados", m.locked],
      ["Canais conectados", m.connected],
    ]
      .map(([l, v]) => `<div class="context-item">${l}<strong>${v}</strong></div>`)
      .join("")}<div class="validation ok">✓ Dados atualizados em tempo real</div></aside></div>`
  );
}
