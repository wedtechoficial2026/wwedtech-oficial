// WedTech — endereços usados pelo painel e pela vitrine.
// Para apontar o "Voltar ao site" para outro lugar, mude só HOME_URL.
// Aberto direto do disco (file://), volta para a página inicial do projeto.
window.WEDTECH_CONFIG = {
  HOME_URL: location.protocol === "file:" ? "../index.html" : "/",
};
