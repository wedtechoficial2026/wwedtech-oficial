// WedTech — página inicial. Sem dependências; tudo funciona offline.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (t) =>
    String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // Preço "a partir de" e limites de cada plano. O valor final é fechado com um
  // consultor, porque cada integração de marketplace (API) tem custo.
  const PLANOS = {
    Básico: 50,
    Profissional: 100,
    Avançado: 200,
  };
  const LIMITES = {
    Básico: { canais: 3, marketplaces: 1 },
    Profissional: { canais: 6, marketplaces: 3 },
    Avançado: { canais: 8, marketplaces: 5 },
  };
  const MARKETPLACE_EXTRA = 25;

  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  // Links para o produto vêm de assets/config.js (a home pode ficar em outro domínio)
  const config = window.WEDTECH_CONFIG || {};
  if (config.APP_URL) $$("[data-app-link]").forEach((a) => (a.href = config.APP_URL));
  if (config.LOJA_URL) $$("[data-loja-link]").forEach((a) => (a.href = config.LOJA_URL));

  // Cliente com sessão aberta vai direto ao painel: ajusta o texto do botão Entrar
  try {
    if (sessionStorage.getItem("wedtech-session") === "1")
      $$("[data-login]").forEach((a) => (a.textContent = "Acessar painel"));
  } catch {}

  // Protótipo: pedidos e conversas ficam só neste navegador
  const saveLead = async (lead) => {
    const entry = {
      ...lead,
      nome: lead.nome || "Lead IA",
      whatsapp: lead.whatsapp || "",
      client_id: crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
            const value = Math.floor(Math.random() * 16);
            return (char === "x" ? value : (value & 3) | 8).toString(16);
          }),
      em: new Date().toISOString(),
    };
    try {
      const leads = JSON.parse(localStorage.getItem("wedtech-leads") || "[]");
      leads.push(entry);
      localStorage.setItem("wedtech-leads", JSON.stringify(leads));
    } catch {}

    try {
      const response = await fetch(`${config.API_URL || "api/"}leads.php`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!response.ok) return false;
      return true;
    } catch {
      return false;
    }
  };

  // Header com sombra ao rolar
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Menu mobile
  const toggle = $(".menu-toggle");
  const nav = $("#main-nav");
  const setMenu = (open) => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  };
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) setMenu(false);
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("open")) {
      setMenu(false);
      toggle.focus();
    }
  });

  // Contadores animados dos números da empresa
  const fmt = (n, d) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.count);
    const d = Number(el.dataset.decimals || 0);
    if (reduceMotion) return (el.textContent = fmt(target, d));
    const start = performance.now();
    const dur = 1400;
    const tick = (t) => {
      const p = Math.min((t - start) / dur, 1);
      el.textContent = fmt(target * (1 - Math.pow(1 - p, 3)), d);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // Entrada suave das seções (só com JS ativo; sem JS tudo fica visível)
  const revealTargets = $$(
    ".section-head, .compare, .steps li, .feature, .review, .sec-item, .company-card, .plan, .faq details",
  );
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          if (el.dataset.count) runCounter(el);
          else el.classList.add("visible");
          io.unobserve(el);
        });
      },
      { threshold: 0.15 },
    );
    $$("[data-count]").forEach((el) => io.observe(el));
    if (!reduceMotion)
      revealTargets.forEach((el) => {
        el.classList.add("reveal");
        io.observe(el);
      });
  }

  // Modais (dialog nativo, com fallback)
  const openDialog = (d) => {
    $$("dialog[open]").forEach((o) => o !== d && closeDialog(o));
    if (typeof d.showModal === "function") d.open || d.showModal();
    else d.setAttribute("open", "");
  };
  const closeDialog = (d) => (d.close ? d.close() : d.removeAttribute("open"));
  $$("dialog").forEach((d) => {
    $$("[data-close]", d).forEach((b) => b.addEventListener("click", () => closeDialog(d)));
    // Clique fora do conteúdo (no backdrop) fecha
    d.addEventListener("click", (e) => {
      if (e.target === d) closeDialog(d);
    });
  });

  /* ---------- Contratação ---------- */
  const modal = $("#contratar-modal");
  const form = $("#contratar-form");
  const formView = $(".modal-form-view");
  const success = $(".modal-success");
  const error = $("#form-error");
  const estimate = $("[data-estimate]");
  const checkedChannels = () => $$('input[name="canal"]:checked', form);

  // Estimativa ao vivo: base do plano + marketplaces além do incluso.
  // Se passar do limite de canais, sugere o plano de cima.
  const syncPrice = () => {
    const plano = form.plano.value;
    const lim = LIMITES[plano];
    const canais = checkedChannels();
    const mkts = canais.filter((c) => c.dataset.kind === "marketplace" || c.dataset.kind === "delivery").length;
    const acima = Object.keys(LIMITES).find((p) => LIMITES[p].canais >= canais.length);
    if (canais.length > lim.canais) {
      estimate.className = "estimate warn";
      estimate.innerHTML = `Você escolheu <b>${canais.length} canais</b>, e o plano ${plano} vai até ${lim.canais}. Sugestão: plano <b>${acima}</b> (a partir de R$ ${PLANOS[acima]}/mês).`;
      return;
    }
    const extras = Math.max(0, mkts - lim.marketplaces);
    const total = PLANOS[plano] + extras * MARKETPLACE_EXTRA;
    estimate.className = "estimate";
    estimate.innerHTML = `<span>Estimativa: <b>a partir de R$ ${total}/mês</b></span><small>${canais.length} de ${lim.canais} canais · ${mkts} canal${mkts === 1 ? "" : "is"} externo${mkts === 1 ? "" : "s"}${
      extras ? ` (${extras} além do incluso, + R$ ${MARKETPLACE_EXTRA} cada)` : ""
    } · o consultor confirma o valor final</small>`;
  };
  form.plano.addEventListener("change", syncPrice);
  form.addEventListener("change", (e) => e.target.name === "canal" && syncPrice());

  const openContratar = (plano) => {
    formView.hidden = false;
    success.hidden = true;
    error.textContent = "";
    if (plano && PLANOS[plano]) form.plano.value = plano;
    syncPrice();
    openDialog(modal);
    form.nome.focus();
  };

  $$("[data-contratar]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      openContratar(b.dataset.contratar);
    }),
  );

  // Máscara simples de telefone: (11) 91234-5678
  const maskPhone = (input) =>
    input.addEventListener("input", () => {
      const d = input.value.replace(/\D/g, "").slice(0, 11);
      input.value =
        d.length > 6
          ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`
          : d.length > 2
            ? `(${d.slice(0, 2)}) ${d.slice(2)}`
            : d;
    });
  maskPhone(form.whatsapp);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    const email = form.email.value.trim();
    const fone = form.whatsapp.value.replace(/\D/g, "");
    const checks = [
      [form.nome, nome.length >= 3, "Informe seu nome completo."],
      [form.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Informe um e-mail válido."],
      [form.whatsapp, fone.length >= 10, "Informe um WhatsApp com DDD."],
    ];
    const canais = checkedChannels().map((c) => c.value);
    if (!canais.length) {
      error.textContent = "Escolha pelo menos um canal de venda.";
      return;
    }
    checks.forEach(([input, ok]) => input.setAttribute("aria-invalid", String(!ok)));
    const failed = checks.find(([, ok]) => !ok);
    if (failed) {
      error.textContent = failed[2];
      failed[0].focus();
      return;
    }
    const plano = form.plano.value;
    if (!(await saveLead({ origem: "consultor", nome, email, whatsapp: form.whatsapp.value, plano, canais }))) {
      error.textContent = "Não foi possível salvar seu contato. Verifique sua conexão e tente novamente.";
      return;
    }
    $("[data-success-name]").textContent = nome.split(" ")[0];
    $("[data-success-plan]").textContent = `${plano} (a partir de R$ ${PLANOS[plano]}/mês)`;
    $("[data-success-channels]").textContent = canais.length === 1 ? "1 canal" : `${canais.length} canais`;
    formView.hidden = true;
    success.hidden = false;
    form.reset();
    success.querySelector("a").focus();
  });

  /* ---------- Plano personalizado: abas ---------- */
  const custom = $("#custom-modal");
  const tabs = $$('[role="tab"]', custom);
  const selectTab = (id) => {
    tabs.forEach((t) => {
      const on = t.id === id;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => {
      selectTab(t.id);
      if (t.id === "tab-vendedor") startChat();
      else startIA();
    });
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });

  const openCustom = (modo) => {
    openDialog(custom);
    if (modo === "ia") {
      selectTab("tab-ia");
      startIA();
    } else {
      selectTab("tab-vendedor");
      startChat();
    }
  };
  $$("[data-personalizado]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      openCustom(b.dataset.personalizado);
    }),
  );

  /* ---------- Vendedor online (chat simulado) ---------- */
  const chatLog = $("#chat-log");
  const chatForm = $("#chat-form");
  const chatInput = $("#chat-input");
  let chatStep = 0;
  let chatHistory = [];
  let iaSugestao = null;

  const bubble = (log, who, html) => {
    const el = document.createElement("div");
    el.className = `msg msg-${who}`;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };
  // Mostra "digitando..." antes da resposta, para parecer uma conversa real
  const reply = (log, html, delay = 900) =>
    new Promise((res) => {
      const typing = bubble(log, "bot", '<span class="typing"><i></i><i></i><i></i></span>');
      setTimeout(
        () => {
          typing.innerHTML = html;
          log.scrollTop = log.scrollHeight;
          res(typing);
        },
        reduceMotion ? 0 : delay,
      );
    });

  const startChat = () => {
    if (chatStep > 0 && !iaSugestao) return chatInput.focus();
    chatLog.innerHTML = "";
    chatHistory = [];
    chatStep = 1;
    chatInput.disabled = false;
    const abertura = iaSugestao
      ? `Oi! Sou a Camila, consultora da WedTech 👋 Vi que a nossa IA sugeriu o plano <b>${esc(iaSugestao)}</b>. Quer ajustar algo ou tirar alguma dúvida?`
      : "Oi! Sou a Camila, consultora da WedTech 👋 Me conta: o que sua loja vende e em quantos canais?";
    iaSugestao = null;
    reply(chatLog, abertura, 500);
    chatInput.focus();
  };

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    chatHistory.push(text);
    bubble(chatLog, "user", esc(text));
    if (chatStep === 1) {
      chatStep = 2;
      await reply(
        chatLog,
        "Perfeito! Consigo montar uma proposta sob medida para você. Me passa seu nome e WhatsApp que eu envio os valores por lá?",
      );
      showLeadForm();
    } else {
      await reply(chatLog, "Anotado! Vou incluir isso na sua proposta. 😉");
    }
  });

  const showLeadForm = () => {
    chatInput.disabled = true;
    const el = bubble(
      chatLog,
      "form",
      `<form class="lead-form" novalidate>
        <label class="sr-only" for="lead-nome">Seu nome</label>
        <input id="lead-nome" name="nome" placeholder="Seu nome" autocomplete="name" />
        <label class="sr-only" for="lead-whats">WhatsApp</label>
        <input id="lead-whats" name="whatsapp" type="tel" inputmode="tel" placeholder="WhatsApp com DDD" autocomplete="tel" />
        <p class="form-error" role="alert"></p>
        <button class="btn btn-primary btn-block" type="submit">Receber proposta</button>
      </form>`,
    );
    const f = $("form", el);
    maskPhone(f.whatsapp);
    f.nome.focus();
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = f.nome.value.trim();
      const whats = f.whatsapp.value;
      const err = $(".form-error", f);
      if (nome.length < 2) return (err.textContent = "Informe seu nome."), f.nome.focus();
      if (whats.replace(/\D/g, "").length < 10)
        return (err.textContent = "Informe um WhatsApp com DDD."), f.whatsapp.focus();
      if (!(await saveLead({ origem: "vendedor", nome, whatsapp: whats, conversa: chatHistory }))) {
        err.textContent = "Não foi possível salvar seu contato. Verifique sua conexão e tente novamente.";
        return;
      }
      el.remove();
      bubble(chatLog, "user", `${esc(nome)} · ${esc(whats)}`);
      chatStep = 3;
      await reply(
        chatLog,
        `Obrigada, ${esc(nome.split(" ")[0])}! Já estou preparando sua proposta e chamo você no WhatsApp em até 15 minutos. Se quiser, pode continuar escrevendo por aqui.`,
      );
      chatInput.disabled = false;
      chatInput.focus();
    });
  };

  /* ---------- Montar com a IA ---------- */
  const iaFlow = $("#ia-flow");
  const PERGUNTAS = [
    {
      q: "Em quantos canais você quer vender? (loja física, site, WhatsApp e marketplaces)",
      opts: [["Até 3", 0], ["4 a 6", 1], ["7 ou 8", 2]],
    },
    {
      q: "Quantos pedidos por mês, mais ou menos?",
      opts: [["Até 300", 0], ["300 a 2.000", 1], ["2.000 a 10.000", 2], ["Mais de 10.000", 3]],
    },
    {
      q: "Quantas pessoas vão usar o sistema?",
      opts: [["Só eu", 0], ["2 ou 3", 1], ["4 a 10", 2], ["Mais de 10", 3]],
    },
    {
      q: "Precisa de algo a mais?",
      opts: [
        ["Não, só o essencial", 0],
        ["Nota fiscal e etiqueta automáticas", 1],
        ["Vários depósitos", 2],
        ["Integração com meu sistema (API)", 3],
      ],
    },
  ];
  let respostas = [];

  const startIA = () => {
    iaFlow.innerHTML = "";
    respostas = [];
    reply(
      iaFlow,
      "Olá! Sou a <b>WedTech AI</b> ✨ Responda 4 perguntas rápidas e eu recomendo o plano ideal para a sua loja.",
      400,
    ).then(ask);
  };

  const ask = async () => {
    const i = respostas.length;
    if (i === PERGUNTAS.length) return recomendar();
    const p = PERGUNTAS[i];
    await reply(iaFlow, `<small class="ia-step">Pergunta ${i + 1} de ${PERGUNTAS.length}</small>${p.q}`, 500);
    const opts = bubble(
      iaFlow,
      "opts",
      p.opts.map(([label], k) => `<button type="button" class="chip" data-k="${k}">${label}</button>`).join(""),
    );
    opts.querySelector("button").focus();
    opts.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const [label, nivel] = p.opts[Number(b.dataset.k)];
      opts.remove();
      bubble(iaFlow, "user", label);
      respostas.push({ label, nivel });
      ask();
    });
  };

  const recomendar = async () => {
    const nomes = ["Básico", "Profissional", "Avançado"];
    const nivel = Math.max(...respostas.map((r) => r.nivel));
    const resumo = respostas.map((r) => `<li>${r.label}</li>`).join("");
    let html;
    if (nivel <= 2) {
      const plano = nomes[nivel];
      iaSugestao = plano;
      html = `<div class="ia-result">
        <small>Recomendação da WedTech AI</small>
        <h3>Plano ${plano}</h3>
        <p class="ia-price"><span>a partir de</span> R$ ${PLANOS[plano]}<span>/mês</span></p>
        <p>Com base no que você me contou:</p><ul>${resumo}</ul>
        <div class="ia-actions">
          <button type="button" class="btn btn-primary btn-block" data-ia="contratar">Falar com um consultor sobre o ${plano}</button>
          <button type="button" class="btn btn-outline btn-block" data-ia="vendedor">Conversar agora com um vendedor</button>
          <button type="button" class="link-btn" data-ia="refazer">Refazer as perguntas</button>
        </div>
      </div>`;
    } else {
      // Operação maior que o Avançado: estimativa a partir dos extras escolhidos
      const [, pedidos, usuarios, extra] = respostas.map((r) => r.nivel);
      const estimativa =
        200 + (pedidos === 3 ? 100 : 0) + (usuarios === 3 ? 50 : 0) + (extra === 3 ? 80 : 0);
      iaSugestao = `Personalizado (estimativa de R$ ${estimativa}/mês)`;
      html = `<div class="ia-result">
        <small>Recomendação da WedTech AI</small>
        <h3>Plano Personalizado</h3>
        <p class="ia-price"><span>a partir de</span> R$ ${estimativa}<span>/mês</span></p>
        <p>Sua operação é maior que o plano Avançado. Montei esta estimativa com base em:</p><ul>${resumo}</ul>
        <p>Um vendedor fecha o valor exato com você.</p>
        <div class="ia-actions">
          <button type="button" class="btn btn-primary btn-block" data-ia="vendedor">Fechar com um vendedor</button>
          <button type="button" class="link-btn" data-ia="refazer">Refazer as perguntas</button>
        </div>
      </div>`;
    }
    const el = await reply(iaFlow, html, 1200);
    // Mostra o resultado a partir do topo (nome do plano e preço)
    iaFlow.scrollTop = el.offsetTop - iaFlow.offsetTop - 8;
    await saveLead({ origem: "ia", respostas: respostas.map((r) => r.label), sugestao: iaSugestao });
    $(".ia-result button", iaFlow).focus();
  };

  iaFlow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ia]");
    if (!b) return;
    const acao = b.dataset.ia;
    if (acao === "refazer") startIA();
    else if (acao === "vendedor") {
      selectTab("tab-vendedor");
      startChat();
    } else if (acao === "contratar") {
      const plano = iaSugestao;
      iaSugestao = null;
      openContratar(plano);
    }
  });
})();
