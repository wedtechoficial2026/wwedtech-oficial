"use strict";
// Automações — as regras que a IA executa sozinha (liga/desliga) e o histórico
// de tudo o que ela fez. É aqui que IoT + IA + automação aparecem juntas.

function automacoesPage() {
  const count = (id) => state.automationLog.filter((l) => l.rule === id).length;
  const rule = (id) => W.automationRules.find((r) => r.id === id);
  return (
    heading(
      "Automações",
      "Regras que a WedTech AI executa sozinha para você não vender sem estoque nem perder venda.",
      `<button class="btn" data-action="toggle-live">${ui.live ? "⏸ Pausar operação ao vivo" : "▶ Operação ao vivo"}</button><button class="btn" data-action="advance-time" ${ui.busy ? "disabled" : ""}>⏩ Avançar 48 h (simulação)</button>`,
    ) +
    `<div class="rules-grid">${W.automationRules
      .map((r) => {
        const on = state.automations[r.id];
        return `<section class="card rule ${on ? "" : "off"}"><div class="rule-head"><span class="rule-icon">${r.icon}</span><h2>${esc(r.title)}</h2><label class="toggle big" title="${on ? "Desligar" : "Ligar"}"><input type="checkbox" data-automation="${r.id}" ${on ? "checked" : ""} aria-label="${esc(r.title)}"><span></span></label></div><p>${esc(r.desc)}</p><small>${on ? "Ligada" : "Desligada"} · ${plural(count(r.id), "vez", "vezes")} hoje</small></section>`;
      })
      .join("")}</div>` +
    `<section class="card"><div class="section-head"><div><h2>O que a IA fez por você</h2><p>Histórico das automações, do mais recente para o mais antigo.</p></div>${badge(plural(state.automationLog.length, "ação", "ações"), "neutral")}</div>${
      state.automationLog.length
        ? `<ol class="timeline">${state.automationLog
            .slice(0, 25)
            .map((l) => `<li><span class="tl-icon">${rule(l.rule)?.icon || (l.rule === "devolucao" ? "↩️" : "✧")}</span><div>${esc(l.text)}<small>${esc(rule(l.rule)?.title || "")} · ${esc(ago(l.ts))}</small></div></li>`)
            .join("")}</ol>`
        : emptyBox("Nenhuma automação executada ainda.")
    }</section>` +
    `<section class="card"><div class="section-head"><div><h2>💬 Mensagens enviadas no WhatsApp</h2><p>Avisos automáticos para clientes e fornecedores (simulados).</p></div></div>${
      state.messages.length
        ? state.messages
            .slice(0, 6)
            .map((m) => `<div class="wa-bubble">${esc(m.text)}<small>Para ${esc(m.to)}${m.phone ? " · " + esc(m.phone) : ""} · ${esc(ago(m.ts))}</small></div>`)
            .join("")
        : emptyBox("Nenhuma mensagem enviada ainda.")
    }</section>`
  );
}
