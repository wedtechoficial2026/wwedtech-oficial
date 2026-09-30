// Calendário comercial brasileiro e sazonalidade por tipo de loja.
// "impact" = quantas vezes as vendas aumentam no pico (1.5 = +50%), por tipo de loja.
// "windowDays" = quantos dias antes da data (incluindo o dia) o pico de vendas dura.
// Os números são estimativas demonstrativas para o protótipo.
(function (global) {
  "use strict";

  // n-ésimo dia da semana do mês (weekday: 0 = domingo), mês 0-based
  function nthWeekday(year, month, weekday, n) {
    const first = new Date(year, month, 1).getDay();
    return new Date(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  // Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
  function easter(year) {
    const a = year % 19,
      b = Math.floor(year / 100),
      c = year % 100,
      d = Math.floor(b / 4),
      e = b % 4,
      f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4),
      k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31),
      day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function events(year) {
    const blackFriday = nthWeekday(year, 10, 4, 4); // 4ª quinta de novembro...
    blackFriday.setDate(blackFriday.getDate() + 1); // ...e a sexta seguinte
    return [
      { key: "volta-aulas", name: "Volta às aulas", emoji: "🎒", date: new Date(year, 1, 2), windowDays: 20, impact: { moda: 1.3, alimentacao: 1.1, eletronicos: 1.4 }, tip: "Mochilas, tênis, fones e carregadores saem mais." },
      { key: "pascoa", name: "Páscoa", emoji: "🐰", date: easter(year), windowDays: 14, impact: { moda: 1.1, alimentacao: 2.2, eletronicos: 1.0 }, tip: "Chocolates e doces artesanais têm o maior pico do ano." },
      { key: "maes", name: "Dia das Mães", emoji: "💐", date: nthWeekday(year, 4, 0, 2), windowDays: 10, impact: { moda: 1.9, alimentacao: 1.5, eletronicos: 1.6 }, tip: "Segunda melhor data do varejo: presentes de moda e kits." },
      { key: "namorados", name: "Dia dos Namorados", emoji: "❤️", date: new Date(year, 5, 12), windowDays: 7, impact: { moda: 1.5, alimentacao: 1.5, eletronicos: 1.5 }, tip: "Kits de presente e embalagens especiais vendem mais." },
      { key: "junina", name: "Festa Junina", emoji: "🌽", date: new Date(year, 5, 24), windowDays: 20, impact: { moda: 1.1, alimentacao: 1.8, eletronicos: 1.0 }, tip: "Doces, milho, amendoim e bebidas quentes." },
      { key: "pais", name: "Dia dos Pais", emoji: "👔", date: nthWeekday(year, 7, 0, 2), windowDays: 10, impact: { moda: 1.5, alimentacao: 1.2, eletronicos: 1.7 }, tip: "Eletrônicos e acessórios lideram." },
      { key: "cliente", name: "Dia do Cliente", emoji: "🤝", date: new Date(year, 8, 15), windowDays: 3, impact: { moda: 1.3, alimentacao: 1.3, eletronicos: 1.3 }, tip: "Boa data para cupons no WhatsApp e no site." },
      { key: "criancas", name: "Dia das Crianças", emoji: "🧸", date: new Date(year, 9, 12), windowDays: 7, impact: { moda: 1.5, alimentacao: 1.6, eletronicos: 1.9 }, tip: "Presentes, doces e eletrônicos pequenos disparam." },
      { key: "black-friday", name: "Black Friday", emoji: "🖤", date: blackFriday, windowDays: 5, impact: { moda: 2.4, alimentacao: 1.8, eletronicos: 2.8 }, tip: "O maior pico dos marketplaces. Prepare o estoque com antecedência." },
      { key: "natal", name: "Natal", emoji: "🎄", date: new Date(year, 11, 25), windowDays: 20, impact: { moda: 2.2, alimentacao: 2.3, eletronicos: 2.3 }, tip: "Pico longo: dezembro inteiro vende mais." },
    ].map((e) => ({ ...e, id: e.key + "-" + year }));
  }

  // Índice de vendas por mês (1,0 = mês médio), por tipo de loja
  const monthly = {
    moda: [0.8, 0.85, 0.9, 0.95, 1.2, 1.05, 0.95, 1.05, 0.9, 1.0, 1.3, 1.6],
    alimentacao: [0.9, 0.9, 1.0, 1.4, 1.05, 1.2, 1.0, 0.95, 0.9, 1.0, 1.1, 1.6],
    eletronicos: [0.85, 1.1, 0.9, 0.9, 1.15, 1.05, 0.95, 1.15, 0.9, 1.1, 1.5, 1.6],
  };
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const api = { events, monthly, months, easter, nthWeekday };
  if (typeof module !== "undefined") module.exports = api;
  global.WedTechCalendario = api;
})(typeof window !== "undefined" ? window : globalThis);
