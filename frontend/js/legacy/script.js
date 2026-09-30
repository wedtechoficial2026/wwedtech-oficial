/* ===== ÍCONES (SVG inline, estilo feather) ===== */
const I = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  box: '<path d="M21 16V8l-9-5-9 5v8l9 5z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  // Ícones usados pelo painel clássico e pelo acesso ao painel principal.
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  balcao: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
  canais: '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/><path d="m6 6 4 4m4 0 4-4M6 18l4-4m4 0 4 4"/>',
  truck: '<path d="M3 7h11v9H3zM14 11h4l3 3v2h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/>',
  ads: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8M20 5a9 9 0 0 1 0 14"/>',
  money: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  store: '<path d="M4 10v11h16V10M3 4h18l1 6H2zM9 21v-7h6v7"/>',
};
const ico = (n, s = 18) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

/* ===== UTILITÁRIOS ===== */
const brl = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const KEY = "estoque-inteligente-v2";
const SUPORTE = {
  email: "suporte@suaempresa.com.br",
  whats: "(11) 90000-0000",
}; // edite aqui
const I18N = window.WedTechI18n;
const tr = (key) => {
  const locale = S?.cfg?.idioma || "pt-BR";
  return (I18N[locale] && I18N[locale][key]) || I18N["pt-BR"][key] || key;
};

/* ===== DADOS E ESTADO ===== */
function seedDaily() {
  return Array.from({ length: 365 }, (_, i) =>
    Math.round(900 + 350 * Math.sin(i / 9) + ((i * 7) % 13) * 35 + i * 1.2),
  );
}
const DEFAULT_ACCENT = "#1d5d91";
const BASE = {
  cfg: {
    empresa: "Minha Loja",
    imposto: 18,
    prazo: 7,
    aiEndpoint: "",
    cor: DEFAULT_ACCENT,
    idioma: "pt-BR",
    tema: "dark",
  },
  perfil: {
    nome: "Matheus",
    email: "voce@suaempresa.com.br",
    cargo: "Administrador",
  },
  produtos: [
    {
      id: 1,
      nome: "Camiseta Básica",
      sku: "CAM-001",
      qtd: 42,
      min: 20,
      preco: 59.9,
      vendasDia: 3.2,
    },
    {
      id: 2,
      nome: "Calça Jeans",
      sku: "CAL-002",
      qtd: 9,
      min: 15,
      preco: 139.9,
      vendasDia: 1.8,
    },
    {
      id: 3,
      nome: "Tênis Urbano",
      sku: "TEN-003",
      qtd: 6,
      min: 10,
      preco: 249.9,
      vendasDia: 1.1,
    },
    {
      id: 4,
      nome: "Boné",
      sku: "BON-004",
      qtd: 80,
      min: 15,
      preco: 39.9,
      vendasDia: 0.6,
    },
  ],
  pedidos: [],
  notas: [],
  daily: seedDaily(),
  seq: 1,
  nfSeq: 1,
};
let S = structuredClone(BASE);
let statePersistence = null;
function loadState() {
  try {
    statePersistence = window.WedTechServerState?.load("legacy", KEY) || null;
    const savedLocal = JSON.parse(localStorage.getItem(KEY) || "null");
    const saved = statePersistence ? statePersistence.data : savedLocal;
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
    S = {
      ...BASE,
      ...saved,
      cfg: { ...BASE.cfg, ...saved.cfg },
      perfil: { ...BASE.perfil, ...saved.perfil },
    };
  } catch (error) {
    console.warn("Não foi possível carregar os dados locais.", error);
  }
  if (["#c98bb9", "#123f6f", "#256fae"].includes(S.cfg.cor))
    S.cfg.cor = DEFAULT_ACCENT;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (error) {
    console.warn("Não foi possível salvar os dados locais.", error);
  }
  return window.WedTechServerState?.save("legacy", S, KEY) ?? Promise.resolve(false);
}
loadState();
if (window.CURRENT_USER) {
  S.perfil = {
    nome: window.CURRENT_USER.nome || S.perfil.nome,
    email: window.CURRENT_USER.email || S.perfil.email,
    cargo: window.CURRENT_USER.cargo || S.perfil.cargo,
  };
}
window.addEventListener("wedtech:persistence-error", (event) => toast(event.detail.message));
window.addEventListener("wedtech:persistence-conflict", (event) => toast(event.detail.message));
if (statePersistence?.conflict) {
  setTimeout(() => toast("Há alterações locais e uma versão mais recente no banco. Recarregue antes de continuar."), 0);
} else if (statePersistence?.needsSave || !statePersistence?.data) {
  save();
}
const applyTheme = () => {
  document.documentElement.style.setProperty(
    "--acc",
    S.cfg.cor || DEFAULT_ACCENT,
  );
  const tema = S.cfg.tema === "light" ? "light" : "dark";
  document.body.setAttribute("data-theme", tema);
  document.documentElement.lang = S.cfg.idioma || "pt-BR";
};
const toggleTheme = () => {
  const next = S.cfg.tema === "dark" ? "light" : "dark";
  S.cfg.tema = next;
  applyTheme();
  save();
  render();
  toast(next === "dark" ? "Modo escuro ativado." : "Modo claro ativado.");
};

/* ===== FEEDBACK: toast e modal ===== */
function toast(m) {
  const d = document.createElement("div");
  d.textContent = m;
  $("#toast").append(d);
  setTimeout(() => d.remove(), 3500);
}
function modal(
  titulo,
  corpo,
  { ok = "Salvar", onOk, cancel = "Cancelar" } = {},
) {
  const ov = document.createElement("div");
  ov.className = "ov";
  ov.innerHTML = `<div class="md" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><h3>${esc(titulo)}</h3>${corpo}<div class="row"><button class="g" data-x>${cancel}</button>${onOk ? `<button class="b" data-ok>${ok}</button>` : ""}</div></div>`;
  const close = () => {
    ov.remove();
    document.removeEventListener("keydown", esc_);
  };
  const esc_ = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", esc_);
  ov.onclick = (e) => {
    if (e.target === ov) close();
  };
  ov.querySelector("[data-x]").onclick = close;
  if (onOk)
    ov.querySelector("[data-ok]").onclick = () => {
      if (onOk(ov) !== false) close();
    };
  document.body.append(ov);
  (ov.querySelector("input,button.b") || ov).focus();
  return ov;
}
const confirmar = (msg, fn) =>
  modal("Confirmar", `<p class="mut">${esc(msg)}</p>`, {
    ok: "Confirmar",
    onOk: () => {
      fn();
    },
  });

/* ===== IA LOCAL (regras). Troque por chamada real em askAI() ===== */
function sumLast(n, off = 0) {
  const d = S.daily;
  return d.slice(d.length - n - off, d.length - off).reduce((a, b) => a + b, 0);
}
const sugestao = (p) =>
  Math.max(0, Math.ceil(p.vendasDia * S.cfg.prazo * 2 + p.min - p.qtd));
function insights() {
  const out = [],
    a = sumLast(30),
    b = sumLast(30, 30),
    v = ((a - b) / b) * 100;
  out.push(
    `Faturamento dos últimos 30 dias: <b>${brl(a)}</b> (<span class="${v >= 0 ? "up" : "dn"}">${v >= 0 ? "+" : ""}${v.toFixed(1)}%</span> vs. período anterior).`,
  );
  const baixos = S.produtos.filter((p) => p.qtd <= p.min);
  if (baixos.length)
    out.push(
      `<span class="wr">${baixos.length} produto(s) abaixo do mínimo:</span> ${baixos.map((p) => esc(p.nome)).join(", ")}.`,
    );
  S.produtos.forEach((p) => {
    const d = p.vendasDia > 0 ? p.qtd / p.vendasDia : 999;
    if (d < S.cfg.prazo * 1.5)
      out.push(
        `${esc(p.nome)} acaba em ~${Math.floor(d)} dias. Compra sugerida: <b>${sugestao(p)} un.</b>`,
      );
  });
  const ab = S.pedidos.filter((p) => p.status === "aberto").length;
  out.push(
    ab
      ? `Há <b>${ab}</b> pedido(s) aberto(s) aguardando finalização.`
      : "Nenhum pedido aberto no momento.",
  );
  return out;
}
async function askAI(q) {
  if (S.cfg.aiEndpoint) {
    try {
      const r = await fetch(S.cfg.aiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: q, contexto: S }),
      });
      return (await r.json()).resposta;
    } catch (e) {}
  }
  q = q.toLowerCase();
  const i = insights();
  if (/estoque|produto|repor|comprar/.test(q))
    return (
      i.filter((x) => /produto|acaba/.test(x)).join("<br>") ||
      "Estoque saudável."
    );
  if (/fatur|venda|receita/.test(q)) return i[0];
  if (/pedido/.test(q)) return i[i.length - 1];
  if (/nota|nf/.test(q))
    return `Notas emitidas: <b>${S.notas.length}</b>, total ${brl(S.notas.reduce((a, n) => a + n.total, 0))}.`;
  return i.join("<br>");
}

/* ===== TIMELINES (1D, 1W, 1M, 6M, 1Y) ===== */
let range = "1M";
const dt = (k) => new Date(Date.now() - k * 864e5);
function series(r) {
  const d = S.daily,
    n = d.length,
    L = [],
    V = [];
  if (r === "1D") {
    const w = Array.from({ length: 24 }, (_, i) =>
        Math.max(0.1, Math.sin(((i - 5) / 17) * Math.PI)),
      ),
      t = w.reduce((a, b) => a + b, 0);
    w.forEach((x, i) => {
      L.push(i + "h");
      V.push((d[n - 1] * x) / t);
    });
  } else if (r === "1W" || r === "1M") {
    const c = r === "1W" ? 7 : 30;
    for (let i = c - 1; i >= 0; i--) {
      L.push(
        dt(i).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      );
      V.push(d[n - 1 - i]);
    }
  } else if (r === "6M") {
    for (let w = 25; w >= 0; w--) {
      V.push(d.slice(n - (w + 1) * 7, n - w * 7).reduce((a, b) => a + b, 0));
      L.push(
        "Sem. de " +
          dt(w * 7).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          }),
      );
    }
  } else {
    for (let m = 11; m >= 0; m--) {
      V.push(d.slice(n - (m + 1) * 30, n - m * 30).reduce((a, b) => a + b, 0));
      L.push(dt(m * 30).toLocaleDateString("pt-BR", { month: "short" }));
    }
  }
  return { L, V };
}
const G = { W: 800, H: 240, P: 34, R: 10, B: 26, T: 10 };
function geo(V) {
  const mx = Math.max(...V) * 1.1;
  return {
    mx,
    x: (i) => G.P + (i * (G.W - G.P - G.R)) / (V.length - 1),
    y: (v) => G.H - G.B - (v / mx) * (G.H - G.B - G.T),
  };
}
function chart() {
  const { V } = series(range),
    g = geo(V),
    pts = V.map((v, i) => [g.x(i), g.y(v)]),
    line = pts
      .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
      .join("");
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (f) =>
        `<line x1="${G.P}" x2="${G.W}" y1="${g.y(g.mx * f)}" y2="${g.y(g.mx * f)}" stroke="#2a2129"/><text x="0" y="${g.y(g.mx * f) + 4}" fill="#9b8f9b" font-size="11">${Math.round((g.mx * f) / 1000)}k</text>`,
    )
    .join("");
  return `<svg id="svg" viewBox="0 0 ${G.W} ${G.H}" style="width:100%;height:auto;display:block" role="img" aria-label="Gráfico de vendas"><defs><linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".45"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs>
  ${grid}<path d="${line}L${pts.at(-1)[0]} ${G.H - G.B}L${G.P} ${G.H - G.B}Z" fill="url(#gr)"/><path d="${line}" fill="none" stroke="var(--acc)" stroke-width="2"/><circle id="dot" r="5" fill="#fff" style="display:none"/></svg>`;
}
function bindChart() {
  const svg = $("#svg");
  if (!svg) return;
  const { L, V } = series(range),
    g = geo(V),
    tip = $("#tip"),
    dot = $("#dot");
  svg.onmousemove = (e) => {
    const r = svg.getBoundingClientRect(),
      vx = ((e.clientX - r.left) / r.width) * G.W,
      i = Math.min(
        V.length - 1,
        Math.max(
          0,
          Math.round(((vx - G.P) / (G.W - G.P - G.R)) * (V.length - 1)),
        ),
      );
    dot.setAttribute("cx", g.x(i));
    dot.setAttribute("cy", g.y(V[i]));
    dot.style.display = "";
    tip.style.display = "block";
    tip.style.left = e.clientX + 12 + "px";
    tip.style.top = e.clientY - 44 + "px";
    tip.innerHTML = `${L[i]}<br><b>${brl(V[i])}</b>`;
  };
  svg.onmouseleave = () => {
    tip.style.display = "none";
    dot.style.display = "none";
  };
}

/* ===== TELAS ===== */
const getViews = () => ({
  dashboard: [tr("dashboard"), "grid"],
  estoque: [tr("stock"), "box"],
  pedidos: [tr("orders"), "cart"],
  notas: [tr("invoices"), "file"],
  relatorios: [tr("reports"), "chart"],
});
let cur = "dashboard",
  dTab = "geral",
  draft = [];
let wedIaMessages = [],
  wedIaOpen = false,
  wedIaBusy = false;
const kpi = (t, v, c = "") =>
  `<div class="card"><h3>${t}</h3><div class="big ${c}">${v}</div></div>`;
const baixosList = () => S.produtos.filter((p) => p.qtd <= p.min);

function vDashboard() {
  const locale = S.cfg.idioma || "pt-BR";
  const t = (key) => I18N[locale]?.[key] || I18N["pt-BR"][key] || key;
  const val = S.produtos.reduce((a, p) => a + p.qtd * p.preco, 0),
    bx = baixosList().length,
    ab = S.pedidos.filter((p) => p.status === "aberto").length,
    fin = S.pedidos.filter((o) => o.status === "finalizado"),
    top = [...S.produtos].sort(
      (a, b) => b.vendasDia * b.preco - a.vendasDia * a.preco,
    ),
    aiCard = `<div class="card ai"><h3>${t("aiSummary")}</h3><ul id="aiul">${insights()
      .slice(0, 4)
      .map((i) => `<li>${i}</li>`)
      .join(
        "",
      )}</ul><button class="b" onclick="go('relatorios')">${t("fullAnalysis")}</button></div>`,
    topCard = `<div class="card"><h3>${t("bestSellers")}</h3><div class="tbl"><table style="min-width:0">${top.map((p) => `<tr><td>${esc(p.nome)}</td><td>${brl(p.preco)}</td><td class="up">${(p.vendasDia * 30).toFixed(0)} un/mês</td></tr>`).join("")}</table></div></div>`,
    chartCard = `<div class="card"><div class="row" style="justify-content:space-between"><h3>${t("salesPerformance")}</h3><div class="row">${["1D", "1W", "1M", "6M", "1Y"].map((r) => `<button class="g ${r === range ? "on" : ""}" onclick="setRange('${r}')">${r}</button>`).join("")}</div></div>${chart()}</div>`,
    lowCard = `<div class="card"><h3>${t("itemsToReorder")}</h3><div class="tbl"><table style="min-width:0">${
      baixosList()
        .map(
          (p) =>
            `<tr><td>${esc(p.nome)}</td><td class="wr">${p.qtd}/${p.min}</td><td>${t("buy")} ${sugestao(p)} un.</td></tr>`,
        )
        .join("") || `<tr><td class="empty">${t("noProductsBelow")}</td></tr>`
    }</table></div></div>`;
  const tabs = `<div class="tabs">${[
    ["geral", t("overview")],
    ["vendas", t("sales")],
    ["estoque", t("stock")],
  ]
    .map(
      ([k, v]) =>
        `<button class="g ${k === dTab ? "on" : ""}" onclick="dTab='${k}';render()">${v}</button>`,
    )
    .join("")}</div>`;
  if (dTab === "vendas")
    return (
      tabs +
      `<div class="grid">${kpi(t("revenue30d"), brl(sumLast(30)))}${kpi(t("finalizedOrders"), fin.length)}${kpi(t("averageTicket"), brl(fin.length ? fin.reduce((a, o) => a + o.total, 0) / fin.length : 0))}</div><div class="two">${topCard}${aiCard}</div>${chartCard}`
    );
  if (dTab === "estoque")
    return (
      tabs +
      `<div class="grid">${kpi(t("inventoryValue"), brl(val))}${kpi(t("products"), S.produtos.length)}${kpi(t("lowStock"), bx, bx ? "wr" : "")}</div><div class="two">${lowCard}${aiCard}</div>`
    );
  return (
    tabs +
    `<div class="grid">${kpi(t("revenue30d"), brl(sumLast(30)))}${kpi(t("inventoryValue"), brl(val))}${kpi(t("openOrders"), ab)}${kpi(t("lowStock"), bx, bx ? "wr" : "")}</div><div class="two">${aiCard}${topCard}</div>${chartCard}`
  );
}
function vEstoque() {
  const locale = S.cfg.idioma || "pt-BR";
  const t = (key) => I18N[locale]?.[key] || I18N["pt-BR"][key] || key;
  return `<div class="card"><h3>${t("newProduct")}</h3><div class="row"><input id="pn_" placeholder="${t("product")}" aria-label="${t("product")}"><input id="ps" placeholder="${t("sku")}" aria-label="${t("sku")}"><input id="pq" type="number" min="0" placeholder="${t("qty")}" aria-label="${t("qty")}"><input id="pm_" type="number" min="0" placeholder="${t("min")}" aria-label="${t("min")}"><input id="pp" type="number" min="0" step="0.01" placeholder="${t("price")}" aria-label="${t("price")}"><button class="b" onclick="addProd()">${t("newProduct")}</button></div></div>
  <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:.6rem"><h3 style="margin:0">${t("products")}</h3><input placeholder="${t("searchProducts")}" oninput="filtrar(this.value)" aria-label="${t("searchProducts")}" style="flex:0 1 16rem"></div>
  <div class="tbl"><table id="tp"><tr><th>${t("product")}</th><th>${t("sku")}</th><th>${t("qty")}</th><th>${t("min")}</th><th>${t("price")}</th><th>${t("status")}</th><th>${t("suggestedPurchase")}</th><th></th></tr>
  ${
    S.produtos
      .map((p) => {
        const s = sugestao(p),
          low = p.qtd <= p.min;
        return `<tr><td>${esc(p.nome)}</td><td class="mut">${esc(p.sku)}</td><td>${p.qtd}</td><td>${p.min}</td><td>${brl(p.preco)}</td>
   <td><span class="tag ${low ? "wr" : "up"}">${low ? t("replenish") : t("ok")}</span></td><td>${s ? s + " un." : "—"}</td>
   <td style="white-space:nowrap"><button class="g" onclick="ajuste(${p.id})">${t("adjustQty")}</button> <button class="g" onclick="delProd(${p.id})">${t("delete")}</button></td></tr>`;
      })
      .join("") || ""
  }</table>
  ${S.produtos.length ? "" : '<div class="empty">' + t("emptyInventory") + "</div>"}</div></div>`;
}
function vPedidos() {
  const locale = S.cfg.idioma || "pt-BR";
  const t = (key) => I18N[locale]?.[key] || I18N["pt-BR"][key] || key;
  const tot = draft.reduce(
    (a, i) => a + i.qtd * S.produtos.find((p) => p.id === i.pid).preco,
    0,
  );
  return `<div class="card"><h3>${t("openOrder")}</h3><div class="row"><input id="oc" placeholder="${t("customer")}" aria-label="${t("customer")}"><select id="op" aria-label="${t("product")}">${S.produtos.map((p) => `<option value="${p.id}">${esc(p.nome)} (${p.qtd})</option>`).join("")}</select><input id="oq" type="number" value="1" min="1" style="flex:0 1 6rem" aria-label="${t("qty")}"><button class="g" onclick="addItem()">${t("addItem")}</button></div>
  <p class="mut" style="margin:.7rem 0">${draft.length ? draft.map((i) => `${i.qtd}× ${esc(S.produtos.find((p) => p.id === i.pid).nome)}`).join(", ") + ` — <b>${brl(tot)}</b>` : t("noItems")}</p><button class="b" onclick="abrirPedido()">${t("openOrder")}</button></div>
  <div class="card tbl"><table><tr><th>${t("orderNumber")}</th><th>${t("customer")}</th><th>Itens</th><th>${t("total")}</th><th>${t("status")}</th><th></th></tr>
  ${
    [...S.pedidos]
      .reverse()
      .map(
        (
          o,
        ) => `<tr><td>#${o.id}</td><td>${esc(o.cliente)}</td><td>${o.itens.map((i) => i.qtd + "× " + esc(i.nome)).join(", ")}</td><td>${brl(o.total)}</td>
   <td><span class="tag ${o.status === "aberto" ? "wr" : o.status === "finalizado" ? "up" : "dn"}">${o.status}</span></td>
   <td style="white-space:nowrap">${o.status === "aberto" ? `<button class="b" onclick="finalizar(${o.id})">${t("finalizeAndIssueNF")}</button> <button class="g" onclick="cancelar(${o.id})">${t("cancel")}</button>` : ""}</td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="6" class="empty">${t("noOrders")}</td></tr>`
  }</table></div>`;
}
function vNotas() {
  const locale = S.cfg.idioma || "pt-BR";
  const t = (key) => I18N[locale]?.[key] || I18N["pt-BR"][key] || key;
  return `<div class="card"><p class="mut" style="margin-bottom:.7rem">Notas em modo simulação. Para NF-e válida, conecte um emissor (ex.: Focus NFe, Nuvem Fiscal) no ponto marcado em <code>finalizar()</code>.</p><div class="tbl"><table><tr><th>${t("invoice")}</th><th>Pedido</th><th>${t("date")}</th><th>${t("customer")}</th><th>${t("total")}</th><th>ICMS</th><th></th></tr>
  ${
    [...S.notas]
      .reverse()
      .map(
        (n) =>
          `<tr><td>${n.num}</td><td>#${n.pedido}</td><td>${n.data}</td><td>${esc(n.cliente)}</td><td>${brl(n.total)}</td><td>${brl(n.icms)}</td><td><button class="g" onclick="verNF('${n.num}')">${t("view")}</button></td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="7" class="empty">${t("noInvoices")}</td></tr>`
  }</table></div></div>`;
}
function vRelatorios() {
  const locale = S.cfg.idioma || "pt-BR";
  const t = (key) => I18N[locale]?.[key] || I18N["pt-BR"][key] || key;
  const fin = S.pedidos.filter((o) => o.status === "finalizado"),
    tVal = fin.reduce((a, o) => a + o.total, 0);
  return `<div class="grid">${kpi(t("finalizedOrders"), fin.length)}${kpi("Receita (pedidos)", brl(tVal))}${kpi(t("averageTicket"), brl(fin.length ? tVal / fin.length : 0))}</div>
  <div class="card"><h3>${t("export")}</h3><div class="row"><button class="b" onclick="csv('produtos')">${t("stockCsv")}</button><button class="b" onclick="csv('pedidos')">${t("ordersCsv")}</button><button class="b" onclick="csv('notas')">${t("invoicesCsv")}</button></div></div>
  <div class="card ai"><h3>${t("completeAiAnalysis")}</h3><ul>${insights()
    .map((i) => `<li>${i}</li>`)
    .join("")}</ul></div>`;
}
const R = {
  dashboard: vDashboard,
  estoque: vEstoque,
  pedidos: vPedidos,
  notas: vNotas,
  relatorios: vRelatorios,
};
function renderWedIA() {
  return `<div class="wedia-widget">
    <section class="wedia-panel" id="wedIaPanel" role="dialog" aria-label="Wed IA" ${wedIaOpen ? "" : "hidden"}>
      <header class="wedia-head"><div><strong>Wed IA</strong><small>${tr("support")}</small></div><button class="ic" type="button" onclick="toggleWedIA()" aria-label="${tr("close")}">×</button></header>
      <div class="wedia-messages" id="wedIaMessages" aria-live="polite"></div>
      <form class="wedia-form" onsubmit="sendWedIA(event)"><input id="wedIaInput" placeholder="${tr("wedIaPlaceholder")}" aria-label="${tr("wedIaPlaceholder")}" autocomplete="off"><button class="b" id="wedIaSend" type="submit" aria-label="${tr("ask")}">↑</button></form>
    </section>
    <button class="wedia-launcher" type="button" onclick="toggleWedIA()" aria-label="Wed IA" title="Wed IA">IA</button>
  </div>`;
}
function updateWedIA() {
  const messages = $("#wedIaMessages");
  if (!messages) return;
  messages.innerHTML =
    wedIaMessages
      .map((m) => `<div class="wedia-message ${m.role}">${esc(m.text)}</div>`)
      .join("") ||
    `<div class="wedia-message assistant">${tr("wedIaWelcome")}</div>`;
  if (wedIaBusy)
    messages.insertAdjacentHTML(
      "beforeend",
      `<div class="wedia-message assistant wedia-thinking">${tr("wedIaThinking")}</div>`,
    );
  messages.scrollTop = messages.scrollHeight;
  const input = $("#wedIaInput"),
    send = $("#wedIaSend");
  if (input) input.disabled = wedIaBusy;
  if (send) send.disabled = wedIaBusy;
}
function toggleWedIA() {
  wedIaOpen = !wedIaOpen;
  const panel = $("#wedIaPanel");
  if (panel) panel.hidden = !wedIaOpen;
  if (wedIaOpen) {
    updateWedIA();
    $("#wedIaInput")?.focus();
  }
}
async function sendWedIA(event) {
  event.preventDefault();
  const input = $("#wedIaInput"),
    question = input?.value.trim();
  if (!question || wedIaBusy) return;
  wedIaMessages.push({ role: "user", text: question });
  input.value = "";
  wedIaBusy = true;
  updateWedIA();
  try {
    const answer = await askAI(question);
    const parsed = new DOMParser().parseFromString(String(answer), "text/html");
    parsed.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    wedIaMessages.push({
      role: "assistant",
      text: parsed.body.textContent.trim() || tr("wedIaError"),
    });
  } catch (error) {
    wedIaMessages.push({ role: "assistant", text: tr("wedIaError") });
  }
  wedIaBusy = false;
  updateWedIA();
}

/* ===== AÇÕES ===== */
const setRange = (r) => {
  range = r;
  render();
};
function filtrar(v) {
  v = v.toLowerCase();
  document.querySelectorAll("#tp tr").forEach((tr, i) => {
    if (i) tr.hidden = !tr.textContent.toLowerCase().includes(v);
  });
}
function addProd() {
  const n = $("#pn_").value.trim();
  if (!n) return toast("Informe o nome do produto.");
  S.produtos.push({
    id: Date.now(),
    nome: n,
    sku: $("#ps").value || "—",
    qtd: +$("#pq").value || 0,
    min: +$("#pm_").value || 0,
    preco: +$("#pp").value || 0,
    vendasDia: 0,
  });
  save();
  render();
  toast("Produto adicionado.");
}
const delProd = (id) =>
  confirmar("Excluir este produto?", () => {
    S.produtos = S.produtos.filter((p) => p.id !== id);
    save();
    render();
    toast("Produto excluído.");
  });
function ajuste(id) {
  const p = S.produtos.find((x) => x.id === id);
  modal(
    "Ajustar quantidade",
    `<label>${esc(p.nome)}</label><input id="nq" type="number" min="0" value="${p.qtd}">`,
    {
      onOk: () => {
        const v = +$("#nq").value;
        if (isNaN(v) || v < 0) {
          toast("Quantidade inválida.");
          return false;
        }
        p.qtd = v;
        save();
        render();
        toast("Estoque atualizado.");
      },
    },
  );
}
function addItem() {
  if (!S.produtos.length) return toast("Cadastre um produto antes.");
  draft.push({ pid: +$("#op").value, qtd: +$("#oq").value || 1 });
  render();
}
function abrirPedido() {
  if (!draft.length) return toast("Adicione ao menos um item.");
  const itens = draft.map((i) => {
    const p = S.produtos.find((x) => x.id === i.pid);
    return { pid: p.id, nome: p.nome, qtd: i.qtd, preco: p.preco };
  });
  const o = {
    id: S.seq++,
    cliente: $("#oc").value || "Consumidor",
    itens,
    total: itens.reduce((a, i) => a + i.qtd * i.preco, 0),
    status: "aberto",
    data: new Date().toLocaleDateString("pt-BR"),
  };
  S.pedidos.push(o);
  draft = [];
  save();
  render();
  toast("Pedido #" + o.id + " aberto.");
}
function finalizar(id) {
  const o = S.pedidos.find((x) => x.id === id);
  for (const i of o.itens) {
    const p = S.produtos.find((x) => x.id === i.pid);
    if (!p || p.qtd < i.qtd)
      return toast("Estoque insuficiente para " + i.nome + ".");
  }
  o.itens.forEach((i) => (S.produtos.find((x) => x.id === i.pid).qtd -= i.qtd));
  o.status = "finalizado";
  S.daily[S.daily.length - 1] += o.total;
  /* >>> INTEGRAÇÃO FISCAL: aqui você chamaria a API do emissor de NF-e <<< */
  const n = {
    num: String(S.nfSeq++).padStart(6, "0"),
    pedido: o.id,
    data: new Date().toLocaleDateString("pt-BR"),
    cliente: o.cliente,
    itens: o.itens,
    total: o.total,
    icms: (o.total * S.cfg.imposto) / 100,
    chave: Array.from({ length: 44 }, () =>
      Math.floor(Math.random() * 10),
    ).join(""),
  };
  S.notas.push(n);
  save();
  render();
  toast("Pedido #" + o.id + " finalizado. NF " + n.num + " emitida.");
}
const cancelar = (id) =>
  confirmar("Cancelar este pedido?", () => {
    S.pedidos.find((x) => x.id === id).status = "cancelado";
    save();
    render();
  });
function verNF(num) {
  const n = S.notas.find((x) => x.num === num);
  modal(
    "NF " + n.num + " (simulada)",
    `<p class="mut">${esc(S.cfg.empresa)} → ${esc(n.cliente)} · ${n.data}</p><table style="min-width:0;margin:.7rem 0">${n.itens.map((i) => `<tr><td>${i.qtd}× ${esc(i.nome)}</td><td style="text-align:right">${brl(i.qtd * i.preco)}</td></tr>`).join("")}
  <tr><td>ICMS (${S.cfg.imposto}%)</td><td style="text-align:right">${brl(n.icms)}</td></tr><tr><td><b>Total</b></td><td style="text-align:right"><b>${brl(n.total)}</b></td></tr></table><p class="mut" style="word-break:break-all;font-size:.75rem">Chave: ${n.chave}</p>`,
  );
}
function csv(t) {
  const rows = S[t];
  if (!rows.length) return toast("Sem dados para exportar.");
  const flat = rows.map((r) => ({
      ...r,
      itens: r.itens
        ? r.itens.map((i) => i.qtd + "x" + i.nome).join("|")
        : undefined,
    })),
    h = Object.keys(flat[0]);
  const txt = [
    h.join(";"),
    ...flat.map((r) => h.map((k) => r[k]).join(";")),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + txt], { type: "text/csv" }),
  );
  a.download = t + ".csv";
  a.click();
}

/* ===== PERFIL, CONFIGURAÇÕES, SUPORTE, NOTIFICAÇÕES ===== */
function openProfile() {
  const p = S.perfil;
  modal(
    tr("profileTitle"),
    `<label>Nome</label><input id="fn" value="${esc(p.nome)}"><label>E-mail</label><input id="fe" type="email" value="${esc(p.email)}"><label>Cargo</label><input id="fc" value="${esc(p.cargo)}">`,
    {
      onOk: () => {
        if (!$("#fn").value.trim()) {
          toast("Informe seu nome.");
          return false;
        }
        S.perfil = {
          nome: $("#fn").value.trim(),
          email: $("#fe").value.trim(),
          cargo: $("#fc").value.trim(),
        };
        save();
        render();
        toast("Perfil atualizado.");
      },
    },
  );
}
function openSettings() {
  const c = S.cfg;
  let selectedLanguage = c.idioma || "pt-BR";
  const ov = modal(
    tr("settings"),
    `<div class="settings-panel">
    <label>${tr("company")}</label><input id="cn" value="${esc(c.empresa)}">
    <label>${tr("icms")}</label><input id="ci" type="number" min="0" max="100" step="0.1" value="${c.imposto}">
    <label>${tr("reorder")}</label><input id="cp" type="number" min="1" value="${c.prazo}">
    <label>${tr("accent")}</label><input id="cc" type="color" value="${c.cor}" style="height:2.5rem;padding:.2rem">
    <label>${tr("aiEndpoint")}</label><input id="ce" placeholder="https://seu-backend/ia" value="${esc(c.aiEndpoint)}">
    <label>${tr("language")}</label>
    <div class="language-grid">
      <button type="button" class="g language-option ${selectedLanguage === "en-US" ? "on" : ""}" data-lang="en-US" aria-pressed="${selectedLanguage === "en-US"}">English</button>
      <button type="button" class="g language-option ${selectedLanguage === "pt-BR" ? "on" : ""}" data-lang="pt-BR" aria-pressed="${selectedLanguage === "pt-BR"}">Português (Brasil)</button>
      <button type="button" class="g language-option ${selectedLanguage === "es-ES" ? "on" : ""}" data-lang="es-ES" aria-pressed="${selectedLanguage === "es-ES"}">Español</button>
    </div>
  </div>
  <div class="row" style="justify-content:flex-start;margin-top:1rem"><button class="g" onclick="resetar()">${tr("restore")}</button></div>`,
    {
      onOk: () => {
        S.cfg = {
          ...S.cfg,
          empresa: $("#cn").value || "Minha Loja",
          imposto: +$("#ci").value || 0,
          prazo: +$("#cp").value || 7,
          cor: $("#cc").value,
          aiEndpoint: $("#ce").value.trim(),
          idioma: selectedLanguage,
        };
        applyTheme();
        save();
        render();
        toast(tr("settingsSaved"));
      },
    },
  );
  setTimeout(() => {
    const languageButtons = ov.querySelectorAll(".language-option");
    languageButtons.forEach((btn) =>
      btn.addEventListener("click", () => {
        selectedLanguage = btn.dataset.lang;
        S.cfg.idioma = selectedLanguage;
        applyTheme();
        save();
        render();
        languageButtons.forEach((b) => {
          const selected = b.dataset.lang === selectedLanguage;
          b.classList.toggle("on", selected);
          b.setAttribute("aria-pressed", String(selected));
        });
        ov.querySelector("h3").textContent = tr("settings");
        ov.querySelector("[data-x]").textContent = tr("cancel");
        ov.querySelector("[data-ok]").textContent = tr("save");
        [
          "company",
          "icms",
          "reorder",
          "accent",
          "aiEndpoint",
          "language",
        ].forEach((key, index) => {
          ov.querySelectorAll(".settings-panel label")[index].textContent =
            tr(key);
        });
        ov
          .querySelector(".settings-panel")
          .nextElementSibling.querySelector("button").textContent =
          tr("restore");
        toast(tr("langSaved"));
      }),
    );
  }, 0);
}
const resetar = () =>
  confirmar("Apagar todos os dados e restaurar o exemplo?", () => {
    S = structuredClone(BASE);
    S.daily = seedDaily();
    save();
    applyTheme();
    document.querySelectorAll(".ov").forEach((o) => o.remove());
    render();
  });
function openSupport() {
  modal(
    tr("support"),
    `<p class="mut">${tr("supportText")}</p><p style="margin-top:.7rem">E-mail: <b>${SUPORTE.email}</b><br>WhatsApp: <b>${SUPORTE.whats}</b></p><p class="mut" style="margin-top:.7rem">${tr("shortcuts")}</p>`,
    { cancel: tr("close") },
  );
}
function alertas() {
  const a = [];
  S.produtos.forEach((p) => {
    if (p.qtd === 0)
      a.push({ c: "--bad", m: p.nome + " sem estoque", v: "estoque" });
    else if (p.qtd <= p.min)
      a.push({
        c: "--warn",
        m: `${p.nome} abaixo do mínimo (${p.qtd}/${p.min})`,
        v: "estoque",
      });
  });
  const ab = S.pedidos.filter((o) => o.status === "aberto").length;
  if (ab) a.push({ c: "--warn", m: ab + " pedido(s) aberto(s)", v: "pedidos" });
  return a;
}
function pop(id, e) {
  e.stopPropagation();
  ["pn", "pm"].forEach((x) => {
    $("#" + x).hidden = x === id ? !$("#" + x).hidden : true;
  });
  if (id === "pn")
    $("#pn").innerHTML =
      alertas()
        .map(
          (a) =>
            `<div class="al" onclick="go('${a.v}')"><span class="dot" style="background:var(${a.c})"></span>${esc(a.m)}</div>`,
        )
        .join("") || `<div class="empty">${tr("noPending")}</div>`;
}
document.addEventListener("click", () =>
  ["pn", "pm"].forEach((x) => ($("#" + x).hidden = true)),
);

/* ===== RENDER ===== */
function toggleNav(o) {
  $("#side").classList.toggle("open", o);
  $("#scrim").classList.toggle("on", o);
}
function go(v) {
  cur = v;
  toggleNav(false);
  render();
}
function render() {
  const p = S.perfil,
    ini =
      p.nome
        .trim()
        .split(/\s+/)
        .map((x) => x[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "?",
    n = alertas().length;
  const labels = getViews();
  const themeBtn = $("#themeToggle");
  if (themeBtn) {
    themeBtn.innerHTML = S.cfg.tema === "dark" ? "☀" : "☾";
    themeBtn.setAttribute(
      "aria-label",
      S.cfg.tema === "dark" ? "Ativar modo claro" : "Ativar modo escuro",
    );
    themeBtn.title = S.cfg.tema === "dark" ? "Modo claro" : "Modo escuro";
  }
  $("#nav").innerHTML =
    `<div class="nav-label">Painel clássico · dados separados</div>` +
    Object.entries(labels)
      .map(
        ([k, [_, i]]) =>
          `<button class="nb ${k === cur ? "on" : ""}" onclick="go('${k}')">${ico(i)}${labels[k][0]}</button>`,
      )
      .join("") +
    `<div class="nav-label">Painel principal</div><button class="nb" onclick="location.href='modulos/index.php'">${ico("store")}Painel omnichannel</button>`;
  $("#nset").innerHTML = ico("gear") + tr("settings");
  $("#nsup").innerHTML = ico("help") + tr("support");
  $("#bg").setAttribute("aria-label", tr("openMenu"));
  $("#bg").innerHTML = ico("menu", 20);
  $("#gear").innerHTML = ico("gear", 20);
  $("#bell").innerHTML =
    ico("bell", 20) + (n ? `<span class="badge">${n}</span>` : "");
  $("#mp").innerHTML = ico("user") + tr("editProfile");
  $("#ms").innerHTML = ico("gear") + tr("settings");
  $("#hello").innerHTML =
    `${tr("greeting")}, <b>${esc(p.nome.split(" ")[0])}</b>`;
  $("#sub").textContent = `${S.cfg.empresa} · ${tr("summary")}`;
  $("#me").innerHTML =
    `<span class="av">${esc(ini)}</span><div><span>${esc(p.nome)}</span><small>${esc(p.email)}</small></div>`;
  $("#view").innerHTML =
    `<div style="display:grid;gap:1rem">${cur === "dashboard" ? "" : `<h2 class="vt">${labels[cur][0]}</h2>`}${R[cur]()}</div>${cur === "dashboard" ? renderWedIA() : ""}`;
  if (cur === "dashboard") updateWedIA();
  bindChart();
}
$("#qb").onclick = async () => {
  const q = $("#q").value.trim();
  if (!q) return;
  const r = await askAI(q);
  modal(
    "Resposta da IA",
    `<p class="mut" style="margin-bottom:.6rem">${esc(q)}</p><p>${r}</p>`,
    { cancel: tr("close") },
  );
};
$("#q").onkeydown = (e) => {
  if (e.key === "Enter") $("#qb").click();
};
applyTheme();
render();
