// WedTech — núcleo de regras de negócio (sem DOM, roda no navegador e no Node).
// Tudo o que muda dados passa por aqui: estoque por local, reservas, pedidos de
// todos os canais, pedidos ao fornecedor, automações e a WedTech AI (local).
(function (global) {
  "use strict";

  const Catalogos =
    typeof module !== "undefined" ? require("./catalogos.js") : global.WedTechCatalogos;
  const Calendario =
    typeof module !== "undefined" ? require("./calendario.js") : global.WedTechCalendario;

  const VERSION = 3;
  const STORAGE_KEY = "wedtech-demo-v3";
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const RESERVA_MS = 48 * HOUR; // reserva de retirada expira em 48 h
  const SHELF_MIN = 2; // sensor da prateleira avisa com 2 unidades ou menos
  const PARADO_DIAS = 45; // cobertura acima disso = estoque parado

  // Planos: o que muda é quantos canais o lojista integra (cada API de marketplace
  // tem custo). O valor é "a partir de" e fechado com um consultor.
  const plans = {
    basico: { id: "basico", name: "Básico", price: 50, maxChannels: 3, maxMarketplaces: 1, maxShops: 1 },
    profissional: { id: "profissional", name: "Profissional", price: 100, maxChannels: 6, maxMarketplaces: 3, maxShops: 2 },
    avancado: { id: "avancado", name: "Avançado", price: 200, maxChannels: 8, maxMarketplaces: 5, maxShops: 5 },
  };

  // ---------------------------------------------------------------------------
  // Canais de venda. "fee" = comissão média do canal; "fixedFee" = taxa fixa por unidade vendida
  // abaixo de "fixedBelow" reais (0 = em qualquer preço). Valores demonstrativos: o lojista ajusta
  // os números reais de cada plataforma em Canais de venda (state.channelFees).
  // kind: proprio (loja/site), social (WhatsApp/Instagram), marketplace ou delivery (apps de comida).
  // Cada tipo de loja usa os canais que fazem sentido para o seu ramo (channelsByType).
  const channels = [
    { id: "loja", name: "Loja física", short: "LF", kind: "proprio", fee: 0, color: "#173f73" },
    { id: "site", name: "Site próprio", short: "SP", kind: "proprio", fee: 0.03, color: "#2f6fb2" },
    { id: "whats", name: "WhatsApp / Instagram", short: "WA", kind: "social", fee: 0, color: "#1faa59" },
    { id: "ml", name: "Mercado Livre", short: "ML", kind: "marketplace", fee: 0.16, fixedFee: 6.25, fixedBelow: 79, color: "#e6c800" },
    { id: "shopee", name: "Shopee", short: "SH", kind: "marketplace", fee: 0.14, fixedFee: 4, fixedBelow: 0, color: "#ee4d2d" },
    { id: "magalu", name: "Magalu", short: "MG", kind: "marketplace", fee: 0.16, color: "#0086ff" },
    { id: "amazon", name: "Amazon", short: "AZ", kind: "marketplace", fee: 0.15, color: "#ff9900" },
    { id: "tiktok", name: "TikTok Shop", short: "TK", kind: "marketplace", fee: 0.12, color: "#1b1b1b" },
    { id: "shein", name: "Shein", short: "SN", kind: "marketplace", fee: 0.2, color: "#111111" },
    { id: "ifood", name: "iFood", short: "iF", kind: "delivery", fee: 0.27, color: "#ea1d2c" },
    { id: "rappi", name: "Rappi", short: "RP", kind: "delivery", fee: 0.25, color: "#ff441f" },
    { id: "food99", name: "99Food", short: "99", kind: "delivery", fee: 0.15, color: "#ffc700" },
  ];
  const channelById = (id) => channels.find((c) => c.id === id);
  const channelsByType = {
    moda: ["loja", "site", "whats", "ml", "shopee", "shein", "tiktok", "magalu"],
    alimentacao: ["loja", "site", "whats", "ifood", "rappi", "food99", "ml", "amazon"],
    eletronicos: ["loja", "site", "whats", "ml", "shopee", "amazon", "magalu", "tiktok"],
  };
  const channelsFor = (s) => (channelsByType[s.tipo] || channelsByType.moda).map(channelById);
  // Plataformas de terceiros (cobram taxa e são pausadas primeiro quando o estoque aperta)
  const isExternal = (id) => ["marketplace", "delivery"].includes(channelById(id)?.kind);
  // Retirada, balcão e apps de delivery (o motoboy busca no balcão) saem da prateleira
  const prefersLoja = (channel, type) => type !== "entrega" || channelById(channel)?.kind === "delivery";

  const orderTypes = {
    balcao: "Venda no balcão",
    retirada: "Retirar na loja",
    entrega: "Entrega em casa",
  };
  const orderStatus = {
    novo: "Novo · separar",
    separando: "Separando",
    pronto: "Pronto para retirada",
    separado: "Pronto para envio",
    retirado: "Retirado pelo cliente",
    enviado: "Enviado",
    concluido: "Concluído",
    expirado: "Reserva expirada",
  };
  const OPEN = ["novo", "separando", "pronto", "separado"];
  const poStatus = {
    aguardando: "Aguardando sua confirmação",
    enviado: "Enviado · a caminho",
    recebido: "Recebido",
    descartado: "Descartado",
  };

  // Regras de automação que o lojista liga e desliga
  const automationRules = [
    {
      id: "autoPedidoCompra",
      icon: "🧾",
      title: "Pedido automático ao fornecedor",
      desc: "Quando um produto chega ao estoque mínimo que você definiu, a IA calcula a quantidade e prepara o pedido. Você só confirma.",
    },
    {
      id: "travaAnuncios",
      icon: "⏸️",
      title: "Travar anúncios pelo prazo do fornecedor",
      desc: "Se o produto vai acabar antes de o fornecedor entregar, a IA pausa os anúncios nos marketplaces e guarda o restante para a loja e o site.",
    },
    {
      id: "reativarAnuncios",
      icon: "▶️",
      title: "Reativar anúncios quando a mercadoria chegar",
      desc: "Bipou a entrada da mercadoria e o estoque voltou ao normal? Os anúncios voltam sozinhos.",
    },
    {
      id: "pausarSemEstoque",
      icon: "🚫",
      title: "Pausar tudo quando o estoque zerar",
      desc: "Nenhum canal online vende um produto que acabou. Zero venda sem estoque.",
    },
    {
      id: "expirarReservas",
      icon: "⏱️",
      title: "Liberar reserva não retirada em 48 h",
      desc: "Se o cliente comprou para retirar e não apareceu em 48 horas, o produto volta a ficar à venda em todos os canais.",
    },
    {
      id: "avisarCliente",
      icon: "💬",
      title: "Avisar o cliente pelo WhatsApp",
      desc: "Pedido pronto para retirada ou enviado? O cliente recebe a mensagem na hora, com o código de retirada.",
    },
    {
      id: "reporPrateleira",
      icon: "📡",
      title: "Sensor de prateleira (IoT)",
      desc: "Os sensores avisam quando o produto está acabando na prateleira da loja e ainda tem no depósito.",
    },
    {
      id: "alertaValidade",
      icon: "📅",
      title: "Alerta de validade",
      desc: "Para produtos com validade: avisa quando um lote vence em até 7 dias e sugere uma promoção para vender esse lote primeiro.",
    },
    {
      id: "etiquetaEletronica",
      icon: "📟",
      title: "Etiquetas eletrônicas nas prateleiras (IoT)",
      desc: "Mudou o preço ou entrou uma promoção? As etiquetas digitais da prateleira atualizam sozinhas em todas as lojas. Nada de preço errado no balcão.",
    },
    {
      id: "retirarVencidos",
      icon: "🗑️",
      title: "Tirar vencidos da venda",
      desc: "Lote venceu? A IA dá baixa na hora, em todos os canais, e registra a perda no Financeiro. Nenhum cliente recebe produto vencido.",
    },
  ];
  // Taxas das formas de pagamento no balcão (demonstrativas)
  const paymentMethods = {
    pix: { label: "Pix", fee: 0 },
    debito: { label: "Cartão de débito", fee: 0.0199 },
    credito: { label: "Cartão de crédito", fee: 0.0349 },
    dinheiro: { label: "Dinheiro", fee: 0 },
    vale: { label: "Vale-troca", fee: 0 },
  };

  const brl = (n) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  const round2 = (n) => Math.round(n * 100) / 100;
  const round1 = (n) => Math.round(n * 10) / 10;
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  // Número decimal no formato brasileiro (3.7 → "3,7")
  const dec = (n) => String(n).replace(".", ",");

  // Sequência de dígitos pseudoaleatória e determinística (não é chave fiscal real)
  function pseudoDigits(seed, length) {
    let x = 0;
    for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) % 1e9;
    let out = "";
    for (let i = 0; i < length; i++) {
      x = (x * 1103515245 + 12345) % 1000000007;
      out += Math.abs(x) % 10;
    }
    return out;
  }

  // Relógio da demonstração: permite "avançar o tempo" para simular 48 h
  const now = (s) => Date.now() + (s.clock || 0);

  function timeLabel(s, ts) {
    const min = Math.round((now(s) - ts) / MIN);
    if (min < 1) return "Agora";
    if (min < 60) return "Há " + min + " min";
    const h = Math.round(min / 60);
    if (h < 24) return "Há " + h + " h";
    return "Há " + plural(Math.round(h / 24), "dia", "dias");
  }

  function nextId(s, key, prefix) {
    s.seq[key] = (s.seq[key] || 0) + 1;
    return prefix + s.seq[key];
  }

  // ---------------------------------------------------------------------------
  // Estado inicial
  function seed(tipo = "moda") {
    tipo = Catalogos.tipos[tipo] ? tipo : "moda";
    const { info, products, suppliers } = Catalogos.build(tipo);
    const t = Date.now();
    // Começa com loja, site, WhatsApp e os 2 principais canais externos do ramo
    const connected = channelsByType[tipo].slice(0, 5);
    const [ext1, ext2] = connected.slice(3);
    products.forEach((p) => (p.channels = [...connected]));
    // Lotes com validade (alimentação): a soma dos lotes = estoque total do produto
    for (const p of products) {
      if (!p.lotSpec) continue;
      let rest = p.stock.loja + p.stock.deposito;
      p.lots = p.lotSpec
        .map(([qty, days], k) => {
          const q = qty === null ? rest : Math.min(rest, qty);
          rest -= q;
          return { id: p.id + "-L" + (k + 1), code: lotCode(t + days * DAY - p.shelfLifeDays * DAY), qty: q, expiry: t + days * DAY };
        })
        .filter((l) => l.qty > 0);
      delete p.lotSpec;
    }
    const s = {
      version: VERSION,
      tipo,
      setupDone: false,
      store: {
        name: info.storeName,
        owner: "Maria",
        tagline: info.tagline,
        cnpj: "48.123.456/0001-09",
        address: "Rua das Flores, 120 — Vila Nova, São Paulo/SP",
        whatsapp: "(11) 99876-5432",
        pickupHours: "Seg a sáb, 9h às 19h",
        // false = a loja não tem depósito separado: tudo fica na prateleira
        hasDeposito: true,
      },
      plan: "profissional",
      // Lojas físicas: "loja" é a principal; filiais entram como loja2, loja3...
      shops: [{ id: "loja", name: "Loja Vila Nova", address: "Rua das Flores, 120 — Vila Nova, São Paulo/SP", main: true }],
      credits: [], // vales-troca gerados em devoluções
      customEvents: [],
      eventsPrepared: {},
      eventReports: [],
      eventLearning: {},
      channelPricing: {},
      returnRequests: [], // solicitações de devolução e troca
      cashRegisters: [], // aberturas e fechamentos de caixa (loja física e loja virtual)
      losses: [],
      products,
      suppliers,
      connected,
      orders: [],
      purchaseOrders: [],
      invoices: [],
      labels: [],
      messages: [],
      notifications: [],
      automationLog: [],
      scanLog: [],
      expenses: [
        { id: "DESP-1", category: "Aluguel", description: "Aluguel da loja (rateio diário)", amount: 80, date: "Hoje" },
        { id: "DESP-2", category: "Funcionário", description: "Atendente (rateio diário)", amount: 120, date: "Hoje" },
        { id: "DESP-3", category: "Contas", description: "Energia e internet (rateio diário)", amount: 25, date: "Hoje" },
        { id: "DESP-4", category: "Embalagens", description: "Sacolas e caixas de envio", amount: 18, date: "Hoje" },
      ],
      automations: Object.fromEntries(automationRules.map((r) => [r.id, true])),
      onboarding: { minReviewed: false, automationsVisited: false, siteSale: false, hidden: false },
      clock: 0,
      seq: { order: 1000, po: 3000, nf: 1000, etq: 5000, msg: 0, notif: 0, log: 0, scan: 0 },
    };
    const P = (i) => products[i];
    const line = (p, qty, channel, type, scanned, variantLabel) => {
      const v = p.variants ? p.variants.find((x) => x.label === variantLabel) || [...p.variants].sort((a, b) => b.qty - a.qty)[0] : null;
      return {
        productId: p.id,
        variantId: v ? v.id : undefined,
        sku: v ? v.sku : p.sku,
        name: p.name + (v ? " · " + v.label : ""),
        emoji: p.emoji,
        qty,
        price: p.price,
        source: prefersLoja(channel, type) ? "loja" : "deposito",
        scanned,
      };
    };
    const customers = [
      "Ana Paula", "Carlos Henrique", "Juliana Souza", "Pedro Lima", "Fernanda Alves",
      "Rafael Costa", "Beatriz Rocha", "Lucas Martins", "Camila Nunes", "Diego Ramos",
    ];
    const pays = ["pix", "debito", "credito", "dinheiro", "pix", "credito"];
    // Pedidos já concluídos hoje (o estoque do catálogo já considera essas saídas)
    const done = [
      ["loja", "balcao", 7, 2, 400], [ext1, "entrega", 1, 2, 380], ["loja", "balcao", 5, 1, 350],
      [ext2, "entrega", 7, 1, 330], ["site", "retirada", 1, 3, 300], ["loja", "balcao", 0, 1, 280],
      ["whats", "retirada", 6, 1, 250], [ext1, "entrega", 0, 1, 230], ["loja", "balcao", 3, 1, 200],
      ["site", "entrega", 5, 1, 180], [ext2, "entrega", 1, 2, 150], ["loja", "balcao", 7, 3, 120],
      [ext1, "entrega", 2, 1, 100], ["loja", "balcao", 1, 1, 80],
    ];
    done.forEach(([channel, type, i, qty, ago], k) => {
      const p = P(i);
      const o = {
        id: nextId(s, "order", "PED-"),
        channel,
        type,
        customer: { name: type === "balcao" ? "Cliente do balcão" : customers[k % customers.length], phone: "" },
        items: [line(p, qty, channel, type, true)],
        total: round2(p.price * qty),
        shipping: 0,
        status: type === "balcao" ? "concluido" : type === "retirada" ? "retirado" : "enviado",
        ts: t - ago * MIN,
      };
      if (type === "balcao") o.payment = { method: pays[k % pays.length], fee: paymentMethods[pays[k % pays.length]].fee };
      s.orders.push(o);
    });
    // Pedidos em aberto (reservam estoque) — [produto, quantidade, tamanho/modelo]
    const open = [
      ["whats", "retirada", [[1, 2, "M"]], 200, "pronto", "Carlos Henrique", "(11) 98765-1122"],
      [ext1, "entrega", [[6, 1], [7, 2]], 40, "novo", "Pedro Lima", "(11) 97654-3344"],
      ["site", "retirada", [[5, 1, "M"]], 25, "novo", "Ana Paula", "(11) 98888-1234"],
      [ext2, "entrega", [[1, 3, "G"]], 15, "novo", "Juliana Souza", "(11) 96543-5566"],
    ];
    for (const [channel, type, items, ago, status, name, phone] of open) {
      const id = nextId(s, "order", "PED-");
      const lines = items.map(([i, qty, label]) => line(P(i), qty, channel, type, status === "pronto", label));
      const o = {
        id,
        channel,
        type,
        customer: { name, phone },
        items: lines,
        total: round2(lines.reduce((a, l) => a + l.price * l.qty, 0)),
        shipping: 0,
        status,
        ts: t - ago * MIN,
      };
      if (type === "retirada") o.pickupCode = "RET-" + pseudoDigits(id, 6);
      if (status === "pronto") o.readyTs = t - (ago - 20) * MIN;
      s.orders.push(o);
    }
    // Situação já em andamento: produto 3 com anúncios travados aguardando o fornecedor
    const bone = P(2);
    const boneSup = suppliers.find((f) => f.id === bone.supplierId);
    s.purchaseOrders.push({
      id: nextId(s, "po", "PC-"),
      supplierId: boneSup.id,
      items: [{ productId: bone.id, sku: bone.sku, name: bone.name, qty: 20, received: 0, cost: bone.cost }],
      status: "enviado",
      byAI: true,
      reason: bone.name + " chegou ao estoque mínimo.",
      ts: t - 26 * HOUR,
      sentTs: t - 25 * HOUR,
      etaTs: t - 25 * HOUR + boneSup.leadTimeDays * DAY,
    });
    bone.lock = { kind: "prazo", ts: t - 26 * HOUR };
    P(3).shelfAlert = true;
    const pronto = s.orders.find((o) => o.status === "pronto");
    const logSeed = [
      ["autoPedidoCompra", "Preparei o pedido PC-3001 para " + boneSup.name + ": " + bone.name + " × 20.", 26 * 60],
      ["travaAnuncios", "Pausei os anúncios de " + bone.name + " nos canais externos: acaba em ~2 dias e o fornecedor entrega em " + plural(boneSup.leadTimeDays, "dia", "dias") + ". O restante fica para a loja e o site.", 26 * 60],
      ["avisarCliente", "Avisei " + pronto.customer.name + " pelo WhatsApp: pedido " + pronto.id + " pronto para retirada.", 180],
      ["reporPrateleira", "Sensor da " + P(3).shelf + ": " + P(3).name + " quase vazia (1 un.). Tem " + P(3).stock.deposito + " no depósito.", 20],
    ];
    for (const [rule, text, ago] of logSeed) s.automationLog.unshift({ id: nextId(s, "log", "AUT-"), rule, text, ts: t - ago * MIN });
    s.automationLog.sort((a, b) => b.ts - a.ts);
    s.messages.push({
      id: nextId(s, "msg", "MSG-"),
      to: pronto.customer.name,
      phone: pronto.customer.phone,
      text: pickupMessage(s, pronto),
      orderId: pronto.id,
      ts: pronto.readyTs,
    });
    const ext2Name = channelById(ext2).name;
    const notifSeed = [
      ["pedido", "Novo pedido " + (channelById(ext2).kind === "delivery" ? "pelo " : "na ") + ext2Name + ": PED-1018 para entregar", 15, "pedidos"],
      ["pedido", "Novo pedido no site: PED-1017 para retirar na loja", 25, "pedidos"],
      ["estoque", "Sensor: " + P(3).name + " quase acabando na prateleira", 20, "iot"],
    ];
    for (const [type, text, ago, route] of notifSeed) s.notifications.push({ id: nextId(s, "notif", "NT-"), type, text, ts: t - ago * MIN, read: false, route });
    s.notifications.sort((a, b) => b.ts - a.ts);
    seedEventReports(s, t);
    runAutomations(s);
    return s;
  }
  // Código de lote a partir da data de fabricação (ex.: L250928)
  function lotCode(ts) {
    const d = new Date(ts);
    return "L" + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  }

  // ---------------------------------------------------------------------------
  // Estoque por local e reservas
  function supplierOf(s, p) {
    return s.suppliers.find((f) => f.id === p.supplierId) || null;
  }
  // Lojas físicas do lojista ("loja" é a principal) + o depósito
  const shopsOf = (s) => s.shops || [{ id: "loja", name: "Loja", main: true }];
  const shopIds = (s) => shopsOf(s).map((x) => x.id);
  const locationIds = (s) => [...shopIds(s), "deposito"];
  function locName(s, id) {
    if (id === "deposito") return "Depósito";
    const sh = shopsOf(s).find((x) => x.id === id);
    return sh ? sh.name : "Loja";
  }
  function reservedAt(s, productId) {
    const r = {};
    for (const o of s.orders)
      if (OPEN.includes(o.status))
        for (const it of o.items) if (it.productId === productId) r[it.source] = (r[it.source] || 0) + it.qty;
    return r;
  }
  function stockOf(s, p) {
    const r = reservedAt(s, p.id);
    const q = (id) => p.stock[id] || 0;
    const byLoc = locationIds(s).map((id) => ({ id, name: locName(s, id), qty: q(id), reserved: r[id] || 0, free: Math.max(0, q(id) - (r[id] || 0)) }));
    const total = byLoc.reduce((a, l) => a + l.qty, 0);
    const reservado = byLoc.reduce((a, l) => a + l.reserved, 0);
    const lojas = byLoc.filter((l) => l.id !== "deposito");
    return {
      loja: q("loja"),
      deposito: q("deposito"),
      lojas: lojas.reduce((a, l) => a + l.qty, 0),
      reservado,
      livreLoja: byLoc.find((l) => l.id === "loja")?.free || 0,
      livreDeposito: byLoc.find((l) => l.id === "deposito")?.free || 0,
      total,
      disponivel: Math.max(0, total - reservado),
      byLoc,
    };
  }
  // Ajuste de estoque por contagem: o lojista informa quanto contou num local e o motivo.
  // Perda, roubo e avaria viram prejuízo no Financeiro; o mínimo pode disparar nova compra.
  const adjustReasons = {
    inventario: "Contagem de inventário",
    perda: "Perda ou roubo",
    avaria: "Produto quebrado ou vencido",
    correcao: "Correção de lançamento",
  };
  function adjustStock(s, productId, { location, counted, reason, variantId } = {}) {
    const p = s.products.find((x) => x.id === productId);
    if (!p) throw Error("Produto não encontrado.");
    if (!adjustReasons[reason]) throw Error("Escolha o motivo do ajuste.");
    if (!locationIds(s).includes(location)) throw Error("Local inválido.");
    const qty = Number(counted);
    if (!Number.isInteger(qty) || qty < 0 || qty > 99999) throw Error("Informe a quantidade contada (número inteiro, 0 ou mais).");
    const here = stockOf(s, p).byLoc.find((l) => l.id === location);
    if (qty < here.reserved) throw Error("Há " + plural(here.reserved, "unidade reservada", "unidades reservadas") + " para pedidos em " + here.name + ". Conte de novo ou cancele o pedido.");
    const delta = qty - here.qty;
    if (!delta) throw Error("A contagem bate com o sistema: nada para ajustar.");
    let v = null;
    if (p.variants && p.variants.length) {
      v = p.variants.find((x) => x.id === variantId);
      if (!v) throw Error("Escolha o " + (p.variantKind || "tamanho").toLowerCase() + " que você contou.");
      if (v.qty + delta < 0) throw Error("O " + (p.variantKind || "tamanho").toLowerCase() + " " + v.label + " só tem " + v.qty + " no sistema.");
    }
    p.stock[location] = qty;
    if (v) v.qty += delta;
    if (p.shelfLifeDays) {
      if (delta > 0) addUnits(s, p, delta);
      else {
        let rest = -delta;
        for (const l of lotsOf(s, p)) {
          const lot = p.lots.find((x) => x.id === l.id);
          const take = Math.min(lot.qty, rest);
          lot.qty -= take;
          rest -= take;
          if (!rest) break;
        }
        p.lots = p.lots.filter((l) => l.qty > 0);
      }
    }
    const value = round2(Math.abs(delta) * (p.cost || 0));
    if (delta < 0 && (reason === "perda" || reason === "avaria")) {
      s.losses = s.losses || [];
      s.losses.push({ productId: p.id, name: p.name, qty: -delta, value, reason: adjustReasons[reason], ts: now(s) });
    }
    s.scanLog.unshift({ id: nextId(s, "scan", "SC-"), type: "ajuste", sku: v ? v.sku : p.sku, product: p.name + (v ? " · " + v.label : ""), location: locName(s, location), ts: now(s) });
    if (s.scanLog.length > 80) s.scanLog.length = 80;
    runAutomations(s);
    return { product: p, delta, value };
  }
  function hasOpenPO(s, productId) {
    return s.purchaseOrders.some(
      (po) => (po.status === "aguardando" || po.status === "enviado") && po.items.some((it) => it.productId === productId),
    );
  }
  // Situação do anúncio de um produto em um canal
  function channelStatus(s, p, channelId) {
    if (!s.connected.includes(channelId)) return "desconectado";
    if (!p.channels.includes(channelId)) return "nao_publicado";
    const avail = stockOf(s, p).disponivel;
    if (avail <= 0) return "sem_estoque";
    if (channelId === "loja") return "ativo";
    if (p.lock && isExternal(channelId)) return "pausado";
    return "ativo";
  }
  const channelStatusLabel = {
    ativo: "Ativo",
    pausado: "Pausado pela IA",
    sem_estoque: "Sem estoque",
    nao_publicado: "Não publicado",
    desconectado: "Canal não conectado",
  };

  // ---------------------------------------------------------------------------
  // Sazonalidade e datas especiais (Dia das Crianças, Black Friday, Natal…)
  const startOfDay = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dateLabel = (ts) => new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  // Datas do calendário + eventos criados pelo lojista, com a janela de pico de cada uma
  function allEvents(s, fromTs) {
    const y = new Date(fromTs).getFullYear();
    const list = [...Calendario.events(y), ...Calendario.events(y + 1)].map((e) => ({
      id: e.id,
      name: e.name,
      emoji: e.emoji,
      tip: e.tip,
      key: e.key,
      mult: learnedMult(s, e.key, e.impact[s.tipo] || 1.2),
      windowDays: e.windowDays,
      ts: new Date(e.date).setHours(23, 59, 59, 999),
      custom: false,
    }));
    for (const c of s.customEvents || []) {
      const [yy, mm, dd] = c.date.split("-").map(Number);
      list.push({ id: c.id, name: c.name, emoji: "📌", tip: "Evento cadastrado por você.", mult: c.mult, windowDays: c.windowDays, ts: new Date(yy, mm - 1, dd, 23, 59, 59, 999).getTime(), custom: true });
    }
    return list
      .map((e) => ({ ...e, windowStart: startOfDay(e.ts) - (e.windowDays - 1) * DAY }))
      .sort((a, b) => a.ts - b.ts);
  }
  // Aumento previsto ajustado pelo que realmente aconteceu na última vez (relatório pós-evento)
  function learnedMult(s, key, base) {
    const k = (s.eventLearning || {})[key];
    if (!k) return base;
    return round2(1 + (base - 1) * Math.max(0.6, Math.min(1.6, k)));
  }
  // Relatórios de datas que já passaram (histórico demonstrativo) + o que a IA aprendeu
  function seedEventReports(s, t) {
    const y = new Date(t).getFullYear();
    const past = [...Calendario.events(y - 1), ...Calendario.events(y)]
      .map((e) => ({ ...e, ts: new Date(e.date).setHours(23, 59, 59, 999) }))
      .filter((e) => e.ts < t)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 2);
    const drift = [1.35, 0.8, 1.15, 1.45, 0.6, 0.95, 1.2, 1.05];
    s.eventReports = past.map((e, k) => {
      const mult = e.impact[s.tipo] || 1.2;
      const rows = s.products.map((p, i) => {
        const forecast = Math.max(1, Math.round((p.avgDaily || 0) * mult * e.windowDays));
        const demand = Math.max(0, Math.round(forecast * drift[(i + k * 3) % drift.length]));
        const stock = Math.round(forecast * 1.1);
        const sold = Math.min(demand, stock);
        return { name: p.name, emoji: p.emoji, forecast, demand, sold, lost: demand - sold, leftover: stock - sold, price: p.price };
      });
      const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
      const forecastUnits = sum((r) => r.forecast);
      const demandUnits = sum((r) => r.demand);
      const learning = round2(demandUnits / forecastUnits);
      s.eventLearning[e.key] = learning;
      const worst = [...rows].sort((a, b) => b.demand / b.forecast - a.demand / a.forecast)[0];
      return {
        id: e.id,
        key: e.key,
        name: e.name,
        emoji: e.emoji,
        ts: e.ts,
        windowDays: e.windowDays,
        mult,
        forecastUnits,
        demandUnits,
        soldUnits: sum((r) => r.sold),
        lostUnits: sum((r) => r.lost),
        leftoverUnits: sum((r) => r.leftover),
        revenue: round2(sum((r) => r.sold * r.price)),
        lostRevenue: round2(sum((r) => r.lost * r.price)),
        accuracy: Math.max(0, Math.round((1 - Math.abs(demandUnits - forecastUnits) / forecastUnits) * 100)),
        learning,
        rows,
        lesson:
          worst.name + " vendeu " + Math.round((worst.demand / worst.forecast - 1) * 100) + "% acima do previsto" +
          (worst.lost ? " e faltaram " + plural(worst.lost, "unidade", "unidades") : "") +
          ". Na próxima vez, a IA já considera essa diferença na previsão.",
        demo: true,
      };
    });
  }
  function upcomingEvents(s, limit = 6) {
    const t = now(s);
    return allEvents(s, t)
      .filter((e) => e.ts >= t)
      .slice(0, limit)
      .map((e) => ({
        ...e,
        daysUntil: Math.max(0, Math.ceil((startOfDay(e.ts) - startOfDay(t)) / DAY)),
        active: t >= e.windowStart,
        prepared: !!(s.eventsPrepared || {})[e.id],
      }));
  }
  // Quantas vezes a venda está acima do normal agora (1 = normal)
  function demandFactor(s, t = now(s)) {
    return allEvents(s, t).reduce((f, e) => (t >= e.windowStart && t <= e.ts ? Math.max(f, e.mult) : f), 1);
  }
  const dailyOf = (s, p) => (p.avgDaily || 0) * demandFactor(s);
  // Unidades já a caminho (pedidos ao fornecedor aguardando ou enviados)
  function incomingOf(s, productId) {
    return s.purchaseOrders
      .filter((po) => po.status === "aguardando" || po.status === "enviado")
      .reduce((a, po) => a + po.items.filter((i) => i.productId === productId).reduce((b, i) => b + i.qty - i.received, 0), 0);
  }
  // Plano da IA para uma data especial: quanto vai vender, quanto falta e até quando pedir
  function eventPlan(s, eventId) {
    const t = now(s);
    const e = allEvents(s, t).find((x) => x.id === eventId);
    if (!e) throw Error("Data especial não encontrada.");
    const daysBefore = Math.max(0, Math.ceil((e.windowStart - startOfDay(t)) / DAY));
    const windowLeft = t >= e.windowStart ? Math.max(1, Math.ceil((e.ts - t) / DAY)) : e.windowDays;
    const rows = s.products.map((p) => {
      const sup = supplierOf(s, p);
      const st = stockOf(s, p);
      const normal = Math.round((p.avgDaily || 0) * windowLeft);
      const expected = Math.round((p.avgDaily || 0) * e.mult * windowLeft);
      const need = Math.ceil((p.avgDaily || 0) * daysBefore + expected + p.minStock);
      const incoming = incomingOf(s, p.id);
      const toBuy = Math.max(0, need - st.disponivel - incoming);
      const lead = sup ? sup.leadTimeDays : null;
      const orderBy = lead !== null ? e.windowStart - lead * DAY : null;
      let status = "coberto";
      if (toBuy > 0) {
        if (!sup) status = "sem_fornecedor";
        else if (orderBy >= startOfDay(t) + DAY) status = "no_prazo";
        else if (orderBy >= startOfDay(t)) status = "hoje";
        else status = "atrasado";
      }
      return {
        productId: p.id,
        name: p.name,
        emoji: p.emoji,
        normal,
        expected,
        disponivel: st.disponivel,
        incoming,
        toBuy,
        supplier: sup ? sup.name : null,
        leadTimeDays: lead,
        orderBy,
        arrives: lead !== null ? startOfDay(t) + lead * DAY : null,
        status,
      };
    });
    const extraRevenue = round2(
      rows.reduce((a, r) => a + (r.expected - r.normal) * (s.products.find((p) => p.id === r.productId).price || 0), 0),
    );
    return { event: { ...e, daysUntil: Math.max(0, Math.ceil((startOfDay(e.ts) - startOfDay(t)) / DAY)) }, rows, extraRevenue, toBuyCount: rows.filter((r) => r.toBuy > 0).length };
  }
  const eventStatusLabel = {
    coberto: "Estoque coberto",
    no_prazo: "Peça até",
    hoje: "Peça hoje",
    atrasado: "Atrasado",
    sem_fornecedor: "Sem fornecedor",
  };
  // A IA prepara os pedidos ao fornecedor para a data especial (o lojista confirma)
  function prepareEvent(s, eventId) {
    const plan = eventPlan(s, eventId);
    const bySupplier = new Map();
    for (const r of plan.rows) {
      if (r.toBuy <= 0) continue;
      const p = s.products.find((x) => x.id === r.productId);
      if (!p.supplierId) continue;
      if (!bySupplier.has(p.supplierId)) bySupplier.set(p.supplierId, []);
      bySupplier.get(p.supplierId).push({ productId: p.id, sku: p.sku, name: p.name, qty: r.toBuy, received: 0, cost: p.cost });
    }
    if (!bySupplier.size) throw Error("O estoque já cobre " + plan.event.name + ". Nada a comprar.");
    const created = [];
    for (const [supplierId, items] of bySupplier) {
      const po = {
        id: nextId(s, "po", "PC-"),
        supplierId,
        items,
        status: "aguardando",
        byAI: true,
        eventId,
        reason:
          "Preparação para " + plan.event.name + " (" + dateLabel(plan.event.ts) + "): a IA prevê vendas " + dec(round1(plan.event.mult)) +
          "× maiores por " + plural(plan.event.windowDays, "dia", "dias") + ".",
        ts: now(s),
      };
      s.purchaseOrders.unshift(po);
      created.push(po);
    }
    s.eventsPrepared = s.eventsPrepared || {};
    s.eventsPrepared[eventId] = now(s);
    log(s, "autoPedidoCompra", "Preparei " + plural(created.length, "pedido", "pedidos") + " ao fornecedor para " + plan.event.name + " (" + plural(created.reduce((a, po) => a + po.items.length, 0), "produto", "produtos") + "). Falta só você confirmar.");
    pushNotification(s, "compra", "Pedidos para " + plan.event.name + " preparados pela IA. Confirme em Compras.", "compras");
    return created;
  }
  function addCustomEvent(s, draft) {
    const name = String(draft.name || "").trim();
    if (!name) throw Error("Dê um nome para o evento.");
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(draft.date || ""));
    if (!m) throw Error("Informe uma data válida.");
    const ts = new Date(+m[1], +m[2] - 1, +m[3], 23, 59).getTime();
    if (isNaN(ts) || ts < now(s)) throw Error("A data do evento precisa ser no futuro.");
    const inc = Number(draft.increase);
    if (!(inc > 0 && inc <= 500)) throw Error("O aumento esperado deve ficar entre 1% e 500%.");
    const windowDays = Math.round(Number(draft.windowDays) || 3);
    if (!(windowDays >= 1 && windowDays <= 60)) throw Error("A duração deve ficar entre 1 e 60 dias.");
    const ev = { id: "EV-" + nextId(s, "log", ""), name, date: m[0], mult: round2(1 + inc / 100), windowDays };
    s.customEvents = s.customEvents || [];
    s.customEvents.push(ev);
    return ev;
  }
  function removeCustomEvent(s, id) {
    s.customEvents = (s.customEvents || []).filter((e) => e.id !== id);
  }
  // Índice de vendas por mês para o tipo de loja (gráfico de sazonalidade)
  function monthlySeasonality(s) {
    const idx = Calendario.monthly[s.tipo] || Calendario.monthly.moda;
    return idx.map((v, i) => ({ month: Calendario.months[i], index: v }));
  }

  // Plano contratado e uso dos canais
  // Limites do plano com as liberações extras do consultor (s.planLimits vem do servidor)
  function planUsage(s) {
    const plan = { ...(plans[s.plan] || plans.profissional), ...(s.planLimits || {}) };
    return {
      plan,
      channels: s.connected.length,
      marketplaces: s.connected.filter((c) => isExternal(c)).length,
    };
  }

  // A IA decide de onde sai cada item: retirada/balcão priorizam a loja,
  // entregas priorizam o depósito — sem nunca usar unidades já reservadas.
  function allocate(s, p, qty, lojaFirst, prefStore = "loja") {
    const st = stockOf(s, p);
    if (st.disponivel < qty)
      throw Error(p.name + ": só " + plural(st.disponivel, "unidade disponível", "unidades disponíveis") + ".");
    const free = Object.fromEntries(st.byLoc.map((l) => [l.id, l.free]));
    const others = shopIds(s).filter((x) => x !== prefStore);
    // Retirada/balcão: primeiro a loja escolhida, depois o depósito e as outras lojas.
    // Entrega: primeiro o depósito.
    const order = lojaFirst ? [prefStore, "deposito", ...others] : ["deposito", prefStore, ...others];
    const parts = [];
    let rest = qty;
    for (const loc of order) {
      const take = Math.min(free[loc], rest);
      if (take > 0) {
        parts.push({ source: loc, qty: take });
        rest -= take;
      }
    }
    return parts;
  }
  function takeStock(s, order) {
    for (const it of order.items) {
      const p = s.products.find((x) => x.id === it.productId);
      if (!p) continue;
      p.stock[it.source] = Math.max(0, p.stock[it.source] - it.qty);
      removeUnits(p, it.qty, it.variantId);
    }
  }
  // Acha produto (e tamanho/modelo, se for o caso) pelo SKU ou código de barras
  function resolveCode(s, code) {
    const c = String(code || "").trim().toLowerCase();
    if (!c) throw Error("Informe um código de barras ou SKU.");
    for (const p of s.products) {
      if (p.sku.toLowerCase() === c || (p.barcode || "").toLowerCase() === c) return { product: p, variant: null };
      const v = (p.variants || []).find((v) => v.sku.toLowerCase() === c || (v.barcode || "").toLowerCase() === c);
      if (v) return { product: p, variant: v };
    }
    throw Error("Código não reconhecido no catálogo.");
  }
  function findByCode(s, code) {
    return resolveCode(s, code).product;
  }

  // ---------------------------------------------------------------------------
  // Grade (tamanho/modelo) e lotes com validade: detalham o estoque total do produto
  function variantFree(s, p, v) {
    let reserved = 0;
    for (const o of s.orders)
      if (OPEN.includes(o.status)) for (const it of o.items) if (it.productId === p.id && it.variantId === v.id) reserved += it.qty;
    return Math.max(0, v.qty - reserved);
  }
  // Escolhe o tamanho/modelo do item (o pedido informa; se não, o que tem mais)
  function pickVariant(s, p, variantId, qty) {
    if (!p.variants || !p.variants.length) return null;
    const v = variantId ? p.variants.find((x) => x.id === variantId) : [...p.variants].sort((a, b) => variantFree(s, p, b) - variantFree(s, p, a))[0];
    if (!v) throw Error(p.name + ": " + (p.variantKind || "variação").toLowerCase() + " não encontrado.");
    const free = variantFree(s, p, v);
    if (free < qty) throw Error(p.name + " " + v.label + ": só " + plural(free, "unidade disponível", "unidades disponíveis") + ".");
    return v;
  }
  // Grade sugerida pela IA para uma compra, pelo mix de vendas de cada tamanho
  function gradeFor(p, qty) {
    if (!p.variants || !p.variants.length) return [];
    const total = p.variants.reduce((a, v) => a + (v.weight || 1), 0);
    const raw = p.variants.map((v) => ({ id: v.id, label: v.label, exact: (qty * (v.weight || 1)) / total }));
    raw.forEach((r) => (r.qty = Math.floor(r.exact)));
    let rest = qty - raw.reduce((a, r) => a + r.qty, 0);
    [...raw].sort((a, b) => b.exact - b.qty - (a.exact - a.qty)).forEach((r) => rest > 0 && (r.qty++, rest--));
    return raw.map(({ id, label, qty }) => ({ id, label, qty }));
  }
  function removeUnits(p, qty, variantId) {
    if (p.variants && p.variants.length) {
      let rest = qty;
      const list = variantId ? p.variants.filter((v) => v.id === variantId) : [...p.variants].sort((a, b) => b.qty - a.qty);
      for (const v of list) {
        const take = Math.min(v.qty, rest);
        v.qty -= take;
        rest -= take;
        if (!rest) break;
      }
    }
    if (p.lots && p.lots.length) {
      // Sai primeiro o lote que vence antes (FEFO)
      let rest = qty;
      for (const l of [...p.lots].sort((a, b) => a.expiry - b.expiry)) {
        const take = Math.min(l.qty, rest);
        l.qty -= take;
        rest -= take;
        if (!rest) break;
      }
      p.lots = p.lots.filter((l) => l.qty > 0);
    }
  }
  function addUnits(s, p, qty, variantId) {
    if (p.variants && p.variants.length) {
      const v = variantId && p.variants.find((x) => x.id === variantId);
      if (v) v.qty += qty;
      else for (const g of gradeFor(p, qty)) p.variants.find((x) => x.id === g.id).qty += g.qty;
    }
    if (p.shelfLifeDays) {
      const t = now(s);
      p.lots = [...(p.lots || []), { id: p.id + "-L" + nextId(s, "scan", ""), code: lotCode(t), qty, expiry: t + p.shelfLifeDays * DAY }];
    }
  }
  const lotsOf = (s, p) =>
    (p.lots || []).map((l) => ({ ...l, daysLeft: Math.ceil((l.expiry - now(s)) / DAY) })).sort((a, b) => a.expiry - b.expiry);

  // ---------------------------------------------------------------------------
  // Preço por canal: ajuste % por canal (ex.: repassar a taxa do marketplace) + promoções
  const roundPrice = (v) => Math.max(0.9, Math.ceil(v) - 0.1); // termina em ,90
  function suggestedMarkup(channelId, s) {
    const f = s ? channelFees(s, channelId).pct : channelById(channelId)?.fee || 0;
    return Math.round((f / (1 - f)) * 100);
  }

  // Taxas do canal: padrão demonstrativo, sobrescrito pelos valores que o lojista informar
  function channelFees(s, channelId) {
    const c = channelById(channelId) || {};
    const own = (s.channelFees || {})[channelId] || {};
    return {
      pct: own.pct ?? c.fee ?? 0,
      fixed: own.fixed ?? c.fixedFee ?? 0,
      below: own.below ?? c.fixedBelow ?? 0,
    };
  }
  // Quanto o canal cobra por "qty" unidades vendidas a "unitPrice"
  function channelFeeFor(s, channelId, unitPrice, qty = 1) {
    const f = channelFees(s, channelId);
    const fixed = f.fixed && (!f.below || unitPrice < f.below) ? f.fixed * qty : 0;
    return round2(unitPrice * qty * f.pct + fixed);
  }
  function feeLabel(s, channelId) {
    const f = channelFees(s, channelId);
    if (!f.pct && !f.fixed) return "sem taxa por venda";
    const pct = dec(round2(f.pct * 100)) + "%";
    if (!f.fixed) return pct;
    return pct + " + " + brl(f.fixed) + " por unidade" + (f.below ? " abaixo de " + brl(f.below) : "");
  }
  function setChannelFees(s, channelId, { pct, fixed, below }) {
    if (!channelById(channelId)) throw Error("Canal inválido.");
    const v = { pct: round2(Number(pct)) / 100, fixed: round2(Number(fixed) || 0), below: round2(Number(below) || 0) };
    if (!(v.pct >= 0 && v.pct <= 0.5)) throw Error("A comissão deve ficar entre 0% e 50%.");
    if (!(v.fixed >= 0 && v.fixed <= 50)) throw Error("A taxa fixa deve ficar entre R$ 0 e R$ 50.");
    if (!(v.below >= 0 && v.below <= 1000)) throw Error("O limite da taxa fixa deve ficar entre R$ 0 e R$ 1.000.");
    s.channelFees = { ...(s.channelFees || {}), [channelId]: v };
    return v;
  }
  // Lucro de uma unidade no canal: preço do canal − custo − taxas. "prejuizo" < 0 ≤ "baixa" < margem mínima ≤ "ok"
  function channelMargin(s, p, channelId) {
    const price = priceFor(s, p, channelId);
    const fee = channelFeeFor(s, channelId, price, 1);
    const profit = round2(price - (p.cost || 0) - fee);
    const pct = price > 0 ? round1((profit / price) * 100) : 0;
    const level = profit < 0 ? "prejuizo" : pct < minMarginOf(s) ? "baixa" : "ok";
    return { price, fee, cost: p.cost || 0, profit, pct, level };
  }
  const minMarginOf = (s) => s.minMargin ?? 10;
  function setMinMargin(s, pct) {
    const v = Math.round(Number(pct));
    if (!(v >= 0 && v <= 80)) throw Error("A margem mínima deve ficar entre 0% e 80%.");
    s.minMargin = v;
    return v;
  }
  // Produtos publicados no canal que dão prejuízo ou ficam abaixo da margem mínima
  function marginAlerts(s, channelId) {
    return s.products
      .filter((p) => p.channels.includes(channelId))
      .map((p) => ({ product: p, ...channelMargin(s, p, channelId) }))
      .filter((m) => m.level !== "ok")
      .sort((a, b) => a.profit - b.profit);
  }
  function activePromo(s, p, channelId) {
    const pr = p.promo;
    return pr && now(s) < pr.until && pr.channels.includes(channelId) ? pr : null;
  }
  function priceFor(s, p, channelId) {
    let v = p.price;
    const mk = (s.channelPricing || {})[channelId] || 0;
    if (mk) v = roundPrice(v * (1 + mk / 100));
    const pr = activePromo(s, p, channelId);
    if (pr) v = roundPrice(v * (1 - pr.pct / 100));
    return round2(v);
  }
  function setChannelMarkup(s, channelId, pct) {
    if (!channelById(channelId)) throw Error("Canal inválido.");
    const v = Math.round(Number(pct));
    if (!(v >= -30 && v <= 80)) throw Error("O ajuste deve ficar entre -30% e +80%.");
    s.channelPricing = s.channelPricing || {};
    s.channelPricing[channelId] = v;
    runAutomations(s);
    return v;
  }
  function applyPromo(s, productId, pct, days = 7, channelIds = ["loja", "site", "whats"]) {
    const p = s.products.find((x) => x.id === productId);
    if (!p) throw Error("Produto não encontrado.");
    const v = Math.round(Number(pct));
    if (!(v >= 5 && v <= 70)) throw Error("A promoção deve ficar entre 5% e 70%.");
    p.promo = { pct: v, channels: channelIds, until: now(s) + days * DAY };
    pushNotification(s, "canal", "Promoção de " + v + "% em " + p.name + " no balcão, no site e no WhatsApp", "produtos");
    runAutomations(s); // atualiza as etiquetas eletrônicas
    return p.promo;
  }
  function clearPromo(s, productId) {
    const p = s.products.find((x) => x.id === productId);
    if (p) delete p.promo;
    runAutomations(s);
  }

  // ---------------------------------------------------------------------------
  // Registros auxiliares
  function pushNotification(s, type, text, route) {
    s.notifications.unshift({ id: nextId(s, "notif", "NT-"), type, text, ts: now(s), read: false, route: route || "" });
    if (s.notifications.length > 40) s.notifications.length = 40;
  }
  function markNotificationRead(s, id) {
    const n = s.notifications.find((x) => x.id === id);
    if (n) n.read = true;
    return n;
  }
  function markNotificationsRead(s) {
    s.notifications.forEach((n) => (n.read = true));
  }
  function log(s, rule, text) {
    s.automationLog.unshift({ id: nextId(s, "log", "AUT-"), rule, text, ts: now(s) });
    if (s.automationLog.length > 60) s.automationLog.length = 60;
  }
  function sendMessage(s, to, phone, text, orderId) {
    const m = { id: nextId(s, "msg", "MSG-"), to, phone, text, orderId: orderId || "", ts: now(s) };
    s.messages.unshift(m);
    return m;
  }
  function scan(s, type, p, location) {
    s.scanLog.unshift({ id: nextId(s, "scan", "SC-"), type, sku: p.sku, product: p.name, location, ts: now(s) });
    if (s.scanLog.length > 80) s.scanLog.length = 80;
  }
  function pickupMessage(s, o) {
    return (
      "Olá, " + o.customer.name.split(" ")[0] + "! Seu pedido " + o.id + " na " + s.store.name +
      " está pronto para retirada" + (shopsOf(s).length > 1 ? " na " + locName(s, o.store || "loja") + " (" + (shopsOf(s).find((x) => x.id === (o.store || "loja"))?.address || s.store.address) + ")" : "") +
      ". Mostre o código " + o.pickupCode + " no balcão. Horário: " + s.store.pickupHours + "."
    );
  }
  function generateInvoice(s, order) {
    const inv = {
      id: nextId(s, "nf", "NF-"),
      key: pseudoDigits("NF" + s.seq.nf + "-" + order.id, 44),
      items: order.items.map((it) => ({ name: it.name, sku: it.sku, qty: it.qty, price: it.price })),
      total: order.total,
      orderId: order.id,
      channel: order.channel,
      ts: now(s),
    };
    s.invoices.unshift(inv);
    order.invoiceId = inv.id;
    return inv;
  }
  function generateLabel(s, order) {
    const qty = order.items.reduce((a, it) => a + it.qty, 0);
    const lbl = {
      id: nextId(s, "etq", "ETQ-"),
      trackingCode: "WT" + pseudoDigits("ETQ-" + order.id, 10),
      orderId: order.id,
      channel: order.channel,
      recipient: order.customer.name + (order.customer.address ? " · " + order.customer.address : ""),
      weight: Math.max(0.2, round1(qty * 0.35)),
      ts: now(s),
    };
    s.labels.unshift(lbl);
    order.labelId = lbl.id;
    return lbl;
  }

  // ---------------------------------------------------------------------------
  // Pedidos de todos os canais
  function createOrder(s, { channel, type, customer, items, shipping = 0, store = "loja" }) {
    const ch = channelById(channel);
    if (!ch) throw Error("Canal inválido.");
    if (!s.connected.includes(channel)) throw Error(ch.name + " não está conectado.");
    if (!["retirada", "entrega"].includes(type)) throw Error("Tipo de pedido inválido.");
    if (!items || !items.length) throw Error("O pedido não tem itens.");
    const name = String(customer?.name || "").trim();
    if (!name) throw Error("Informe o nome do cliente.");
    if (!shopIds(s).includes(store)) throw Error("Loja de retirada inválida.");
    const lines = [];
    // Valida tudo antes de reservar qualquer item
    for (const [key, qty] of groupItems(items)) {
      const [productId, variantId] = key.split("|");
      const p = s.products.find((x) => x.id === productId);
      if (!p) throw Error("Produto não encontrado.");
      const status = channelStatus(s, p, channel);
      if (status !== "ativo")
        throw Error(p.name + ": " + channelStatusLabel[status].toLowerCase() + " em " + ch.name + ".");
      const v = pickVariant(s, p, variantId || null, qty);
      for (const part of allocate(s, p, qty, prefersLoja(channel, type), store))
        lines.push(orderLine(p, v, part, priceFor(s, p, channel), false));
    }
    const o = {
      id: nextId(s, "order", "PED-"),
      channel,
      type,
      customer: { name, phone: String(customer.phone || "").trim(), address: String(customer.address || "").trim() },
      items: lines,
      total: round2(lines.reduce((a, l) => a + l.price * l.qty, 0)),
      shipping: round2(Number(shipping) || 0),
      status: "novo",
      ts: now(s),
    };
    if (type === "retirada") {
      o.pickupCode = "RET-" + pseudoDigits(o.id + o.ts, 6);
      o.store = store;
    }
    s.orders.push(o);
    if (channel === "site") s.onboarding.siteSale = true;
    pushNotification(
      s,
      "pedido",
      "Novo pedido " + (ch.kind === "marketplace" ? "no " : "pelo ") + ch.name + ": " + o.id + (type === "retirada" ? " para retirar na loja" : " para entregar"),
      "pedidos",
    );
    runAutomations(s);
    return o;
  }

  // Venda no balcão (PDV): baixa imediata do estoque, sem reserva
  function sellCounter(s, cart, opts = {}) {
    if (!cart || !cart.length) throw Error("Adicione pelo menos um produto.");
    const method = opts.payment || "pix";
    if (!paymentMethods[method]) throw Error("Forma de pagamento inválida.");
    const store = opts.store && shopIds(s).includes(opts.store) ? opts.store : "loja";
    const lines = [];
    for (const [key, qty] of groupItems(cart)) {
      const [productId, variantId] = key.split("|");
      const p = s.products.find((x) => x.id === productId);
      if (!p) throw Error("Produto não encontrado.");
      const v = pickVariant(s, p, variantId || null, qty);
      for (const part of allocate(s, p, qty, true, store)) lines.push(orderLine(p, v, part, priceFor(s, p, "loja"), true));
    }
    const total = round2(lines.reduce((a, l) => a + l.price * l.qty, 0));
    if (method === "dinheiro" && opts.received !== undefined && Number(opts.received) < total)
      throw Error("Valor recebido menor que o total da compra.");
    let credit = null;
    if (method === "vale") {
      credit = (s.credits || []).find((c) => c.code === String(opts.credit || "").trim().toUpperCase());
      if (!credit) throw Error("Vale-troca não encontrado.");
      if (credit.balance < total) throw Error("O vale " + credit.code + " tem " + brl(credit.balance) + ". Tire itens ou use outra forma de pagamento.");
    }
    const o = {
      id: nextId(s, "order", "PED-"),
      channel: "loja",
      type: "balcao",
      customer: { name: "Cliente do balcão", phone: "" },
      items: lines,
      total,
      shipping: 0,
      status: "concluido",
      ts: now(s),
      payment: {
        method,
        fee: paymentMethods[method].fee,
        received: method === "dinheiro" && opts.received !== undefined ? round2(Number(opts.received)) : undefined,
        change: method === "dinheiro" && opts.received !== undefined ? round2(Number(opts.received) - total) : undefined,
        credit: credit ? credit.code : undefined,
      },
      store,
    };
    if (opts.registerId) o.registerId = opts.registerId;
    if (credit) credit.balance = round2(credit.balance - total);
    s.orders.push(o);
    takeStock(s, o);
    const invoice = generateInvoice(s, o);
    for (const l of lines) scan(s, "saida", l, "Balcão · " + locName(s, store));
    pushNotification(s, "venda", "Venda no balcão: " + lines.map((l) => l.name + " × " + l.qty).join(", "), "pedidos");
    runAutomations(s);
    return { order: o, invoice };
  }

  // Agrupa itens iguais (mesmo produto e mesmo tamanho/modelo)
  function groupItems(items) {
    const m = new Map();
    for (const it of items) {
      const key = it.productId + "|" + (it.variantId || "");
      m.set(key, (m.get(key) || 0) + Math.max(1, Math.round(Number(it.qty) || 1)));
    }
    return m;
  }
  function orderLine(p, v, part, price, scanned) {
    return {
      productId: p.id,
      variantId: v ? v.id : undefined,
      sku: v ? v.sku : p.sku,
      name: p.name + (v ? " · " + v.label : ""),
      emoji: p.emoji,
      qty: part.qty,
      price,
      source: part.source,
      scanned,
    };
  }

  // Loja → casa do cliente: venda feita no balcão com entrega
  function sellCounterDelivery(s, cart, customer, store = "loja", registerId) {
    const o = createOrder(s, { channel: "loja", type: "entrega", customer, items: cart, store });
    if (registerId) o.registerId = registerId;
    return o;
  }

  // ---------------------------------------------------------------------------
  // Caixa: abertura e fechamento.
  // "fisico": um caixa por loja, com fundo de troco, sangria, suprimento e contagem do dinheiro.
  // "online": fechamento do dia das vendas pelo site, WhatsApp e marketplaces (sem dinheiro em espécie);
  // cobre tudo o que entrou desde o fechamento anterior, porque pedido online chega a qualquer hora.
  const ONLINE_REGISTER = "online";
  function registersOf(s) {
    s.cashRegisters = s.cashRegisters || [];
    return s.cashRegisters;
  }
  function openRegisterFor(s, kind, store = "loja") {
    return registersOf(s).find((r) => r.status === "aberto" && r.kind === kind && (kind === "online" || r.store === store)) || null;
  }
  // O caixa virtual cobre desde o último fechamento; o primeiro de todos cobre o dia inteiro
  function onlineSince(s) {
    const last = registersOf(s).find((r) => r.kind === "online" && r.status === "fechado");
    if (last) return last.closedAt;
    const d = new Date(now(s));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function openRegister(s, { kind = "fisico", store = "loja", float = 0 } = {}) {
    if (!["fisico", "online"].includes(kind)) throw Error("Tipo de caixa inválido.");
    if (kind === "fisico" && !shopIds(s).includes(store)) throw Error("Loja inválida.");
    if (openRegisterFor(s, kind, store)) throw Error(kind === "online" ? "O caixa da loja virtual já está aberto." : "O caixa da " + locName(s, store) + " já está aberto.");
    const value = kind === "online" ? 0 : round2(Number(float) || 0);
    if (!(value >= 0 && value <= 100000)) throw Error("O fundo de troco deve ficar entre R$ 0 e R$ 100.000.");
    const r = {
      id: nextId(s, "cx", "CX-"),
      kind,
      store: kind === "online" ? ONLINE_REGISTER : store,
      status: "aberto",
      openedAt: now(s),
      since: kind === "online" ? onlineSince(s) : now(s),
      float: value,
      movements: [],
    };
    registersOf(s).unshift(r);
    s.cashRegisters = s.cashRegisters.slice(0, 60);
    return r;
  }
  function registerSales(s, r) {
    if (r.kind === "fisico") return s.orders.filter((o) => o.registerId === r.id);
    const until = r.closedAt ?? now(s);
    return s.orders.filter((o) => o.channel !== "loja" && o.status !== "expirado" && o.ts >= r.since && o.ts <= until);
  }
  function registerSummary(s, r) {
    const sales = registerSales(s, r);
    const total = round2(sales.reduce((a, o) => a + o.total, 0));
    if (r.kind === "online") {
      const byChannel = [...new Set(sales.map((o) => o.channel))].map((id) => {
        const os = sales.filter((o) => o.channel === id);
        const gross = round2(os.reduce((a, o) => a + o.total, 0));
        const fees = round2(os.reduce((a, o) => a + o.items.reduce((b, it) => b + channelFeeFor(s, id, it.price, it.qty), 0), 0));
        return { channel: id, name: channelById(id)?.name || id, count: os.length, gross, fees, net: round2(gross - fees) };
      });
      const fees = round2(byChannel.reduce((a, c) => a + c.fees, 0));
      return { count: sales.length, total, fees, net: round2(total - fees), byChannel };
    }
    const byMethod = Object.keys(paymentMethods).map((m) => {
      const os = sales.filter((o) => o.payment?.method === m);
      return { method: m, label: paymentMethods[m].label, count: os.length, total: round2(os.reduce((a, o) => a + o.total, 0)) };
    });
    const cashSales = byMethod.find((x) => x.method === "dinheiro").total;
    const supply = round2(r.movements.filter((m) => m.type === "suprimento").reduce((a, m) => a + m.value, 0));
    const withdraw = round2(r.movements.filter((m) => m.type === "sangria").reduce((a, m) => a + m.value, 0));
    const refunds = round2(r.movements.filter((m) => m.type === "estorno").reduce((a, m) => a + m.value, 0));
    return { count: sales.length, total, byMethod, cashSales, supply, withdraw, refunds, expectedCash: round2(r.float + cashSales + supply - withdraw - refunds) };
  }
  function registerMovement(s, registerId, { type, value, reason }) {
    const r = registersOf(s).find((x) => x.id === registerId);
    if (!r || r.status !== "aberto") throw Error("Abra o caixa primeiro.");
    if (r.kind !== "fisico") throw Error("A loja virtual não tem dinheiro em espécie.");
    if (!["sangria", "suprimento"].includes(type)) throw Error("Movimento inválido.");
    const v = round2(Number(value));
    if (!(v > 0 && v <= 100000)) throw Error("Informe um valor maior que zero.");
    if (type === "sangria" && v > registerSummary(s, r).expectedCash) throw Error("Não há " + brl(v) + " em dinheiro neste caixa.");
    const m = { type, value: v, reason: String(reason || "").trim().slice(0, 80), ts: now(s) };
    r.movements.push(m);
    return m;
  }
  function closeRegister(s, registerId, { counted } = {}) {
    const r = registersOf(s).find((x) => x.id === registerId);
    if (!r || r.status !== "aberto") throw Error("Este caixa não está aberto.");
    const summary = registerSummary(s, r);
    if (r.kind === "fisico") {
      const c = round2(Number(counted));
      if (counted === "" || counted === undefined || !(c >= 0)) throw Error("Conte o dinheiro da gaveta e informe o valor.");
      r.counted = c;
      r.difference = round2(c - summary.expectedCash);
    }
    r.closedAt = now(s);
    r.status = "fechado";
    r.summary = summary;
    return r;
  }

  function orderById(s, id) {
    const o = s.orders.find((o) => o.id === id);
    if (!o) throw Error("Pedido não encontrado.");
    return o;
  }

  // Bipagem de um item durante a separação: confere se o código pertence ao pedido
  function scanOrderItem(s, orderId, code) {
    const o = orderById(s, orderId);
    if (o.status !== "novo" && o.status !== "separando") throw Error("Este pedido já foi separado.");
    const c = String(code || "").trim().toLowerCase();
    if (!c) throw Error("Informe um código de barras ou SKU.");
    let found = null;
    try {
      found = resolveCode(s, c);
    } catch {}
    const item = o.items.find(
      (it) =>
        !it.scanned &&
        (it.sku.toLowerCase() === c || (found && it.productId === found.product.id && (!found.variant || found.variant.id === it.variantId))),
    );
    if (!item) throw Error("Este código não pertence a este pedido ou o item já foi separado.");
    item.scanned = true;
    o.status = "separando";
    scan(s, "separacao", item, "Separação " + o.id);
    return o;
  }

  function confirmSeparation(s, orderId) {
    const o = orderById(s, orderId);
    if (o.status !== "novo" && o.status !== "separando") throw Error("Este pedido já foi separado.");
    if (o.items.some((it) => !it.scanned)) throw Error("Bipe todos os itens antes de confirmar a separação.");
    if (o.type === "retirada") {
      o.status = "pronto";
      o.readyTs = now(s);
      if (s.automations.avisarCliente) {
        sendMessage(s, o.customer.name, o.customer.phone, pickupMessage(s, o), o.id);
        log(s, "avisarCliente", "Avisei " + o.customer.name + " pelo WhatsApp: pedido " + o.id + " pronto para retirada.");
      }
    } else {
      o.status = "separado";
    }
    runAutomations(s);
    return o;
  }

  // Cliente chegou na loja: bipa o QR/código de retirada e entrega o pedido
  function deliverPickup(s, orderId, code) {
    const o = orderById(s, orderId);
    if (o.type !== "retirada") throw Error("Este pedido não é de retirada na loja.");
    if (o.status === "retirado") throw Error("Este pedido já foi retirado.");
    if (o.status === "expirado") throw Error("A reserva deste pedido expirou.");
    if (o.status !== "pronto") throw Error("Separe o pedido antes de entregar ao cliente.");
    const c = String(code || "").trim().toUpperCase();
    if (c !== o.pickupCode && c !== o.id) throw Error("Código de retirada não confere com o pedido " + o.id + ".");
    takeStock(s, o);
    o.status = "retirado";
    o.doneTs = now(s);
    generateInvoice(s, o);
    for (const it of o.items) scan(s, "retirada", it, "Balcão de retirada");
    pushNotification(s, "venda", "Pedido " + o.id + " retirado por " + o.customer.name, "pedidos");
    runAutomations(s);
    return o;
  }
  function deliverByCode(s, code) {
    const c = String(code || "").trim().toUpperCase();
    if (!c) throw Error("Informe o código de retirada.");
    const o = s.orders.find((o) => o.type === "retirada" && (o.pickupCode === c || o.id === c));
    if (!o) throw Error("Nenhum pedido de retirada com este código.");
    return deliverPickup(s, o.id, c);
  }

  function dispatchOrder(s, orderId) {
    const o = orderById(s, orderId);
    if (o.type !== "entrega") throw Error("Este pedido não é de entrega.");
    if (o.status !== "separado") throw Error("Separe todos os itens do pedido antes de despachar.");
    takeStock(s, o);
    o.status = "enviado";
    o.doneTs = now(s);
    generateInvoice(s, o);
    const label = generateLabel(s, o);
    if (s.automations.avisarCliente && o.customer.phone && !isExternal(o.channel)) {
      sendMessage(s, o.customer.name, o.customer.phone, "Olá, " + o.customer.name.split(" ")[0] + "! Seu pedido " + o.id + " saiu para entrega. Rastreio: " + label.trackingCode + ".", o.id);
      log(s, "avisarCliente", "Avisei " + o.customer.name + " pelo WhatsApp: pedido " + o.id + " saiu para entrega.");
    }
    pushNotification(s, "despacho", "Pedido " + o.id + " saiu para entrega", "pedidos");
    runAutomations(s);
    return o;
  }

  // Simula um novo pedido chegando por um canal online (operação ao vivo / demo)
  function simulateOrder(s, channel) {
    const ch = channelById(channel);
    if (!ch || channel === "loja") throw Error("Canal inválido para simulação.");
    if (!s.connected.includes(channel)) throw Error(ch.name + " não está conectado.");
    const pool = s.products.filter(
      (p) => channelStatus(s, p, channel) === "ativo" && stockOf(s, p).disponivel > p.minStock + 3,
    );
    if (!pool.length) throw Error("Nenhum produto disponível para vender em " + ch.name + ".");
    const n = s.seq.order;
    const p = pool[n % pool.length];
    const names = ["Mariana Dias", "Thiago Moreira", "Patrícia Gomes", "Bruno Carvalho", "Letícia Freitas", "Gustavo Pires"];
    const type = isExternal(channel) ? "entrega" : n % 2 ? "retirada" : "entrega";
    return createOrder(s, {
      channel,
      type,
      customer: { name: names[n % names.length], phone: "(11) 9" + (4000 + (n % 5000)) + "-" + (1000 + (n % 8999)), address: type === "entrega" ? "Rua do Bairro, " + (10 + (n % 300)) : "" },
      items: [{ productId: p.id, qty: 1 }],
    });
  }

  // ---------------------------------------------------------------------------
  // Estoque físico: entrada (IoT), transferência loja ⇄ depósito
  function receiveGoods(s, code, qty, location = "deposito") {
    const { product: p, variant } = resolveCode(s, code);
    const n = Math.max(1, Math.min(9999, Math.round(Number(qty) || 1)));
    let loc = locationIds(s).includes(location) ? location : "deposito";
    if (loc === "deposito" && !s.store.hasDeposito) loc = "loja";
    p.stock[loc] = (p.stock[loc] || 0) + n;
    addUnits(s, p, n, variant ? variant.id : null);
    scan(s, "entrada", p, locName(s, loc));
    // Confere contra pedidos ao fornecedor a caminho
    let po = null;
    for (const candidate of s.purchaseOrders) {
      if (candidate.status !== "enviado") continue;
      const it = candidate.items.find((i) => i.productId === p.id && i.received < i.qty);
      if (!it) continue;
      it.received = Math.min(it.qty, it.received + n);
      po = candidate;
      if (candidate.items.every((i) => i.received >= i.qty)) {
        candidate.status = "recebido";
        candidate.receivedTs = now(s);
        pushNotification(s, "compra", "Pedido " + candidate.id + " recebido: estoque reposto", "compras");
      }
      break;
    }
    runAutomations(s);
    return { product: p, po };
  }
  function transferStock(s, productId, from, to, qty) {
    if (!s.store.hasDeposito && (from === "deposito" || to === "deposito")) throw Error("Sua loja está configurada sem depósito separado.");
    const p = s.products.find((x) => x.id === productId);
    if (!p) throw Error("Produto não encontrado.");
    if (!locationIds(s).includes(from) || !locationIds(s).includes(to) || from === to) throw Error("Transferência inválida.");
    const n = Math.max(1, Math.round(Number(qty) || 1));
    const free = stockOf(s, p).byLoc.find((l) => l.id === from).free;
    if (free < n) throw Error("Só há " + free + " un. livres em " + locName(s, from) + ".");
    p.stock[from] -= n;
    p.stock[to] = (p.stock[to] || 0) + n;
    scan(s, "transferencia", p, locName(s, from) + " → " + locName(s, to));
    runAutomations(s);
    return p;
  }
  // Quantidade sugerida para repor a prateleira a partir do depósito
  function shelfRefill(s, p) {
    const st = stockOf(s, p);
    return Math.max(0, Math.min(st.livreDeposito, (p.shelfCap || 12) - p.stock.loja));
  }

  // ---------------------------------------------------------------------------
  // Pedidos ao fornecedor
  function suggestPOQty(p, sup, avail, daily = p.avgDaily || 0) {
    const lead = sup.leadTimeDays;
    let qty = Math.ceil(Math.max(p.minStock * 2 - avail, daily * (lead + 7) - avail, 5));
    if (p.cost > 0 && qty * p.cost < (sup.minOrder || 0)) qty = Math.ceil(sup.minOrder / p.cost);
    return qty;
  }
  function confirmPurchaseOrder(s, poId, qtys) {
    const po = s.purchaseOrders.find((x) => x.id === poId);
    if (!po) throw Error("Pedido de compra não encontrado.");
    if (po.status !== "aguardando") throw Error("Este pedido já foi enviado.");
    if (qtys)
      po.items.forEach((it) => {
        const q = Math.round(Number(qtys[it.productId]));
        if (q > 0) it.qty = Math.min(9999, q);
      });
    const sup = s.suppliers.find((f) => f.id === po.supplierId);
    po.status = "enviado";
    po.sentTs = now(s);
    po.etaTs = now(s) + (sup ? sup.leadTimeDays : 5) * DAY;
    if (sup)
      sendMessage(
        s,
        sup.name,
        sup.whatsapp,
        "Olá! Pedido " + po.id + " da " + s.store.name + ": " + po.items.map((i) => i.name + " × " + i.qty).join(", ") + ". Aguardamos a entrega em até " + plural(sup.leadTimeDays, "dia", "dias") + ".",
        po.id,
      );
    pushNotification(s, "compra", "Pedido " + po.id + " enviado para " + (sup ? sup.name : "o fornecedor"), "compras");
    runAutomations(s);
    return po;
  }
  function discardPurchaseOrder(s, poId) {
    const po = s.purchaseOrders.find((x) => x.id === poId);
    if (!po) throw Error("Pedido de compra não encontrado.");
    if (po.status !== "aguardando") throw Error("Só é possível descartar pedidos aguardando confirmação.");
    po.status = "descartado";
    // Não sugere de novo nas próximas 24 h
    for (const it of po.items) {
      const p = s.products.find((x) => x.id === it.productId);
      if (p) p.poSnoozeUntil = now(s) + DAY;
    }
    return po;
  }
  // Recebe o pedido inteiro de uma vez (sem bipar item a item)
  function receivePurchaseOrder(s, poId) {
    const po = s.purchaseOrders.find((x) => x.id === poId);
    if (!po) throw Error("Pedido de compra não encontrado.");
    if (po.status === "recebido") throw Error("Este pedido já foi recebido.");
    if (po.status !== "enviado") throw Error("Confirme e envie o pedido antes de receber.");
    for (const it of po.items) {
      const p = s.products.find((x) => x.id === it.productId);
      const rest = it.qty - it.received;
      if (p && rest > 0) {
        p.stock[s.store.hasDeposito ? "deposito" : "loja"] += rest;
        addUnits(s, p, rest, null);
        scan(s, "entrada", p, s.store.hasDeposito ? "Depósito" : "Loja");
      }
      it.received = it.qty;
    }
    po.status = "recebido";
    po.receivedTs = now(s);
    pushNotification(s, "compra", "Pedido " + po.id + " recebido: estoque reposto", "compras");
    runAutomations(s);
    return po;
  }

  // ---------------------------------------------------------------------------
  // Automações: rodam sozinhas depois de qualquer mudança no estoque ou nos pedidos
  function runAutomations(s) {
    const A = s.automations;
    const t = now(s);
    // Reservas de retirada que passaram de 48 h voltam a ficar à venda
    if (A.expirarReservas)
      for (const o of s.orders) {
        if (o.type !== "retirada" || !OPEN.includes(o.status)) continue;
        if (t - (o.readyTs || o.ts) <= RESERVA_MS) continue;
        o.status = "expirado";
        log(s, "expirarReservas", "Reserva do pedido " + o.id + " (" + o.customer.name + ") expirou após 48 h. Liberei " + plural(o.items.reduce((a, i) => a + i.qty, 0), "unidade", "unidades") + " para venda.");
        if (A.avisarCliente && o.customer.phone)
          sendMessage(s, o.customer.name, o.customer.phone, "Olá, " + o.customer.name.split(" ")[0] + ". Seu pedido " + o.id + " não foi retirado em 48 h e a reserva foi cancelada. Qualquer dúvida, é só chamar!", o.id);
      }
    // Validade dos lotes (produtos perecíveis)
    for (const p of s.products) {
      if (!p.lots || !p.lots.length) continue;
      for (const l of p.lots) {
        const daysLeft = (l.expiry - t) / DAY;
        if (l.qty > 0 && daysLeft <= 0 && A.retirarVencidos) {
          // Tira da venda: primeiro da prateleira (onde o cliente pegaria), depois do depósito
          let rest = l.qty;
          for (const loc of locationIds(s)) {
            const take = Math.min(p.stock[loc] || 0, rest);
            p.stock[loc] -= take;
            rest -= take;
          }
          const value = round2(l.qty * p.cost);
          s.losses = s.losses || [];
          s.losses.push({ productId: p.id, name: p.name, qty: l.qty, value, lot: l.code, ts: t });
          log(s, "retirarVencidos", "Lote " + l.code + " de " + p.name + " venceu: dei baixa em " + plural(l.qty, "unidade", "unidades") + " em todos os canais (perda de " + brl(value) + ").");
          pushNotification(s, "estoque", "Lote vencido retirado da venda: " + p.name + " (" + l.qty + " un.)", "estoque");
          l.qty = 0;
        } else if (l.qty > 0 && daysLeft > 0 && daysLeft <= 7 && A.alertaValidade && !l.alerted) {
          l.alerted = true;
          l.suggestedDiscount = daysLeft <= 2 ? 40 : daysLeft <= 4 ? 30 : 20;
          const d = Math.ceil(daysLeft);
          log(s, "alertaValidade", p.name + ": lote " + l.code + " com " + plural(l.qty, "unidade vence", "unidades vencem") + " em " + plural(d, "dia", "dias") + ". Sugiro promoção de " + l.suggestedDiscount + "% no balcão, no site e no WhatsApp — esse lote sai primeiro.");
          pushNotification(s, "estoque", p.name + ": " + l.qty + " un. vencem em " + plural(d, "dia", "dias"), "estoque");
        }
      }
      p.lots = p.lots.filter((l) => l.qty > 0);
    }
    // Etiquetas eletrônicas: o preço da prateleira acompanha o preço/promoção da loja
    for (const p of s.products) {
      const price = priceFor(s, p, "loja");
      const promo = activePromo(s, p, "loja");
      if (!p.esl) {
        p.esl = { price, promoPct: promo ? promo.pct : 0, ts: t };
        continue;
      }
      if (p.esl.price === price) {
        p.esl.outdated = false;
        continue;
      }
      if (!A.etiquetaEletronica) {
        p.esl.outdated = true;
        continue;
      }
      const old = p.esl.price;
      p.esl = { price, promoPct: promo ? promo.pct : 0, ts: t };
      log(
        s,
        "etiquetaEletronica",
        "Etiqueta eletrônica de " + p.name + " atualizada " + (shopsOf(s).length > 1 ? "em " + plural(shopsOf(s).length, "loja", "lojas") : "na " + p.shelf) + ": " + brl(old) + " → " + brl(price) + (promo ? " (promoção -" + promo.pct + "%)" : "") + ".",
      );
    }
    for (const p of s.products) {
      const st = stockOf(s, p);
      const avail = st.disponivel;
      const sup = supplierOf(s, p);
      const lead = sup ? sup.leadTimeDays : null;
      const daily = dailyOf(s, p);
      const days = daily > 0 ? avail / daily : null;
      // 1) Estoque mínimo → IA prepara o pedido ao fornecedor
      if (A.autoPedidoCompra && sup && avail <= p.minStock && !hasOpenPO(s, p.id) && !(p.poSnoozeUntil > t)) {
        const qty = suggestPOQty(p, sup, avail, daily);
        const po = {
          id: nextId(s, "po", "PC-"),
          supplierId: sup.id,
          items: [{ productId: p.id, sku: p.sku, name: p.name, qty, received: 0, cost: p.cost }],
          status: "aguardando",
          byAI: true,
          reason:
            p.name + " chegou a " + plural(avail, "unidade", "unidades") + " (seu mínimo é " + p.minStock + "). Vende ~" +
            dec(round1(p.avgDaily)) + " por dia e " + sup.name + " entrega em " + plural(lead, "dia", "dias") + ".",
          ts: t,
        };
        s.purchaseOrders.unshift(po);
        log(s, "autoPedidoCompra", "Preparei o pedido " + po.id + " para " + sup.name + ": " + p.name + " × " + qty + ". Falta só você confirmar.");
        pushNotification(s, "compra", "A IA preparou o pedido " + po.id + " (" + p.name + "). Confirme para enviar.", "compras");
      }
      // 2) Trava de anúncios nos marketplaces
      const lockPrazo = avail > 0 && avail <= p.minStock && lead !== null && days !== null && days < lead && !(p.lockIgnoreUntil > t);
      if (avail <= 0 && A.pausarSemEstoque) {
        if (!p.lock || p.lock.kind !== "zero") {
          p.lock = { kind: "zero", ts: t };
          log(s, "pausarSemEstoque", p.name + " zerou: pausei os anúncios em todos os canais online. Nenhuma venda sem estoque.");
          pushNotification(s, "estoque", p.name + " esgotou: anúncios pausados em todos os canais", "estoque");
        }
      } else if (lockPrazo && A.travaAnuncios) {
        if (!p.lock) {
          p.lock = { kind: "prazo", ts: t };
          log(
            s,
            "travaAnuncios",
            "Pausei os anúncios de " + p.name + " nos marketplaces: acaba em ~" + dec(round1(days)) + " dias e " + sup.name + " entrega em " + plural(lead, "dia", "dias") + ". As " + avail + " un. restantes ficam para a loja e o site.",
          );
          pushNotification(s, "estoque", "Anúncios de " + p.name + " pausados nos marketplaces (acaba antes da entrega do fornecedor)", "estoque");
        } else if (p.lock.kind === "zero") p.lock.kind = "prazo";
      } else if (p.lock) {
        const ruleOff = (p.lock.kind === "prazo" && !A.travaAnuncios) || (p.lock.kind === "zero" && !A.pausarSemEstoque);
        if (A.reativarAnuncios || ruleOff) {
          p.lock = null;
          log(s, "reativarAnuncios", "Estoque de " + p.name + " normalizado (" + avail + " un.): reativei os anúncios em todos os canais.");
          pushNotification(s, "estoque", "Anúncios de " + p.name + " reativados", "estoque");
        }
      }
      // 3) Sensor de prateleira (IoT)
      const shelfLow = st.livreLoja <= SHELF_MIN && st.livreDeposito > 0;
      if (A.reporPrateleira && shelfLow && !p.shelfAlert) {
        p.shelfAlert = true;
        log(s, "reporPrateleira", "Sensor da " + p.shelf + ": " + p.name + " quase vazia (" + st.livreLoja + " un.). Tem " + st.livreDeposito + " no depósito.");
        pushNotification(s, "estoque", "Sensor: " + p.name + " quase acabando na prateleira", "iot");
      } else if (!shelfLow && p.shelfAlert) p.shelfAlert = false;
    }
  }

  // Nova loja física (filial): começa vazia e é abastecida por transferência
  function addShop(s, draft) {
    const name = String(draft.name || "").trim();
    if (!name) throw Error("Informe o nome da loja.");
    const plan = planUsage(s).plan;
    if (shopsOf(s).length >= plan.maxShops)
      throw Error("Seu plano " + plan.name + " inclui até " + plural(plan.maxShops, "loja", "lojas") + ". Fale com seu consultor para ampliar.");
    if (shopsOf(s).some((x) => x.name.toLowerCase() === name.toLowerCase())) throw Error("Já existe uma loja com esse nome.");
    s.shops = shopsOf(s);
    const id = "loja" + (s.shops.length + 1);
    const shop = { id, name, address: String(draft.address || "").trim() || s.store.address };
    s.shops.push(shop);
    s.products.forEach((p) => (p.stock[id] = 0));
    log(s, "reporPrateleira", "Nova loja cadastrada: " + name + ". O estoque dela entra na soma de todos os canais. Abasteça pelo depósito com uma transferência.");
    pushNotification(s, "estoque", "Loja " + name + " cadastrada. Transfira produtos do depósito para abastecer.", "estoque");
    return shop;
  }
  // Sugestão da IA para abastecer uma loja: o que falta nela e tem no depósito
  function restockSuggestion(s, shopId) {
    return s.products
      .map((p) => {
        const st = stockOf(s, p);
        const here = st.byLoc.find((l) => l.id === shopId)?.free || 0;
        const target = Math.max(2, Math.ceil((p.avgDaily || 1) * 3));
        const qty = Math.min(st.livreDeposito, Math.max(0, target - here));
        return { productId: p.id, name: p.name, here, qty };
      })
      .filter((x) => x.qty > 0);
  }
  function restockShop(s, shopId) {
    if (!shopIds(s).includes(shopId)) throw Error("Loja inválida.");
    const list = restockSuggestion(s, shopId);
    if (!list.length) throw Error("Nada para transferir: a loja já está abastecida ou o depósito está vazio.");
    for (const x of list) transferStock(s, x.productId, "deposito", shopId, x.qty);
    log(s, "reporPrateleira", "Abasteci a " + locName(s, shopId) + " com " + plural(list.reduce((a, x) => a + x.qty, 0), "unidade", "unidades") + " do depósito (" + plural(list.length, "produto", "produtos") + ").");
    return list;
  }

  // Devolução e troca em qualquer canal: comprou online, devolve na loja (e vice-versa)
  const DONE = ["retirado", "enviado", "concluido"];
  function returnedQty(o, index) {
    return (o.returns || []).reduce((a, r) => a + r.lines.filter((l) => l.index === index).reduce((b, l) => b + l.qty, 0), 0);
  }
  function findOrderByDoc(s, code) {
    const c = String(code || "").trim().toUpperCase();
    if (!c) throw Error("Informe o número do pedido, da nota ou o código de retirada.");
    const o = s.orders.find((o) => o.id === c || o.invoiceId === c || o.pickupCode === c);
    if (!o) throw Error("Pedido não encontrado. Confira o número na nota ou no aplicativo.");
    return o;
  }
  function registerReturn(s, orderId, { lines, reason = "Não serviu", condition = "venda", refund = "vale", store = "loja" }) {
    const o = orderById(s, orderId);
    if (!DONE.includes(o.status)) throw Error("Só dá para devolver pedidos já entregues ao cliente.");
    if (!shopIds(s).includes(store)) throw Error("Loja inválida.");
    const picked = (lines || []).filter((l) => Number(l.qty) > 0);
    if (!picked.length) throw Error("Escolha pelo menos um item para devolver.");
    const out = [];
    let value = 0;
    for (const l of picked) {
      const it = o.items[l.index];
      if (!it) throw Error("Item inválido.");
      const qty = Math.round(Number(l.qty));
      const left = it.qty - returnedQty(o, l.index);
      if (qty > left) throw Error(it.name + ": só " + plural(left, "unidade pode", "unidades podem") + " ser devolvidas.");
      const p = s.products.find((x) => x.id === it.productId);
      // Alimento devolvido nunca volta para a venda
      const back = condition === "venda" && p && !p.shelfLifeDays;
      if (back) {
        p.stock[store] = (p.stock[store] || 0) + qty;
        addUnits(s, p, qty, it.variantId);
      }
      value += it.price * qty;
      out.push({ index: l.index, qty, name: it.name, back, cost: p ? p.cost * qty : 0 });
    }
    // "nenhum": disputa ganha pela loja no marketplace — o produto volta, mas ninguém é reembolsado
    value = refund === "nenhum" ? 0 : round2(value);
    const r = { id: nextId(s, "order", "DEV-"), lines: out, value, reason, condition, refund, store, ts: now(s) };
    // Estorno em dinheiro de uma venda paga em dinheiro sai da gaveta do caixa aberto
    const register = openRegisterFor(s, "fisico", store);
    if (refund === "estorno" && value > 0 && o.payment?.method === "dinheiro" && register) {
      register.movements.push({ type: "estorno", value, reason: "Devolução " + o.id, ts: r.ts });
      r.registerId = register.id;
    }
    if (refund === "vale") {
      r.creditCode = "VALE-" + pseudoDigits(r.id + r.ts, 5);
      s.credits = s.credits || [];
      s.credits.push({ code: r.creditCode, value, balance: value, customer: o.customer.name, orderId: o.id, ts: r.ts });
    }
    o.returns = [...(o.returns || []), r];
    const units = out.reduce((a, x) => a + x.qty, 0);
    const backUnits = out.filter((x) => x.back).reduce((a, x) => a + x.qty, 0);
    log(
      s,
      "devolucao",
      "Devolução do pedido " + o.id + " (" + channelById(o.channel).name + ") recebida na " + locName(s, store) + ": " + plural(units, "unidade", "unidades") +
        (backUnits ? ", " + (backUnits === 1 ? "1 voltou" : backUnits + " voltaram") + " para a venda em todos os canais" : ", separada" + (units === 1 ? "" : "s") + " como avaria") +
        ". " + (refund === "vale" ? "Vale-troca " + r.creditCode + " de " + brl(value) + "." : refund === "nenhum" ? "Sem reembolso (disputa ganha pela loja)." : "Estorno de " + brl(value) + "."),
    );
    pushNotification(s, "venda", "Devolução do pedido " + o.id + " registrada na " + locName(s, store), "pedidos");
    if (o.customer.phone && r.creditCode)
      sendMessage(s, o.customer.name, o.customer.phone, "Olá, " + o.customer.name.split(" ")[0] + "! Recebemos sua devolução do pedido " + o.id + ". Seu vale-troca " + r.creditCode + " de " + brl(value) + " já pode ser usado na loja, no site ou no WhatsApp.", o.id);
    runAutomations(s);
    return r;
  }

  // ---------------------------------------------------------------------------
  // Solicitações de devolução e troca (pós-venda), como nas plataformas reais:
  // - marketplace: o cliente abre no marketplace, que aprova dentro do prazo e gera o código de
  //   postagem (logística reversa); o reembolso é feito pelo marketplace e a loja pode contestar.
  // - site/WhatsApp: o lojista registra e analisa; arrependimento em até 7 dias não pode ser
  //   recusado (CDC art. 49).
  // - loja física: o cliente está no balcão com o produto; arrependimento é política da loja,
  //   defeito tem garantia legal de 30 dias (não duráveis) ou 90 dias (duráveis) — CDC art. 26.
  const returnReasons = {
    arrependimento: "Desistiu da compra",
    troca: "Quer trocar tamanho ou modelo",
    defeito: "Produto com defeito",
    errado: "Chegou produto errado ou diferente",
  };
  const returnStatus = {
    aberta: "Aguardando sua análise",
    aprovada: "Aprovada · aguardando o produto",
    recebida: "Produto recebido · conferir",
    contestada: "Em disputa no marketplace",
    concluida: "Concluída",
    recusada: "Recusada",
  };
  const RETURN_OPEN = ["aberta", "aprovada", "recebida", "contestada"];
  const STORE_POLICY_DAYS = 30; // troca/arrependimento na loja física: política da loja
  function returnOrigin(o) {
    return isExternal(o.channel) ? "marketplace" : o.channel === "loja" ? "loja" : "online";
  }
  // Prazo contado a partir da compra (o sistema não registra a data exata da entrega)
  function returnWindow(s, o, reasonType) {
    const days = Math.floor((now(s) - o.ts) / DAY);
    const perishable = o.items.some((it) => s.products.find((p) => p.id === it.productId)?.shelfLifeDays);
    let limit;
    let rule;
    if (reasonType === "defeito" || reasonType === "errado") {
      limit = perishable ? 30 : 90;
      rule = "Garantia legal por defeito: " + limit + " dias (CDC art. 26)";
    } else if (returnOrigin(o) === "loja") {
      limit = STORE_POLICY_DAYS;
      rule = "Na loja física, troca por desistência é política da loja: " + limit + " dias";
    } else {
      limit = 7;
      rule = "Direito de arrependimento em compras online: 7 dias (CDC art. 49)";
    }
    return { days, limit, within: days <= limit, rule };
  }
  function returnRequestsOf(s) {
    s.returnRequests = s.returnRequests || [];
    return s.returnRequests;
  }
  // Unidades de um item já devolvidas ou em alguma solicitação em andamento
  function committedReturnQty(s, o, index) {
    const pending = returnRequestsOf(s)
      .filter((r) => r.orderId === o.id && RETURN_OPEN.includes(r.status))
      .reduce((a, r) => a + r.lines.filter((l) => l.index === index).reduce((b, l) => b + l.qty, 0), 0);
    return returnedQty(o, index) + pending;
  }
  function historyEntry(s, status, text) {
    return { status, text, ts: now(s) };
  }
  function requestReturn(s, orderId, { lines, reasonType, note = "", by = "loja", inPerson = false } = {}) {
    const o = orderById(s, orderId);
    if (!DONE.includes(o.status)) throw Error("Só dá para pedir devolução de pedidos já entregues ao cliente.");
    if (!returnReasons[reasonType]) throw Error("Escolha o motivo da devolução.");
    const origin = returnOrigin(o);
    if (origin === "marketplace" && by !== "cliente")
      throw Error("Devoluções do " + channelById(o.channel).name + " são abertas pelo cliente no próprio marketplace.");
    const win = returnWindow(s, o, reasonType);
    if (!win.within && origin === "marketplace") throw Error("O prazo para devolução deste pedido terminou. " + win.rule + ".");
    const picked = (lines || []).filter((l) => Number(l.qty) > 0);
    if (!picked.length) throw Error("Escolha pelo menos um item para devolver.");
    const out = picked.map((l) => {
      const it = o.items[l.index];
      if (!it) throw Error("Item inválido.");
      const qty = Math.round(Number(l.qty));
      const left = it.qty - committedReturnQty(s, o, l.index);
      if (qty > left) throw Error(it.name + ": só " + plural(Math.max(0, left), "unidade pode", "unidades podem") + " ser devolvidas.");
      return { index: l.index, qty, name: it.name, price: it.price };
    });
    const r = {
      id: nextId(s, "dv", "DV-"),
      orderId: o.id,
      channel: o.channel,
      customer: o.customer.name,
      origin,
      inPerson: origin === "online" && !!inPerson, // comprou online e trouxe o produto na loja
      reasonType,
      note: String(note || "").trim().slice(0, 200),
      lines: out,
      value: round2(out.reduce((a, l) => a + l.price * l.qty, 0)),
      window: win,
      createdAt: now(s),
      status: "aberta",
      history: [historyEntry(s, "aberta", origin === "marketplace" ? "Cliente abriu a devolução no " + channelById(o.channel).name : origin === "loja" ? "Cliente veio à loja com o produto" : "Cliente pediu pelo " + channelById(o.channel).name)],
    };
    if (origin === "marketplace") {
      // O marketplace aprova sozinho dentro do prazo e gera a etiqueta de postagem reversa
      r.status = "aprovada";
      r.reverseCode = "LR-" + pseudoDigits(r.id + r.createdAt, 8);
      r.history.push(historyEntry(s, "aprovada", channelById(o.channel).name + " aprovou e enviou ao cliente o código de postagem " + r.reverseCode));
    }
    returnRequestsOf(s).unshift(r);
    pushNotification(s, "venda", "Devolução " + r.id + " do pedido " + o.id + ": " + returnReasons[reasonType].toLowerCase(), "devolucoes");
    return r;
  }
  function returnById(s, id) {
    const r = returnRequestsOf(s).find((x) => x.id === id);
    if (!r) throw Error("Solicitação de devolução não encontrada.");
    return r;
  }
  // Loja analisa pedidos do site, WhatsApp e balcão. Arrependimento online no prazo é direito do cliente.
  function reviewReturn(s, id, { approve, note = "" }) {
    const r = returnById(s, id);
    if (r.status !== "aberta") throw Error("Esta solicitação já foi analisada.");
    if (r.origin === "marketplace") throw Error("Quem analisa devoluções de marketplace é o próprio marketplace.");
    if (!approve) {
      if (r.origin === "online" && r.reasonType === "arrependimento" && r.window.within)
        throw Error("Compra online dentro de 7 dias: o arrependimento é direito do cliente (CDC art. 49) e não pode ser recusado.");
      if ((r.reasonType === "defeito" || r.reasonType === "errado") && r.window.within)
        throw Error("Produto com defeito dentro da garantia legal não pode ser recusado. Confira o produto ao recebê-lo.");
      if (!String(note).trim()) throw Error("Explique o motivo da recusa: o cliente recebe essa resposta.");
      r.status = "recusada";
      r.history.push(historyEntry(s, "recusada", "Recusada pela loja: " + String(note).trim().slice(0, 160)));
      return r;
    }
    if (r.origin === "loja" || r.inPerson) {
      r.status = "recebida";
      r.history.push(historyEntry(s, "recebida", "Aprovada e produto recebido no balcão"));
    } else {
      r.status = "aprovada";
      r.history.push(historyEntry(s, "aprovada", "Aprovada pela loja: o cliente envia ou traz o produto"));
    }
    return r;
  }
  function receiveReturn(s, id) {
    const r = returnById(s, id);
    if (r.status !== "aprovada") throw Error("Esta devolução não está aguardando o produto.");
    r.status = "recebida";
    r.history.push(historyEntry(s, "recebida", "Produto chegou na loja" + (r.reverseCode ? " (postagem " + r.reverseCode + ")" : "")));
    return r;
  }
  // Conferência do produto e reembolso. Marketplace: quem reembolsa o comprador é o marketplace.
  function resolveReturn(s, id, { condition = "venda", refund = "vale", store = "loja" } = {}) {
    const r = returnById(s, id);
    if (r.status !== "recebida" && r.status !== "contestada") throw Error("Confira o produto depois que ele chegar.");
    const marketplace = r.origin === "marketplace";
    const done = registerReturn(s, r.orderId, {
      lines: r.lines.map((l) => ({ index: l.index, qty: l.qty })),
      reason: returnReasons[r.reasonType],
      condition,
      refund: marketplace ? "estorno" : refund,
      store,
    });
    r.status = "concluida";
    r.returnId = done.id;
    r.resolution = marketplace ? "Reembolso feito pelo " + channelById(r.channel).name + " ao comprador" : refund === "vale" ? "Vale-troca " + done.creditCode : "Estorno de " + brl(done.value);
    r.history.push(historyEntry(s, "concluida", (condition === "venda" ? "Produto em bom estado voltou para a venda. " : "Produto separado como avaria. ") + r.resolution));
    return r;
  }
  // Produto voltou danificado ou diferente: a loja contesta e o marketplace decide
  function contestReturn(s, id, note) {
    const r = returnById(s, id);
    if (r.origin !== "marketplace") throw Error("Só devoluções de marketplace podem ser contestadas.");
    if (r.status !== "recebida") throw Error("Confira o produto antes de contestar.");
    if (!String(note || "").trim()) throw Error("Descreva o problema (ex.: produto voltou quebrado) para o marketplace analisar.");
    r.status = "contestada";
    r.history.push(historyEntry(s, "contestada", "Loja contestou: " + String(note).trim().slice(0, 160)));
    return r;
  }
  function settleDispute(s, id, { sellerWins, store = "loja" }) {
    const r = returnById(s, id);
    if (r.status !== "contestada") throw Error("Esta devolução não está em disputa.");
    const done = registerReturn(s, r.orderId, {
      lines: r.lines.map((l) => ({ index: l.index, qty: l.qty })),
      reason: returnReasons[r.reasonType],
      condition: "defeito",
      refund: sellerWins ? "nenhum" : "estorno",
      store,
    });
    r.status = "concluida";
    r.returnId = done.id;
    r.resolution = sellerWins ? "Disputa ganha: o marketplace não reembolsou o comprador" : "Disputa perdida: o marketplace reembolsou o comprador";
    r.history.push(historyEntry(s, "concluida", channelById(r.channel).name + " decidiu. " + r.resolution + ". Produto separado como avaria."));
    return r;
  }

  // Loja sem depósito separado: tudo passa a ficar na prateleira
  function setHasDeposito(s, on) {
    s.store.hasDeposito = !!on;
    if (!on) {
      for (const p of s.products) {
        p.stock.loja = (p.stock.loja || 0) + (p.stock.deposito || 0);
        p.stock.deposito = 0;
        p.shelfAlert = false;
      }
      for (const o of s.orders) if (OPEN.includes(o.status)) o.items.forEach((it) => (it.source = "loja"));
    }
    runAutomations(s);
  }

  // Reativação manual (quando o lojista desliga a reativação automática)
  function reactivateAds(s, productId) {
    const p = s.products.find((x) => x.id === productId);
    if (!p) throw Error("Produto não encontrado.");
    if (!p.lock) throw Error("Os anúncios deste produto já estão ativos.");
    if (stockOf(s, p).disponivel <= 0) throw Error("Sem estoque: não dá para reativar os anúncios.");
    p.lock = null;
    p.lockIgnoreUntil = now(s) + DAY;
    pushNotification(s, "estoque", "Anúncios de " + p.name + " reativados manualmente", "estoque");
    return p;
  }
  function setAutomation(s, id, on) {
    if (!automationRules.some((r) => r.id === id)) throw Error("Automação desconhecida.");
    s.automations[id] = !!on;
    runAutomations(s);
    return s.automations[id];
  }
  function advanceTime(s, hours) {
    s.clock = (s.clock || 0) + hours * HOUR;
    runAutomations(s);
  }

  // ---------------------------------------------------------------------------
  // Catálogo, canais, fornecedores, despesas e configurações
  function updateProduct(s, id, patch) {
    const p = s.products.find((x) => x.id === id);
    if (!p) throw Error("Produto não encontrado.");
    if (patch.minStock !== undefined) {
      const m = Math.round(Number(patch.minStock));
      if (!(m >= 0 && m <= 9999)) throw Error("Estoque mínimo inválido.");
      p.minStock = m;
      s.onboarding.minReviewed = true;
    }
    if (patch.supplierId !== undefined) {
      if (patch.supplierId && !s.suppliers.some((f) => f.id === patch.supplierId)) throw Error("Fornecedor não encontrado.");
      p.supplierId = patch.supplierId || null;
    }
    if (patch.price !== undefined) {
      const v = Number(patch.price);
      if (!(v > 0)) throw Error("Preço inválido.");
      p.price = round2(v);
    }
    runAutomations(s);
    return p;
  }
  function setChannelPublished(s, productId, channelId, on) {
    const p = s.products.find((x) => x.id === productId);
    const ch = channelById(channelId);
    if (!p || !ch) throw Error("Produto ou canal inválido.");
    if (on && !s.connected.includes(channelId)) throw Error("Conecte " + ch.name + " antes de publicar.");
    if (!channelsFor(s).includes(ch)) throw Error(ch.name + " não é um canal deste tipo de loja.");
    p.channels = on ? [...new Set([...p.channels, channelId])] : p.channels.filter((c) => c !== channelId);
    return p;
  }
  function connectChannel(s, channelId) {
    const ch = channelById(channelId);
    if (!ch) throw Error("Canal inválido.");
    if (s.connected.includes(channelId)) throw Error(ch.name + " já está conectado.");
    if (!channelsFor(s).includes(ch)) throw Error(ch.name + " não é um canal deste tipo de loja.");
    const use = planUsage(s);
    if (use.channels >= use.plan.maxChannels)
      throw Error("Seu plano " + use.plan.name + " permite até " + use.plan.maxChannels + " canais. Fale com seu consultor para ampliar.");
    if (isExternal(channelId) && use.marketplaces >= use.plan.maxMarketplaces)
      throw Error("Seu plano " + use.plan.name + " inclui até " + plural(use.plan.maxMarketplaces, "canal externo", "canais externos") + " (marketplaces e apps). Fale com seu consultor para ampliar.");
    s.connected.push(channelId);
    s.products.forEach((p) => p.channels.includes(channelId) || p.channels.push(channelId));
    const paused = s.products.filter((p) => channelStatus(s, p, channelId) === "pausado").length;
    log(
      s,
      "travaAnuncios",
      ch.name + " conectado: publiquei " + plural(s.products.length, "produto", "produtos") + " com o mesmo estoque" + (paused ? " (" + paused + " já entram pausados pela trava de estoque)." : "."),
    );
    pushNotification(s, "canal", ch.name + " conectado e sincronizado", "canal/" + channelId);
    return ch;
  }
  function publish(s, draft, selected, ads) {
    const channelsSel = [...new Set(["loja", ...(selected || [])])].filter((c) => s.connected.includes(c));
    if (channelsSel.length < 2) throw Error("Selecione pelo menos um canal de venda online.");
    const sku = String(draft.sku || "").trim();
    if (!sku || !String(draft.name || "").trim()) throw Error("Informe nome e SKU.");
    if (s.products.some((p) => p.sku.toLowerCase() === sku.toLowerCase())) throw Error("Este SKU já existe no catálogo. Use outro SKU.");
    const price = round2(Number(draft.price));
    if (!(price > 0)) throw Error("Informe um preço válido.");
    const t = now(s);
    const barcode = String(draft.barcode || "").trim() || Catalogos.ean13("7899999" + String(s.products.length + 1).padStart(5, "0"));
    const p = {
      id: "p" + t,
      name: String(draft.name).trim(),
      sku,
      barcode,
      emoji: draft.emoji || "📦",
      category: String(draft.category || "Geral").trim(),
      price,
      cost: Number(draft.cost) > 0 ? round2(Number(draft.cost)) : round2(price * 0.6),
      stock: { loja: Math.max(0, Math.round(Number(draft.stockLoja) || 0)), deposito: Math.max(0, Math.round(Number(draft.stockDeposito) || 0)) },
      minStock: Math.max(0, Math.round(Number(draft.minStock) || 5)),
      avgDaily: 0,
      supplierId: s.suppliers.some((f) => f.id === draft.supplierId) ? draft.supplierId : null,
      shelf: "Prateleira nova",
      shelfCap: 12,
      issue: false,
      lock: null,
      shelfAlert: false,
      description: String(draft.description || "").trim(),
      image: draft.image || "",
      channels: channelsSel,
      ads: ads || [],
      createdTs: t,
    };
    // Grade opcional: "P, M, G" ou "38, 39, 40" — o estoque é dividido igualmente
    const labels = String(draft.sizes || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (labels.length) {
      p.variantKind = draft.variantKind || "Tamanho";
      const total = p.stock.loja + p.stock.deposito;
      p.variants = labels.map((label, k) => ({
        id: "v" + (k + 1),
        label,
        sku: sku + "-" + label.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        barcode: "",
        qty: Math.floor(total / labels.length) + (k < total % labels.length ? 1 : 0),
        weight: 1,
      }));
    }
    // Validade opcional (perecíveis): cria o primeiro lote
    const life = Math.round(Number(draft.shelfLifeDays) || 0);
    if (life > 0) {
      p.shelfLifeDays = life;
      const total = p.stock.loja + p.stock.deposito;
      p.lots = total ? [{ id: p.id + "-L1", code: lotCode(t), qty: total, expiry: t + life * DAY }] : [];
    }
    s.products.push(p);
    pushNotification(s, "canal", p.name + " publicado em " + plural(channelsSel.length, "canal", "canais"), "produtos");
    runAutomations(s);
    return p;
  }
  // Ficha do fornecedor: textos livres (limitados) e os produtos que ele vende (p.supplierId)
  const supplierTextFields = { contactName: 80, contact: 120, phone: 20, whatsapp: 20, address: 160, paymentTerms: 80, notes: 400 };
  function applySupplierFields(s, f, draft) {
    for (const [key, max] of Object.entries(supplierTextFields)) if (draft[key] !== undefined) f[key] = String(draft[key] || "").trim().slice(0, max);
    if (draft.name !== undefined) {
      const name = String(draft.name || "").trim().slice(0, 80);
      if (!name) throw Error("Informe o nome do fornecedor.");
      f.name = name;
    }
    if (draft.cnpj !== undefined) {
      const cnpj = String(draft.cnpj || "").trim().slice(0, 20);
      if (!cnpj) throw Error("Informe o CNPJ do fornecedor.");
      if (s.suppliers.some((x) => x !== f && x.cnpj === cnpj)) throw Error("Já existe um fornecedor cadastrado com este CNPJ.");
      f.cnpj = cnpj;
    }
    if (Array.isArray(draft.productIds)) {
      const chosen = new Set(draft.productIds);
      for (const p of s.products) {
        if (chosen.has(p.id)) p.supplierId = f.id;
        else if (p.supplierId === f.id) p.supplierId = "";
      }
    }
  }
  function addSupplier(s, draft) {
    const f = {
      id: "f" + (s.suppliers.length + 1) + "-" + now(s),
      name: "",
      cnpj: "",
      contact: "",
      whatsapp: "",
      leadTimeDays: Math.max(1, Math.min(60, Math.round(Number(draft.leadTimeDays) || 5))),
      minOrder: Math.max(0, round2(Number(draft.minOrder) || 0)),
    };
    if (!String(draft.name || "").trim() || !String(draft.cnpj || "").trim()) throw Error("Informe nome e CNPJ do fornecedor.");
    applySupplierFields(s, f, draft);
    s.suppliers.push(f);
    runAutomations(s);
    return f;
  }
  // Pedido de compra feito pelo lojista (além do automático da IA). Junta no rascunho do mesmo fornecedor.
  function requestRestock(s, productId, qty) {
    const p = s.products.find((x) => x.id === productId);
    if (!p) throw Error("Produto não encontrado.");
    const sup = supplierOf(s, p);
    if (!sup) throw Error(p.name + " não tem fornecedor. Abra Fornecedores e compras e marque este produto na ficha de um fornecedor.");
    const onTheWay = s.purchaseOrders.find((po) => po.status === "enviado" && po.items.some((it) => it.productId === p.id));
    if (onTheWay) throw Error("Já existe o pedido " + onTheWay.id + " a caminho com " + p.name + ".");
    const avail = stockOf(s, p).disponivel;
    const n = qty !== undefined ? Math.round(Number(qty)) : suggestPOQty(p, sup, avail, dailyOf(s, p));
    if (!(n >= 1 && n <= 9999)) throw Error("Quantidade inválida.");
    let po = s.purchaseOrders.find((x) => x.status === "aguardando" && x.supplierId === sup.id);
    if (po) {
      const it = po.items.find((x) => x.productId === p.id);
      if (it) it.qty = Math.max(it.qty, n);
      else po.items.push({ productId: p.id, sku: p.sku, name: p.name, qty: n, received: 0, cost: p.cost });
    } else {
      po = {
        id: nextId(s, "po", "PC-"),
        supplierId: sup.id,
        items: [{ productId: p.id, sku: p.sku, name: p.name, qty: n, received: 0, cost: p.cost }],
        status: "aguardando",
        byAI: false,
        reason: "Pedido feito por você: " + p.name + " com " + plural(avail, "unidade disponível", "unidades disponíveis") + " (mínimo " + p.minStock + ").",
        ts: now(s),
      };
      s.purchaseOrders.unshift(po);
    }
    return po;
  }
  function updateSupplier(s, id, patch) {
    const f = s.suppliers.find((x) => x.id === id);
    if (!f) throw Error("Fornecedor não encontrado.");
    applySupplierFields(s, f, patch);
    if (patch.leadTimeDays !== undefined) {
      const d = Math.round(Number(patch.leadTimeDays));
      if (!(d >= 1 && d <= 60)) throw Error("Prazo de entrega deve ficar entre 1 e 60 dias.");
      f.leadTimeDays = d;
    }
    if (patch.minOrder !== undefined) {
      const v = Number(patch.minOrder);
      if (!(v >= 0)) throw Error("Pedido mínimo inválido.");
      f.minOrder = round2(v);
    }
    runAutomations(s);
    return f;
  }
  function addExpense(s, draft) {
    const category = String(draft.category || "").trim(),
      description = String(draft.description || "").trim();
    const amount = Number(draft.amount);
    if (!category || !(amount > 0)) throw Error("Informe categoria e um valor válido para a despesa.");
    const e = { id: "DESP-" + (s.expenses.length + 1) + "-" + now(s), category, description, amount: round2(amount), date: "Hoje" };
    s.expenses.push(e);
    return e;
  }

  // ---------------------------------------------------------------------------
  // Indicadores e análises
  const liveOrders = (s) => s.orders.filter((o) => o.status !== "expirado");

  function metrics(s) {
    const live = liveOrders(s);
    const stocks = s.products.map((p) => stockOf(s, p));
    const fc = forecast(s);
    return {
      revenue: round2(live.reduce((a, o) => a + o.total, 0)),
      orders: live.length,
      openOrders: s.orders.filter((o) => OPEN.includes(o.status)).length,
      toSeparate: s.orders.filter((o) => o.status === "novo" || o.status === "separando").length,
      pickupsReady: s.orders.filter((o) => o.status === "pronto").length,
      toDispatch: s.orders.filter((o) => o.status === "separado").length,
      products: s.products.length,
      unitsLoja: stocks.reduce((a, x) => a + x.lojas, 0),
      shops: shopsOf(s).length,
      unitsDeposito: stocks.reduce((a, x) => a + x.deposito, 0),
      unitsReservadas: stocks.reduce((a, x) => a + x.reservado, 0),
      unitsDisponiveis: stocks.reduce((a, x) => a + x.disponivel, 0),
      atRisk: fc.filter((f) => ["sem_estoque", "critico", "atencao"].includes(f.risk)).length,
      locked: s.products.filter((p) => p.lock).length,
      poAwaiting: s.purchaseOrders.filter((po) => po.status === "aguardando").length,
      poOpen: s.purchaseOrders.filter((po) => po.status === "aguardando" || po.status === "enviado").length,
      unreadNotifications: s.notifications.filter((n) => !n.read).length,
      connected: s.connected.length,
      expiringLots: s.products.reduce((a, p) => a + lotsOf(s, p).filter((l) => l.daysLeft <= 7).length, 0),
      brokenGrades: s.products.filter((p) => (p.variants || []).some((v) => variantFree(s, p, v) === 0) && stockOf(s, p).disponivel > 0).length,
    };
  }

  function forecast(s) {
    const t = now(s);
    return s.products.map((p) => {
      const st = stockOf(s, p);
      const sup = supplierOf(s, p);
      const lead = sup ? sup.leadTimeDays : null;
      const daily = dailyOf(s, p);
      const days = daily > 0 ? round1(st.disponivel / daily) : null;
      const isNew = p.createdTs && t - p.createdTs < 7 * DAY;
      let risk = "ok",
        suggestedDiscount = null;
      if (st.disponivel <= 0) risk = "sem_estoque";
      else if (st.disponivel <= p.minStock) risk = "critico";
      else if (days !== null && lead !== null && days <= lead + 2) risk = "atencao";
      else if (!isNew && (days === null || days >= PARADO_DIAS) && st.disponivel > p.minStock * 3) {
        risk = "parado";
        suggestedDiscount = Math.max(10, Math.min(30, 10 + Math.round(((days ?? PARADO_DIAS + 50) - PARADO_DIAS) / 5)));
      }
      return {
        productId: p.id,
        name: p.name,
        emoji: p.emoji,
        disponivel: st.disponivel,
        minStock: p.minStock,
        avgDaily: p.avgDaily,
        daysToStockout: days,
        leadTimeDays: lead,
        supplier: sup ? sup.name : null,
        risk,
        suggestedDiscount,
      };
    });
  }
  const riskLabel = {
    sem_estoque: "Esgotado",
    critico: "Abaixo do mínimo",
    atencao: "Acaba antes da reposição",
    parado: "Estoque parado",
    ok: "Saudável",
  };

  function businessImpact(s) {
    const list = forecast(s);
    const product = (id) => s.products.find((p) => p.id === id);
    const atRisk = list.filter((f) => ["sem_estoque", "critico", "atencao"].includes(f.risk));
    const parado = list.filter((f) => f.risk === "parado");
    const salesAtRisk = round2(
      atRisk.reduce((a, f) => {
        const demand = f.avgDaily * (f.leadTimeDays || 7);
        return a + Math.max(0, demand - f.disponivel) * product(f.productId).price;
      }, 0),
    );
    const capitalParado = round2(
      parado.reduce((a, f) => a + Math.max(0, f.disponivel - f.minStock * 2) * product(f.productId).cost, 0),
    );
    return { salesAtRisk, capitalParado, atRiskCount: atRisk.length, paradoCount: parado.length };
  }

  function salesByChannel(s) {
    const live = liveOrders(s);
    return channelsFor(s).map((c) => {
      const os = live.filter((o) => o.channel === c.id);
      return { channel: c.id, name: c.name, orders: os.length, revenue: round2(os.reduce((a, o) => a + o.total, 0)) };
    });
  }

  function financials(s) {
    const live = liveOrders(s);
    const costOf = (id) => s.products.find((p) => p.id === id)?.cost || 0;
    const retOf = (o) => (o.returns || []).reduce((a, r) => a + r.value, 0);
    // Produto que voltou para a venda deixa de ser custo da venda
    const retCostOf = (o) => (o.returns || []).reduce((a, r) => a + r.lines.filter((l) => l.back).reduce((b, l) => b + l.cost, 0), 0);
    const byChannel = channelsFor(s).map((c) => {
      const os = live.filter((o) => o.channel === c.id);
      const revenue = round2(os.reduce((a, o) => a + o.total - retOf(o), 0));
      const cogs = round2(os.reduce((a, o) => a + o.items.reduce((b, it) => b + costOf(it.productId) * it.qty, 0) - retCostOf(o), 0));
      // Comissão e taxa fixa por item; devoluções devolvem só a comissão
      const pct = channelFees(s, c.id).pct;
      const fees = round2(os.reduce((a, o) => a + o.items.reduce((b, it) => b + channelFeeFor(s, c.id, it.price, it.qty), 0) - retOf(o) * pct, 0));
      const profit = round2(revenue - cogs - fees);
      return { channel: c.id, name: c.name, fee: pct, revenue, cogs, fees, profit, margin: revenue > 0 ? round1((profit / revenue) * 100) : 0 };
    });
    const revenue = round2(byChannel.reduce((a, c) => a + c.revenue, 0));
    const cogs = round2(byChannel.reduce((a, c) => a + c.cogs, 0));
    const fees = round2(byChannel.reduce((a, c) => a + c.fees, 0));
    // Taxas das formas de pagamento (Pix, débito, crédito) e perdas por vencimento
    const paid = live.filter((o) => o.payment);
    const paymentFees = round2(paid.reduce((a, o) => a + o.total * (o.payment.fee || 0), 0));
    const byPayment = Object.entries(paymentMethods).map(([id, m]) => {
      const os = paid.filter((o) => o.payment.method === id);
      return { method: id, label: m.label, fee: m.fee, orders: os.length, revenue: round2(os.reduce((a, o) => a + o.total, 0)) };
    });
    const losses = round2((s.losses || []).reduce((a, l) => a + l.value, 0));
    const returns = round2(live.reduce((a, o) => a + retOf(o), 0));
    const grossProfit = round2(revenue - cogs - fees - paymentFees);
    const totalExpenses = round2(s.expenses.reduce((a, e) => a + e.amount, 0));
    return {
      revenue,
      cogs,
      fees,
      paymentFees,
      losses,
      returns,
      grossProfit,
      grossMargin: revenue > 0 ? round1((grossProfit / revenue) * 100) : 0,
      totalExpenses,
      netProfit: round2(grossProfit - totalExpenses - losses),
      byChannel,
      byPayment,
    };
  }

  // Lista "O que fazer agora", em linguagem simples, por prioridade
  function todo(s) {
    const m = metrics(s);
    const fc = forecast(s);
    const list = [];
    if (m.poAwaiting)
      list.push({ icon: "🧾", text: "A IA preparou " + plural(m.poAwaiting, "pedido de compra", "pedidos de compra") + ". Confirme para enviar ao fornecedor.", cta: "Revisar pedido", route: "compras", tone: "warn" });
    // Próxima data especial que ainda precisa de preparo
    const nextEvent = upcomingEvents(s, 4).find((e) => e.daysUntil <= 30 && !e.prepared);
    if (nextEvent) {
      const plan = eventPlan(s, nextEvent.id);
      if (plan.toBuyCount)
        list.push({
          icon: nextEvent.emoji,
          text: nextEvent.name + " em " + plural(nextEvent.daysUntil, "dia", "dias") + ": a IA prevê vendas " + dec(round1(nextEvent.mult)) + "× maiores. " + plural(plan.toBuyCount, "produto precisa", "produtos precisam") + " de reforço no estoque.",
          cta: "Preparar",
          route: "sazonalidade",
          tone: "warn",
        });
    }
    if (m.pickupsReady)
      list.push({ icon: "🏪", text: plural(m.pickupsReady, "cliente vem", "clientes vêm") + " retirar pedido na loja. Bipe o código na entrega.", cta: "Ver retiradas", route: "pedidos", tone: "" });
    if (m.toSeparate)
      list.push({ icon: "📦", text: plural(m.toSeparate, "pedido para separar", "pedidos para separar") + ".", cta: "Separar", route: "pedidos", tone: "warn" });
    if (m.toDispatch)
      list.push({ icon: "🚚", text: plural(m.toDispatch, "pedido pronto", "pedidos prontos") + " para despachar.", cta: "Despachar", route: "pedidos", tone: "" });
    for (const p of s.products.filter((p) => p.shelfAlert))
      list.push({ icon: "📡", text: "Repor prateleira: " + p.name + ": " + stockOf(s, p).livreLoja + " na prateleira e " + stockOf(s, p).livreDeposito + " guardadas no depósito.", cta: "Repor", route: "iot", tone: "" });
    const locked = s.products.filter((p) => p.lock);
    if (locked.length)
      list.push({ icon: "⏸️", text: "Anúncios pausados pela IA para não vender sem estoque: " + locked.map((p) => p.name).join(", ") + ".", cta: "Entender", route: "automacoes", tone: "" });
    for (const f of fc.filter((f) => f.risk === "atencao"))
      list.push({ icon: "⚠️", text: f.name + " acaba em ~" + dec(f.daysToStockout) + " dias e o fornecedor leva " + f.leadTimeDays + " dias.", cta: "Ver estoque", route: "estoque", tone: "warn" });
    for (const f of fc.filter((f) => f.risk === "parado"))
      list.push({ icon: "🏷️", text: f.name + " está parado (" + f.disponivel + " un.). Sugiro promoção de " + f.suggestedDiscount + "%.", cta: "Ver estoque", route: "estoque", tone: "" });
    for (const p of s.products.filter((p) => p.issue))
      list.push({ icon: "✏️", text: "O anúncio de " + p.name + " na Shopee precisa de ajuste.", cta: "Corrigir", route: "produtos", tone: "" });
    for (const p of s.products)
      for (const l of lotsOf(s, p).filter((l) => l.daysLeft <= 7))
        list.push({
          icon: "📅",
          text: p.name + ": " + plural(l.qty, "unidade vence", "unidades vencem") + " em " + plural(Math.max(0, l.daysLeft), "dia", "dias") + ". Sugiro promoção de " + (l.suggestedDiscount || 20) + "% para vender esse lote primeiro.",
          cta: "Criar promoção",
          route: "estoque",
          tone: "warn",
        });
    for (const p of s.products) {
      const out = (p.variants || []).filter((v) => variantFree(s, p, v) === 0);
      if (out.length && stockOf(s, p).disponivel > 0)
        list.push({
          icon: "📏",
          text: "Grade quebrada: " + p.name + " sem " + (p.variantKind || "tamanho").toLowerCase() + " " + out.map((v) => v.label).join(", ") + ". Cliente que procura esse " + (p.variantKind || "tamanho").toLowerCase() + " vai embora sem comprar.",
          cta: "Ver grade",
          route: "estoque",
          tone: "",
        });
    }
    const off = channelsFor(s).filter((c) => !s.connected.includes(c.id));
    if (off.length)
      list.push({ icon: "🔌", text: "Conecte " + off.map((c) => c.name).join(", ") + " para vender em mais lugares com o mesmo estoque.", cta: "Conectar", route: "canais", tone: "" });
    return list;
  }

  // Checklist de primeiros passos (lojista novo no digital)
  function checklist(s) {
    const steps = [
      { id: "tipo", text: "Escolher o tipo da sua loja", done: !!s.setupDone, route: "config" },
      { id: "canais", text: "Conectar mais canais de venda", done: s.connected.length >= 6, route: "canais" },
      { id: "minimo", text: "Definir o estoque mínimo dos produtos", done: !!s.onboarding.minReviewed, route: "estoque" },
      { id: "fornecedor", text: "Cadastrar seus fornecedores e prazos", done: s.suppliers.length > 0, route: "compras" },
      { id: "site", text: "Receber a primeira venda pelo seu site", done: !!s.onboarding.siteSale, route: "canal/site" },
      { id: "automacoes", text: "Conhecer as automações da IA", done: !!s.onboarding.automationsVisited, route: "automacoes" },
    ];
    return { steps, done: steps.filter((x) => x.done).length, total: steps.length };
  }

  // ---------------------------------------------------------------------------
  // WedTech AI — respostas locais a partir dos dados atuais
  function answer(s, q) {
    const m = metrics(s);
    const fc = forecast(s);
    const n = String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/impacto|prejuizo|perdendo|dinheiro parado/.test(n)) {
      const b = businessImpact(s);
      return (
        "Impacto financeiro estimado do seu estoque:\n\n" +
        (b.atRiskCount ? "⚠ " + brl(b.salesAtRisk) + " em vendas em risco até a próxima reposição (" + plural(b.atRiskCount, "produto", "produtos") + ")." : "✓ Nenhuma venda em risco de ruptura.") +
        "\n" +
        (b.paradoCount ? "📦 " + brl(b.capitalParado) + " de dinheiro parado em " + plural(b.paradoCount, "produto", "produtos") + " com pouca saída." : "✓ Nenhum produto parado.") +
        "\n\nConfirmar os pedidos ao fornecedor e fazer promoção dos parados libera caixa para reinvestir."
      );
    }
    if (/sazonal|evento|datas? (especia|comemorativ)|black|natal|crianc|dia das maes|dia dos pais|pascoa|namorad|pico|feriad/.test(n)) {
      const evs = upcomingEvents(s, 3);
      return (
        "Próximas datas que mexem nas suas vendas:\n\n" +
        evs
          .map((e) => {
            const plan = eventPlan(s, e.id);
            const first = plan.rows.filter((r) => r.toBuy > 0 && r.orderBy).sort((a, b) => a.orderBy - b.orderBy)[0];
            return (
              e.emoji + " " + e.name + " — em " + plural(e.daysUntil, "dia", "dias") + " (" + dateLabel(e.ts) + "): vendas ~" + dec(round1(e.mult)) + "× maiores. " +
              (e.prepared
                ? "Pedidos já preparados."
                : plan.toBuyCount
                  ? plural(plan.toBuyCount, "produto precisa", "produtos precisam") + " de reforço" + (first ? (first.status === "atrasado" ? "; alguns fornecedores já não entregam antes do pico — peça hoje." : first.status === "hoje" ? "; o prazo para pedir vence hoje." : "; peça até " + dateLabel(first.orderBy) + ".") : ".")
                  : "Estoque já coberto.")
            );
          })
          .join("\n") +
        "\n\nAbra Datas e sazonalidade para ver o plano completo e deixar a IA preparar os pedidos."
      );
    }
    if (/devol|troca|vale/.test(n)) {
      const rs = s.orders.flatMap((o) => (o.returns || []).map((r) => ({ o, r })));
      const open = (s.credits || []).filter((c) => c.balance > 0);
      return rs.length
        ? "Devoluções registradas:\n\n" +
            rs.map(({ o, r }) => o.id + " (" + channelById(o.channel).name + ") → " + locName(s, r.store) + ": " + r.lines.map((l) => l.name + " × " + l.qty).join(", ") + " · " + (r.creditCode ? "vale " + r.creditCode : "estorno") + " de " + brl(r.value)).join("\n") +
            (open.length ? "\n\nVales-troca em aberto: " + brl(open.reduce((a, c) => a + c.balance, 0)) + "." : "") +
            "\n\nProduto devolvido em bom estado volta na hora para a venda em todos os canais."
        : "Nenhuma devolução registrada. O cliente pode devolver na loja o que comprou em qualquer canal: é só buscar o pedido em Pedidos › Devoluções.";
    }
    if (/lojas?|filia|unidade/.test(n) && shopsOf(s).length > 1) {
      return (
        "Estoque por loja:\n\n" +
        locationIds(s).map((id) => locName(s, id) + ": " + s.products.reduce((a, p) => a + (p.stock[id] || 0), 0) + " un.").join("\n") +
        "\n\nTudo isso é vendido online como um estoque só. Na retirada, o cliente escolhe a loja e, se faltar lá, eu indico de onde trazer."
      );
    }
    if (/etiqueta/.test(n)) {
      const out = s.products.filter((p) => p.esl && p.esl.outdated);
      return out.length
        ? "Etiquetas desatualizadas (a automação está desligada): " + out.map((p) => p.name).join(", ") + "."
        : "Todas as etiquetas eletrônicas estão com o preço certo, inclusive as promoções.";
    }
    if (/venc|validade|lote/.test(n)) {
      const soon = s.products.flatMap((p) => lotsOf(s, p).filter((l) => l.daysLeft <= 15).map((l) => ({ p, l })));
      const lost = (s.losses || []).reduce((a, l) => a + l.value, 0);
      return soon.length
        ? "Lotes vencendo em breve (saem primeiro, pela ordem de validade):\n\n" +
            soon.map(({ p, l }) => p.name + " — lote " + l.code + ": " + l.qty + " un. vencem em " + plural(Math.max(0, l.daysLeft), "dia", "dias") + (l.daysLeft <= 7 ? ". Sugiro promoção de " + (l.suggestedDiscount || 20) + "%." : ".")).join("\n") +
            (lost ? "\n\nPerdas por vencimento até agora: " + brl(lost) + "." : "") +
            "\n\nVencidos saem da venda sozinhos, em todos os canais."
        : s.products.some((p) => p.lots)
          ? "Nenhum lote vence nos próximos 15 dias."
          : "Seus produtos não têm controle de validade. Ele é ativado para produtos perecíveis (ex.: alimentação).";
    }
    if (/tamanho|grade|numeracao|modelo/.test(n)) {
      const withV = s.products.filter((p) => p.variants && p.variants.length);
      if (!withV.length) return "Seus produtos não usam grade. Para roupas e calçados, cadastre os tamanhos no ADS.";
      return (
        "Grade dos seus produtos:\n\n" +
        withV
          .map((p) => p.name + " — " + p.variants.map((v) => v.label + ": " + variantFree(s, p, v)).join(" · ") + (p.variants.some((v) => variantFree(s, p, v) === 0) ? "  ⚠ grade quebrada" : ""))
          .join("\n") +
        "\n\nNas compras, a IA divide a quantidade pelos tamanhos que mais vendem."
      );
    }
    if (/preco|precific|repass|promoc/.test(n) && !/parad|encalhad/.test(n)) {
      const ext = s.connected.filter((c) => isExternal(c));
      return (
        "Preço por canal:\n\n" +
        ext
          .map((c) => {
            const mk = (s.channelPricing || {})[c] || 0;
            return channelById(c).name + " — taxa " + feeLabel(s, c) + "; ajuste atual " + (mk ? (mk > 0 ? "+" : "") + mk + "%" : "nenhum") + "; para manter a margem, sugiro +" + suggestedMarkup(c, s) + "%.";
          })
          .join("\n") +
        "\n\nAjuste em Canais de venda › página de cada canal. Na loja, no site e no WhatsApp o preço fica o menor."
      );
    }
    if (/pix|cartao|pagamento|maquininha|dinheiro/.test(n)) {
      const f = financials(s);
      return (
        "Vendas no balcão por forma de pagamento:\n\n" +
        f.byPayment.filter((p) => p.orders).map((p) => p.label + " — " + plural(p.orders, "venda", "vendas") + ", " + brl(p.revenue) + (p.fee ? " (taxa " + dec(round2(p.fee * 100)) + "%)" : " (sem taxa)")).join("\n") +
        "\n\nTaxas de pagamento de hoje: " + brl(f.paymentFees) + ". Incentivar o Pix no balcão reduz esse custo."
      );
    }
    if (/relatorio|resultado|como foi|previsto|aprend/.test(n)) {
      const r = (s.eventReports || [])[0];
      return r
        ? "Última data especial: " + r.emoji + " " + r.name + "\n\nPrevi " + r.forecastUnits + " un. e a procura foi de " + r.demandUnits + " (acerto de " + r.accuracy + "%). Vendemos " + r.soldUnits + ", faltaram " + r.lostUnits + " (" + brl(r.lostRevenue) + " perdidos) e sobraram " + r.leftoverUnits + ".\n\n" + r.lesson
        : "Ainda não há relatório de datas especiais.";
    }
    if (/paus|trav/.test(n)) {
      const locked = s.products.filter((p) => p.lock);
      return locked.length
        ? "Anúncios pausados por mim nos marketplaces:\n\n" +
            locked
              .map((p) => {
                const f = fc.find((x) => x.productId === p.id);
                return p.lock.kind === "zero"
                  ? p.name + " — esgotou; pausado em todos os canais online."
                  : p.name + " — " + f.disponivel + " un., acaba em ~" + dec(f.daysToStockout) + " dias e o fornecedor entrega em " + f.leadTimeDays + " dias. O restante fica para a loja e o site.";
              })
              .join("\n") +
            "\n\nQuando a mercadoria chegar e você bipar a entrada, reativo os anúncios sozinha."
        : "Nenhum anúncio pausado. Todos os produtos têm estoque para cobrir o prazo dos fornecedores.";
    }
    if (/parad|encalhad|promoc|liquid/.test(n)) {
      const parado = fc.filter((f) => f.risk === "parado");
      return parado.length
        ? "Produtos parados (pouca saída):\n\n" +
            parado.map((f) => f.name + " — " + f.disponivel + " un." + (f.daysToStockout ? ", dá para ~" + dec(f.daysToStockout) + " dias" : ", sem vendas recentes") + ". Sugestão: promoção de " + f.suggestedDiscount + "%.").join("\n") +
            "\n\nVender esses produtos libera dinheiro para repor os que estão acabando."
        : "Nenhum produto parado no momento.";
    }
    if (/fornecedor|compra|repor|reposic/.test(n)) {
      const open = s.purchaseOrders.filter((po) => po.status === "aguardando" || po.status === "enviado");
      return open.length
        ? "Pedidos ao fornecedor em aberto:\n\n" +
            open
              .map((po) => {
                const sup = s.suppliers.find((f) => f.id === po.supplierId);
                return po.id + " — " + (sup ? sup.name : "fornecedor") + " — " + po.items.map((i) => i.name + " × " + i.qty).join(", ") + " — " + (po.status === "aguardando" ? "preparado por mim, falta você confirmar" : "a caminho");
              })
              .join("\n") +
            "\n\nAbra Compras e fornecedores para confirmar ou receber a mercadoria."
        : "Nenhum pedido ao fornecedor em aberto. Todos os produtos estão acima do mínimo que você definiu.";
    }
    if (/estoque|ruptura|acab|falta|esgot/.test(n)) {
      const risk = fc.filter((f) => ["sem_estoque", "critico", "atencao"].includes(f.risk));
      return risk.length
        ? "Produtos que podem faltar:\n\n" +
            risk
              .map((f) =>
                f.name + " — " + f.disponivel + " un. disponíveis" +
                (f.daysToStockout !== null ? ", acaba em ~" + dec(f.daysToStockout) + " dias" : "") +
                (f.leadTimeDays ? "; o fornecedor entrega em " + f.leadTimeDays + " dias" : "") + ".",
              )
              .join("\n") +
            "\n\nO estoque é o mesmo em todos os canais: loja, site, WhatsApp e marketplaces. Quando o produto chega ao mínimo, preparo o pedido ao fornecedor."
        : "Todos os produtos estão acima do estoque mínimo e cobrem o prazo dos fornecedores.";
    }
    if (/retir|reserva/.test(n)) {
      const ret = s.orders.filter((o) => o.type === "retirada" && OPEN.includes(o.status));
      return ret.length
        ? "Pedidos para retirar na loja:\n\n" +
            ret.map((o) => o.id + " — " + o.customer.name + " — " + orderStatus[o.status] + " — código " + o.pickupCode).join("\n") +
            "\n\nOs produtos ficam reservados: nenhum outro canal vende essas unidades. Se o cliente não vier em 48 h, libero a reserva."
        : "Nenhum pedido aguardando retirada.";
    }
    if (/separa|despach|envi|pedido/.test(n)) {
      const open = s.orders.filter((o) => OPEN.includes(o.status));
      return open.length
        ? "Você tem " + plural(open.length, "pedido em aberto", "pedidos em aberto") + ":\n\n" +
            open.map((o) => o.id + " — " + channelById(o.channel).name + " — " + orderTypes[o.type] + " — " + orderStatus[o.status]).join("\n") +
            "\n\nAbra Pedidos para separar, entregar ou despachar."
        : "Nenhum pedido em aberto. Tudo em dia!";
    }
    if (/erro|anuncio/.test(n)) {
      const issues = s.products.filter((p) => p.issue);
      return issues.length
        ? issues.map((p) => p.name + " — o título na Shopee está maior que o recomendado. Abra o produto para corrigir com a WedTech AI.").join("\n")
        : "Nenhum erro nos anúncios do catálogo.";
    }
    if (/lucro|despes|financeiro|margem|taxa/.test(n)) {
      const f = financials(s);
      const best = f.byChannel.filter((c) => c.revenue > 0).sort((a, b) => b.margin - a.margin)[0];
      return (
        "Financeiro de hoje:\n\nVendas: " + brl(f.revenue) + "\nCusto dos produtos: " + brl(f.cogs) + "\nTaxas dos canais: " + brl(f.fees) +
        "\nLucro bruto: " + brl(f.grossProfit) + " (" + dec(f.grossMargin) + "%)\nDespesas: " + brl(f.totalExpenses) + "\nLucro líquido: " + brl(f.netProfit) +
        (best ? "\n\nSeu canal mais lucrativo é " + best.name + " (" + dec(best.margin) + "% de margem). Vender pela loja e pelo site evita as taxas dos marketplaces." : "")
      );
    }
    if (/canal|mais vend|giro|vendendo|melhor/.test(n)) {
      const live = liveOrders(s);
      const ranked = s.products
        .map((p) => ({ name: p.name, sold: live.reduce((a, o) => a + o.items.filter((i) => i.productId === p.id).reduce((b, i) => b + i.qty, 0), 0) }))
        .sort((a, b) => b.sold - a.sold);
      const top = salesByChannel(s).sort((a, b) => b.revenue - a.revenue)[0];
      return (
        "Mais vendidos hoje:\n\n" + ranked.slice(0, 3).map((p, i) => i + 1 + ". " + p.name + " — " + plural(p.sold, "unidade", "unidades")).join("\n") +
        "\n\nCanal com mais vendas: " + top.name + " (" + brl(top.revenue) + ")."
      );
    }
    if (/o que (eu )?fa|fazer|atencao|problema|prioridade|ajuda/.test(n)) {
      const list = todo(s);
      return list.length
        ? "O que eu faria agora, nesta ordem:\n\n" + list.slice(0, 6).map((t, i) => i + 1 + ". " + t.text).join("\n")
        : "Está tudo em dia! Aproveite para divulgar seu site nas redes sociais.";
    }
    if (/resum|operacao|hoje|vendas|como esta/.test(n)) {
      const b = businessImpact(s);
      return (
        "Hoje você fez " + plural(m.orders, "venda", "vendas") + ", somando " + brl(m.revenue) + ", em " +
        plural(salesByChannel(s).filter((c) => c.orders).length, "canal", "canais") + ".\n\n" +
        "Estoque: " + m.unitsDisponiveis + " un. disponíveis para vender" +
        (s.store.hasDeposito
          ? " (" + m.unitsLoja + " na prateleira, " + m.unitsDeposito + " guardadas no depósito, " + m.unitsReservadas + " reservadas para pedidos)"
          : " (" + m.unitsReservadas + " reservadas para pedidos)") +
        ".\n" +
        "Pedidos em aberto: " + m.openOrders + " (" + m.pickupsReady + " aguardando retirada).\n" +
        (m.poAwaiting ? "Preparei " + plural(m.poAwaiting, "pedido", "pedidos") + " ao fornecedor esperando sua confirmação.\n" : "") +
        (m.locked ? "Pausei os anúncios de " + plural(m.locked, "produto", "produtos") + " para não vender sem estoque.\n" : "") +
        (b.salesAtRisk ? "\n⚠ " + brl(b.salesAtRisk) + " em vendas em risco se não repor a tempo." : "")
      );
    }
    return "Posso ajudar com: resumo do dia, estoque e o que vai acabar, anúncios pausados, pedidos para separar ou retirar, pedidos ao fornecedor, produtos parados, lucro e taxas dos canais. Experimente: “O que eu faço agora?”";
  }

  // ---------------------------------------------------------------------------
  // Persistência compartilhada entre o painel (produto/index.html) e o site (produto/loja.html)
  function isValid(s) {
    return (
      s && s.version === VERSION && s.store && s.automations && s.onboarding && s.seq &&
      ["products", "suppliers", "orders", "purchaseOrders", "notifications", "automationLog", "expenses", "messages"].every((k) => Array.isArray(s[k]))
    );
  }
  function loadState(storage) {
    try {
      const s = JSON.parse(storage.getItem(STORAGE_KEY));
      if (isValid(s)) {
        s.plan = s.plan || "profissional";
        s.customEvents = s.customEvents || [];
        s.eventsPrepared = s.eventsPrepared || {};
        if (s.store.hasDeposito === undefined) s.store.hasDeposito = true;
        s.eventReports = s.eventReports || [];
        s.eventLearning = s.eventLearning || {};
        s.channelPricing = s.channelPricing || {};
        s.channelFees = s.channelFees || {};
        s.cashRegisters = s.cashRegisters || [];
        s.returnRequests = s.returnRequests || [];
        s.losses = s.losses || [];
        s.credits = s.credits || [];
        s.shops = s.shops || [{ id: "loja", name: "Loja " + (s.store.address || "").split("—")[1]?.split(",")[0]?.trim() || "Loja principal", address: s.store.address, main: true }];
        return s;
      }
    } catch {}
    return null;
  }
  function saveState(storage, s) {
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  const api = {
    VERSION,
    STORAGE_KEY,
    SHELF_MIN,
    storeTypes: Catalogos.tipos,
    channels,
    channelById,
    orderTypes,
    orderStatus,
    poStatus,
    automationRules,
    channelStatusLabel,
    riskLabel,
    plans,
    planUsage,
    upcomingEvents,
    eventPlan,
    eventStatusLabel,
    prepareEvent,
    addCustomEvent,
    removeCustomEvent,
    monthlySeasonality,
    demandFactor,
    setHasDeposito,
    shopsOf,
    locName,
    addShop,
    restockSuggestion,
    restockShop,
    findOrderByDoc,
    registerReturn,
    returnedQty,
    channelsFor,
    isExternal,
    paymentMethods,
    resolveCode,
    variantFree,
    gradeFor,
    lotsOf,
    priceFor,
    suggestedMarkup,
    setChannelMarkup,
    channelFees,
    channelFeeFor,
    feeLabel,
    setChannelFees,
    channelMargin,
    minMarginOf,
    setMinMargin,
    marginAlerts,
    openRegisterFor,
    openRegister,
    onlineSince,
    registerSales,
    registerSummary,
    registerMovement,
    closeRegister,
    returnReasons,
    returnStatus,
    RETURN_OPEN,
    returnOrigin,
    returnWindow,
    committedReturnQty,
    requestReturn,
    reviewReturn,
    receiveReturn,
    resolveReturn,
    contestReturn,
    settleDispute,
    adjustReasons,
    adjustStock,
    applyPromo,
    clearPromo,
    brl,
    dec,
    now,
    timeLabel,
    seed,
    stockOf,
    supplierOf,
    channelStatus,
    findByCode,
    createOrder,
    sellCounter,
    sellCounterDelivery,
    scanOrderItem,
    confirmSeparation,
    deliverPickup,
    deliverByCode,
    dispatchOrder,
    simulateOrder,
    receiveGoods,
    transferStock,
    shelfRefill,
    confirmPurchaseOrder,
    discardPurchaseOrder,
    receivePurchaseOrder,
    runAutomations,
    reactivateAds,
    setAutomation,
    advanceTime,
    updateProduct,
    setChannelPublished,
    connectChannel,
    publish,
    addSupplier,
    updateSupplier,
    requestRestock,
    addExpense,
    metrics,
    forecast,
    businessImpact,
    salesByChannel,
    financials,
    todo,
    checklist,
    answer,
    pushNotification,
    markNotificationsRead,
    markNotificationRead,
    loadState,
    saveState,
  };
  if (typeof module !== "undefined") module.exports = api;
  global.WedTech = api;
})(typeof window !== "undefined" ? window : globalThis);
