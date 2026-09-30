// Catálogos de exemplo por tipo de loja.
// A plataforma é a mesma para qualquer lojista de bairro — só mudam os produtos,
// fornecedores e textos. Os três catálogos têm os MESMOS números de estoque, para
// que o roteiro da demonstração funcione igual em qualquer tipo de loja:
//   produto 0 → "herói" da demo: 1 venda no balcão dispara pedido ao fornecedor e trava de anúncios
//   produto 1 → anúncio com problema (demonstra a correção pela IA no ADS)
//   produto 2 → anúncios já pausados, aguardando a entrega do fornecedor
//   produto 3 → prateleira quase vazia (sensor IoT pede reposição do depósito)
//   produto 4 → estoque parado (IA sugere promoção)
(function (global) {
  "use strict";

  // Números compartilhados pelos três catálogos (ver comentário acima)
  const base = [
    { loja: 5, deposito: 6, minStock: 10, avgDaily: 3, supplier: 0 },
    { loja: 18, deposito: 40, minStock: 15, avgDaily: 5, supplier: 1, issue: true },
    { loja: 3, deposito: 3, minStock: 8, avgDaily: 2.5, supplier: 2 },
    { loja: 1, deposito: 14, minStock: 8, avgDaily: 2, supplier: 1 },
    { loja: 6, deposito: 34, minStock: 5, avgDaily: 0.4, supplier: 0 },
    { loja: 5, deposito: 12, minStock: 6, avgDaily: 1.2, supplier: 2 },
    { loja: 4, deposito: 10, minStock: 5, avgDaily: 0.8, supplier: 0 },
    { loja: 12, deposito: 30, minStock: 12, avgDaily: 4, supplier: 2 },
  ];

  // [nome, SKU, emoji, categoria, preço, custo (% do preço)]
  const tipos = {
    moda: {
      label: "Moda e calçados",
      emoji: "👕",
      storeName: "Maria Moda & Calçados",
      tagline: "Roupas e calçados para o dia a dia, pertinho de você.",
      suppliers: [
        ["Calçados Passo Firme Ltda", "12.345.678/0001-10", 7, 600],
        ["Malharia Fio de Ouro", "23.456.789/0001-20", 4, 300],
        ["Acessórios Brás Atacado", "34.567.890/0001-30", 3, 200],
      ],
      products: [
        ["Tênis Casual Conforto", "TN-CAS-001", "👟", "Calçados", 189.9, 0.55],
        ["Camiseta Básica Algodão", "CM-BAS-002", "👕", "Roupas", 49.9, 0.4],
        ["Boné Aba Curva", "BN-ABC-003", "🧢", "Acessórios", 59.9, 0.45],
        ["Calça Jeans Slim", "CJ-SLM-004", "👖", "Roupas", 139.9, 0.5],
        ["Jaqueta Corta-vento", "JQ-CVT-005", "🧥", "Roupas", 229.9, 0.52],
        ["Vestido Midi Floral", "VS-MDF-006", "👗", "Roupas", 119.9, 0.45],
        ["Mochila Urbana 20L", "MC-URB-007", "🎒", "Acessórios", 149.9, 0.5],
        ["Chinelo Slide", "CH-SLD-008", "🩴", "Calçados", 39.9, 0.42],
      ],
    },
    alimentacao: {
      label: "Alimentação e empório",
      emoji: "🍯",
      storeName: "Empório da Maria",
      tagline: "Delícias artesanais do bairro, na sua mesa.",
      suppliers: [
        ["Torrefação Serra Azul", "45.678.901/0001-40", 7, 400],
        ["Distribuidora Sabor do Campo", "56.789.012/0001-50", 4, 250],
        ["Doceria Atacado Doce Vida", "67.890.123/0001-60", 3, 150],
      ],
      products: [
        ["Café Especial Torrado 500g", "CF-ESP-001", "☕", "Cafés", 42.9, 0.5],
        ["Mel Puro Silvestre 500g", "ML-SIL-002", "🍯", "Mercearia", 34.9, 0.45],
        ["Kit Brigadeiro Gourmet", "KT-BRG-003", "🍫", "Doces", 29.9, 0.4],
        ["Granola Artesanal 800g", "GR-ART-004", "🥣", "Mercearia", 27.9, 0.42],
        ["Azeite Extravirgem 500ml", "AZ-EXV-005", "🫒", "Mercearia", 49.9, 0.6],
        ["Geleia Artesanal de Morango", "GL-MOR-006", "🍓", "Doces", 22.9, 0.4],
        ["Pão de Mel (caixa com 6)", "PM-CX6-007", "🍪", "Doces", 36.9, 0.45],
        ["Tempero Caseiro 300g", "TP-CAS-008", "🧂", "Temperos", 14.9, 0.35],
      ],
    },
    eletronicos: {
      label: "Eletrônicos e acessórios",
      emoji: "📱",
      storeName: "Maria Cell & Acessórios",
      tagline: "Capinhas, fones e carregadores com preço de bairro.",
      suppliers: [
        ["Importadora Conecta", "78.901.234/0001-70", 7, 800],
        ["Capas & Cia Atacado", "89.012.345/0001-80", 4, 200],
        ["Eletro Brás Distribuidora", "90.123.456/0001-90", 3, 300],
      ],
      products: [
        ["Fone Bluetooth TWS", "FN-TWS-001", "🎧", "Áudio", 99.9, 0.5],
        ["Capinha Anti-impacto (iPhone 15)", "CP-ANT-002", "📱", "Capinhas", 39.9, 0.3],
        ["Carregador Turbo 20W USB-C", "CR-T20-003", "🔌", "Carregadores", 69.9, 0.45],
        ["Película 3D de Vidro", "PL-3DV-004", "🛡️", "Películas", 24.9, 0.25],
        ["Caixa de Som Mini", "CX-MIN-005", "🔊", "Áudio", 129.9, 0.55],
        ["Cabo USB-C Reforçado 1m", "CB-USC-006", "🔗", "Cabos", 29.9, 0.35],
        ["Power Bank 10.000 mAh", "PB-10K-007", "🔋", "Carregadores", 119.9, 0.5],
        ["Suporte Veicular Magnético", "SP-VEI-008", "🚗", "Acessórios", 34.9, 0.38],
      ],
    },
  };

  // Grade (tamanho/modelo) por produto: [rótulo, quantidade, peso na venda].
  // A soma das quantidades = estoque total do produto (loja + depósito).
  // O peso é o "mix" de vendas, usado pela IA para sugerir a grade da compra.
  const variantSpecs = {
    moda: {
      0: { kind: "Tamanho", items: [["37", 1, 0.1], ["38", 2, 0.2], ["39", 3, 0.25], ["40", 3, 0.25], ["41", 2, 0.15], ["42", 0, 0.05]] },
      1: { kind: "Tamanho", items: [["P", 12, 0.2], ["M", 20, 0.35], ["G", 18, 0.3], ["GG", 8, 0.15]] },
      3: { kind: "Tamanho", items: [["38", 3, 0.2], ["40", 5, 0.35], ["42", 4, 0.3], ["44", 3, 0.15]] },
      5: { kind: "Tamanho", items: [["P", 5, 0.3], ["M", 7, 0.4], ["G", 5, 0.3]] },
    },
    eletronicos: {
      1: { kind: "Modelo", items: [["iPhone 13", 15, 0.25], ["iPhone 14", 20, 0.35], ["iPhone 15", 23, 0.4]] },
    },
  };
  // Validade por lote (alimentação): dias de validade e lotes [quantidade, dias até vencer].
  // quantidade null = o restante do estoque.
  const lotSpecs = {
    alimentacao: {
      0: { shelfLifeDays: 180, lots: [[null, 150]] },
      1: { shelfLifeDays: 365, lots: [[18, 6], [null, 300]] },
      2: { shelfLifeDays: 90, lots: [[null, 60]] },
      3: { shelfLifeDays: 90, lots: [[5, 3], [null, 75]] },
      4: { shelfLifeDays: 540, lots: [[null, 420]] },
      5: { shelfLifeDays: 120, lots: [[null, 95]] },
      6: { shelfLifeDays: 25, lots: [[3, 1], [null, 20]] },
      7: { shelfLifeDays: 180, lots: [[null, 150]] },
    },
  };

  // Código de barras EAN-13 demonstrativo, com dígito verificador correto
  function ean13(base12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(base12[i]) * (i % 2 ? 3 : 1);
    return base12 + ((10 - (sum % 10)) % 10);
  }

  // Monta produtos e fornecedores prontos para o estado inicial
  function build(tipo) {
    const t = tipos[tipo] || tipos.moda;
    const typeDigit = Object.keys(tipos).indexOf(tipo) + 1 || 1;
    const suppliers = t.suppliers.map(([name, cnpj, leadTimeDays, minOrder], i) => ({
      id: "f" + (i + 1),
      name,
      cnpj,
      contact: "pedidos@" + name.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 14) + ".com.br",
      whatsapp: "(11) 9" + (8100 + i * 111) + "-" + (2200 + i * 37),
      leadTimeDays,
      minOrder,
    }));
    const products = t.products.map(([name, sku, emoji, category, price, costRatio], i) => {
      const b = base[i];
      const vs = (variantSpecs[tipo] || {})[i];
      const ls = (lotSpecs[tipo] || {})[i];
      const extra = {};
      if (vs) {
        extra.variantKind = vs.kind;
        extra.variants = vs.items.map(([label, qty, weight], k) => ({
          id: "v" + (k + 1),
          label,
          sku: sku + "-" + label.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          barcode: ean13("789123" + typeDigit + String(i + 1).padStart(2, "0") + String(k + 1).padStart(2, "0") + "9"),
          qty,
          weight,
        }));
      }
      if (ls) {
        extra.shelfLifeDays = ls.shelfLifeDays;
        extra.lotSpec = ls.lots; // o núcleo transforma em lotes com data de validade
      }
      return {
        ...extra,
        id: "p" + (i + 1),
        name,
        sku,
        barcode: ean13("7891234" + typeDigit + String(i + 1).padStart(4, "0")),
        emoji,
        category,
        price,
        cost: Math.round(price * costRatio * 100) / 100,
        stock: { loja: b.loja, deposito: b.deposito },
        minStock: b.minStock,
        avgDaily: b.avgDaily,
        supplierId: suppliers[b.supplier].id,
        shelf: "Prateleira " + String.fromCharCode(65 + Math.floor(i / 3)) + ((i % 3) + 1),
        shelfCap: 12,
        issue: !!b.issue,
        lock: null,
        shelfAlert: false,
        description:
          name + " — " + t.tagline.replace(/\.$/, "").toLowerCase() + ". Qualidade garantida pela loja.",
      };
    });
    return { info: t, products, suppliers };
  }

  const api = {
    tipos: Object.fromEntries(
      Object.entries(tipos).map(([id, t]) => [id, { id, label: t.label, emoji: t.emoji, storeName: t.storeName, tagline: t.tagline }]),
    ),
    build,
    ean13,
  };
  if (typeof module !== "undefined") module.exports = api;
  global.WedTechCatalogos = api;
})(typeof window !== "undefined" ? window : globalThis);
