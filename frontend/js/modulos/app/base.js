"use strict";
// Painel do lojista — base compartilhada por todas as telas:
// estado, persistência, helpers de HTML, ícones e navegação.

const W = WedTech;
const $ = (s) => document.querySelector(s);

// Estado de dados: SQLite por conta, com localStorage como cache e migração.
const statePersistence = window.WedTechServerState?.load("modular", W.STORAGE_KEY);
let state;
try {
  state = statePersistence?.data
    ? W.loadState({ getItem: () => JSON.stringify(statePersistence.data) }) || W.seed("moda")
    : provisionedState() || W.seed("moda");
} catch {
  state = W.seed("moda");
}
// Loja cadastrada pelo consultor: começa no ramo e com os dados informados no cadastro, sem a tela de escolha
function provisionedState() {
  const p = window.WEDTECH_PROVISION;
  if (!p) return null;
  const s = W.seed(p.tipo);
  s.store = { ...s.store, ...Object.fromEntries(Object.entries(p.store || {}).filter(([, v]) => v)) };
  s.plan = p.plan || s.plan;
  s.setupDone = true;
  return s;
}
// Consultor olhando o painel da loja: nada é gravado
const READONLY = !!window.WEDTECH_READONLY;

// Estado da interface (não é salvo)
const ui = {
  page: "inicio",
  channelPage: null,
  sidebarOpen: true,
  menu: false,
  busy: false,
  drawer: null, // { type: "produto" | "pedido" | "doc" | "receber", id, back }
  notifOpen: false,
  tourStep: null,
  loggedIn: false,
  loginError: "",
  loginBusy: false,
  camera: null, // alvo da câmera: "balcao" | "pedido" | "retirada" | "entrada" | "receber"
  cameraError: "",
  query: "",
  pedidosTab: "abertos",
  pedidosChannel: "", // Pedidos: filtro por canal
  pedidosStore: "", // Pedidos: filtro por loja (ou depósito)
  pedidosQuery: "", // Pedidos: busca por número, cliente ou código
  supportData: null, // Suporte: chamados carregados do servidor
  supportLoading: false,
  supportError: "",
  supportTicket: null, // chamado aberto na tela
  supportFormOpen: false,
  notifFilter: "novas", // Notificações: "novas" ou "todas"
  notifType: "", // Notificações: filtro por assunto
  returnsTab: "analisar", // Devoluções: etapa exibida
  estoqueFilter: "todos", // Estoque: filtro da tabela
  registerAction: null, // sangria, suprimento ou fechar
  lastClosedRegister: null, // mostra o relatório logo depois do fechamento
  cart: [],
  payment: null, // pagamento em andamento no balcão (Pix, cartão, dinheiro, vale)
  counterStore: "loja", // loja onde o balcão está vendendo (quando há mais de uma)
  returnFeedback: "",
  counterDelivery: false,
  counterFeedback: null,
  entradaLocal: "deposito",
  scanFeedback: null,
  orderFeedback: "",
  pickupFeedback: null,
  receiveFeedback: "",
  chat: [],
  dashAnswer: "",
  expenseFormOpen: false,
  live: false,
  one: null, // fluxo do ADS (ver paginas/ads.js)
  eventId: null, // data especial selecionada (paginas/sazonalidade.js)
};
try {
  ui.loggedIn = sessionStorage.getItem("wedtech-session") === "1";
} catch {}

function save() {
  if (READONLY) return Promise.resolve(false);
  try {
    W.saveState(localStorage, state);
    return window.WedTechServerState?.save("modular", state, W.STORAGE_KEY) ?? Promise.resolve(false);
  } catch {
    toast("Dados mantidos só nesta sessão: o armazenamento do navegador está indisponível.");
    return Promise.resolve(false);
  }
}

// ---------------------------------------------------------------------------
// Helpers de HTML
const money = W.brl;
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ago = (ts) => W.timeLabel(state, ts);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const productById = (id) => state.products.find((p) => p.id === id);
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

function toast(text) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 4200);
}
window.addEventListener("wedtech:persistence-error", (event) => toast(event.detail.message));
window.addEventListener("wedtech:persistence-conflict", (event) => toast(event.detail.message));
if (statePersistence?.conflict) {
  setTimeout(() => toast("Há alterações locais e uma versão mais recente no banco. Recarregue antes de continuar."), 0);
} else if (!READONLY && (statePersistence?.needsSave || !statePersistence?.data)) {
  save();
}

function badge(text, type = "") {
  return '<span class="badge ' + type + '">' + text + "</span>";
}
function logo(id, size = "") {
  const c = W.channelById(id);
  if (!c) return "";
  return '<span class="channel-logo ' + id + " " + size + '" title="' + esc(c.name) + '">' + c.short + "</span>";
}
function productThumb(p, size = "") {
  return '<span class="product-icon ' + size + '" aria-hidden="true">' + (p.image ? '<img src="' + esc(p.image) + '" alt="">' : esc(p.emoji || "📦")) + "</span>";
}
function heading(title, sub, actions = "") {
  return '<div class="page-heading"><div><h1>' + title + "</h1><p>" + sub + '</p></div><div class="actions">' + actions + "</div></div>";
}
function aiStrip(title, text, link = "", label = "") {
  return (
    '<div class="ai-strip"><span class="spark">✧</span><div><h2>' + title + "</h2><p>" + text + "</p></div>" +
    (link ? '<a class="link" href="#' + link + '">' + label + "</a>" : "") + "</div>"
  );
}
function emptyBox(text) {
  return '<div class="empty">' + text + "</div>";
}
const statusTone = {
  novo: "warn",
  separando: "warn",
  pronto: "",
  separado: "",
  retirado: "neutral",
  enviado: "neutral",
  concluido: "neutral",
  expirado: "danger",
};
function orderBadge(o) {
  return badge(W.orderStatus[o.status], statusTone[o.status]);
}
const typeIcon = { balcao: "🛒", retirada: "🏪", entrega: "🚚" };
const channelTone = { ativo: "", pausado: "warn", sem_estoque: "danger", nao_publicado: "neutral", desconectado: "neutral" };
function channelBadge(status) {
  return badge(W.channelStatusLabel[status], channelTone[status]);
}
const riskTone = { sem_estoque: "danger", critico: "danger", atencao: "warn", parado: "warn", ok: "" };

// QR code real (vendorizado) e código de barras EAN-13
function renderQR(data, size = 140) {
  try {
    if (typeof WedTechQR === "undefined") return "";
    return WedTechQR.toSVG(WedTechQR.createQrCode(data, WedTechQR.QRErrorCorrectLevel.M), size, 2);
  } catch {
    return "";
  }
}
function renderBarcode(code) {
  return typeof WedTechBarcode === "undefined" ? "" : WedTechBarcode.toSVG(code);
}

// Exporta linhas como CSV (download local, nada sai da máquina)
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCSV(filename, header, rows) {
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Arquivo " + filename + " baixado.");
}

// ---------------------------------------------------------------------------
// Navegação
const routes = {
  inicio: "Início",
  notificacoes: "Notificações",
  balcao: "Caixa (PDV)",
  retiradas: "Retiradas",
  pedidos: "Pedidos",
  devolucoes: "Devoluções e trocas",
  produtos: "Produtos",
  estoque: "Estoque",
  compras: "Fornecedores e compras",
  canais: "Visão geral",
  financeiro: "Financeiro",
  sazonalidade: "Datas e sazonalidade",
  ads: "ADS · Anúncios",
  automacoes: "Automações",
  iot: "Dispositivos (IoT)",
  ai: "WedTech AI",
  suporte: "Suporte",
  config: "Configurações",
};
// Cada grupo reúne um assunto só; o nome do grupo diz o que o lojista vai fazer ali
const navGroups = [
  ["Principal", ["inicio", "notificacoes"]],
  ["Vender", ["balcao", "retiradas"]],
  ["Pedidos", ["pedidos", "devolucoes"]],
  ["Produtos", ["produtos", "estoque", "compras"]],
  ["Canais de venda", ["canais"]],
  ["Gestão", ["financeiro", "sazonalidade", "ads", "automacoes"]],
  ["Dispositivos", ["iot"]],
  ["Mais", ["ai", "suporte", "config"]],
];
// Módulos liberados pelo consultor para esta loja (state.modules vem do servidor)
const moduleOfRoute = { iot: "iot", automacoes: "automacoes" };
function routeAllowed(id) {
  const mod = moduleOfRoute[id];
  return !mod || state.modules?.[mod] !== false;
}
function go(route) {
  location.hash = route;
}
function currentTitle() {
  return ui.page === "canal" ? W.channelById(ui.channelPage)?.name || "Canal" : routes[ui.page];
}

// Ícones SVG (traço), usados no menu e nos indicadores
const paths = {
  inicio: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  balcao: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
  pedidos: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM9 7h6M9 11h6M9 15h4"/>',
  estoque: '<path d="M3 8 12 3l9 5v10l-9 5-9-5zM3 8l9 5 9-5M12 13v10"/>',
  produtos: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
  canais: '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/><path d="m6 6 4 4m4 0 4-4M6 18l4-4m4 0 4 4"/>',
  compras: '<path d="M3 7h11v9H3zM14 11h4l3 3v2h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  sazonalidade: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2"/>',
  ads: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8M20 5a9 9 0 0 1 0 14"/>',
  financeiro: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  automacoes: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  ai: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M4.2 4.2l2.9 2.9m9.8 9.8 2.9 2.9M2 12h4m12 0h4M4.2 19.8l2.9-2.9m9.8-9.8 2.9-2.9"/>',
  suporte: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
  notificacoes: '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  retiradas: '<path d="M4 10v11h16V10M3 4h18l1 6H2zM9 21v-7h6v7"/>',
  devolucoes: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  iot: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  sale: '<path d="M3 17 8 12l4 3 8-11M15 4h5v5"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5M12 17v1"/>',
  store: '<path d="M4 10v11h16V10M3 4h18l1 6H2zM9 21v-7h6v7"/>',
};
function icon(name) {
  return '<span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.produtos) + "</svg></span>";
}
