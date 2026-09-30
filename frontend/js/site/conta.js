"use strict";
// Acesso na home: consulta a sessão e faz login pela API PHP (api/). Quem ainda não tem conta
// fala com um consultor (as contas das lojas são criadas por ele). O painel abre em uma nova aba:
// lojista no painel da loja, consultor e administrador na área do consultor.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const config = window.WEDTECH_CONFIG || {};
  const API = config.API_URL || "api/";
  const apiBase = new URL(API, location.href);
  // Caminhos devolvidos pela API são relativos à pasta api/; os da sessão, à raiz do site
  const fromApi = (path) => new URL(path, apiBase).href;
  const fromRoot = (path) => new URL(path, new URL("../", apiBase)).href;

  // Mesmo tema (escuro/claro) e cor de destaque escolhidos no painel
  const aplicarTema = () => {
    try {
      const cfg = JSON.parse(localStorage.getItem("estoque-inteligente-v2") || "null")?.cfg || {};
      document.body.setAttribute("data-theme", cfg.tema === "light" ? "light" : "dark");
      if (cfg.cor) document.documentElement.style.setProperty("--acc", cfg.cor);
    } catch {
      document.body.setAttribute("data-theme", "dark");
    }
  };
  aplicarTema();
  window.addEventListener("storage", (e) => e.key === "estoque-inteligente-v2" && aplicarTema());

  // Sem vitrine de exemplo configurada, esconde o link
  if (!config.LOJA_URL) $$("[data-loja-link]").forEach((a) => (a.style.display = "none"));

  const api = async (rota, opcoes = {}) => {
    const r = await fetch(new URL(rota, apiBase), { credentials: "same-origin", ...opcoes });
    const dados = await r.json().catch(() => ({}));
    return { status: r.status, ...dados };
  };

  let logado = false;
  const marcarLogado = (usuario, painel) => {
    logado = true;
    const nome = (usuario?.nome || "").trim().split(/\s+/)[0];
    const staff = usuario?.papel === "consultor" || usuario?.papel === "admin";
    $$("[data-login]").forEach((a) => {
      a.href = painel;
      a.target = "_blank";
      a.textContent = staff ? "Área do consultor" : nome ? `Painel de ${nome}` : "Acessar painel";
    });
  };

  api("sessao.php")
    .then((s) => (s.logado ? marcarLogado(s.usuario, fromRoot(s.painel)) : $$("[data-login]").forEach((a) => (a.textContent = "Entrar"))))
    .catch(() => {});

  const modal = $("#login-modal");
  const loginForm = $("#login-form");
  const sucesso = $("#login-ok");
  if (!modal || !loginForm) return;

  const abrir = () => {
    $$("dialog[open]").forEach((d) => d !== modal && d.close());
    modal.showModal ? modal.open || modal.showModal() : modal.setAttribute("open", "");
    loginForm.hidden = false;
    sucesso.hidden = true;
    $(".form-error", loginForm).textContent = "";
    loginForm.querySelector("input")?.focus();
  };
  const fechar = () => (modal.close ? modal.close() : modal.removeAttribute("open"));

  // "Entrar" no topo: sem sessão abre o acesso aqui mesmo; com sessão o link abre o painel em nova aba
  $$("[data-login]").forEach((a) =>
    a.addEventListener("click", (e) => {
      if (logado) return;
      e.preventDefault();
      abrir();
    }),
  );
  // Link direto index.html#entrar (usado pelo login.php); o antigo #criar-conta leva aos planos
  const porHash = () => {
    if (location.hash === "#entrar") abrir();
    if (location.hash === "#criar-conta") $("#planos")?.scrollIntoView();
  };
  window.addEventListener("hashchange", porHash);
  porHash();

  // Sem acesso ainda: fecha o login e abre o formulário "Falar com um consultor"
  $$("[data-sem-conta]", modal).forEach((b) =>
    b.addEventListener("click", () => {
      fechar();
      $('[data-contratar="Profissional"]')?.click();
    }),
  );

  // ---- Exemplos: vendedor (lojista) abre o painel da loja; adm abre a área do consultor ----
  const exemplos = {
    vendedor: { email: "admin@wedtech.com", senha: "admin123" },
    adm: { email: "adm@wedtech.com", senha: "adm123" },
  };
  $$("[data-exemplo]", modal).forEach((b) =>
    b.addEventListener("click", () => {
      const dados = exemplos[b.dataset.exemplo];
      loginForm.elements.email.value = dados.email;
      loginForm.elements.senha.value = dados.senha;
      $(".form-error", loginForm).textContent = "";
      $("button[type=submit]", loginForm).focus();
    }),
  );

  // ---- Depois de entrar: painel (ou área do consultor) em nova aba ----
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $(".form-error", loginForm);
    const dados = Object.fromEntries(new FormData(loginForm));
    if (!dados.email.trim() || !dados.senha) {
      erro.textContent = "Preencha o e-mail e a senha.";
      return;
    }
    const botao = $("button[type=submit]", loginForm);
    botao.disabled = true;
    botao.textContent = "Aguarde...";
    erro.textContent = "";
    try {
      const r = await api("login.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
      if (r.ok) {
        const destino = fromApi(r.redirect);
        marcarLogado(r.usuario, destino);
        loginForm.reset();
        const aba = window.open(destino, "_blank");
        if (aba) {
          aba.opener = null;
          fechar();
        } else {
          // Navegador bloqueou a nova aba: mostra o botão para abrir com um clique
          loginForm.hidden = true;
          $("[data-open-painel]", modal).href = destino;
          sucesso.hidden = false;
          $("[data-open-painel]", modal)?.focus();
        }
      } else erro.textContent = r.erro || "Não foi possível entrar. Tente de novo.";
    } catch {
      erro.textContent = "Sem conexão com o servidor. Verifique se ele está rodando.";
    }
    botao.disabled = false;
    botao.textContent = "Entrar";
  });

  $("[data-open-painel]", modal)?.addEventListener("click", () => setTimeout(fechar, 0));
})();
