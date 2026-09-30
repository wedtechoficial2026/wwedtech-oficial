// Avisos em tempo real: janela flutuante no canto da tela e som de notificação.
// O som é gerado pelo navegador (Web Audio), sem arquivo; o lojista pode desligar.
// Navegadores só liberam som depois do primeiro clique na página, por isso o áudio
// é preparado no primeiro toque.
(() => {
  "use strict";

  const SOUND_KEY = "wedtech-som";
  let audio = null;

  function soundOn() {
    try {
      return localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      return true;
    }
  }
  function setSound(on) {
    try {
      localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    } catch {}
  }
  function prepareAudio() {
    if (audio || !window.AudioContext) return;
    try {
      audio = new AudioContext();
    } catch {}
  }
  document.addEventListener("pointerdown", prepareAudio, { once: true });
  document.addEventListener("keydown", prepareAudio, { once: true });

  // "Plim-plom": duas notas curtas e suaves
  function chime() {
    if (!soundOn()) return;
    prepareAudio();
    if (!audio) return;
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const now = audio.currentTime;
    [
      [880, 0],
      [1318.5, 0.14],
    ].forEach(([freq, at]) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.45);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.5);
    });
  }

  function stack() {
    let el = document.getElementById("wedtech-alerts");
    if (!el) {
      el = document.createElement("div");
      el.id = "wedtech-alerts";
      el.className = "wt-alerts";
      el.setAttribute("aria-live", "polite");
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    return el;
  }

  // Janela flutuante: some sozinha em 9 s; clicar executa onClick (ex.: abrir o pedido)
  function show({ icon = "🔔", title = "", text = "", onClick } = {}) {
    const box = stack();
    while (box.children.length >= 4) box.firstElementChild.remove();
    const card = document.createElement("div");
    card.className = "wt-alert";
    const main = document.createElement("button");
    main.type = "button";
    main.className = "wt-alert-body";
    const ico = document.createElement("span");
    ico.className = "wt-alert-icon";
    ico.textContent = icon;
    const txt = document.createElement("span");
    txt.className = "wt-alert-text";
    const b = document.createElement("b");
    b.textContent = title;
    const small = document.createElement("small");
    small.textContent = text;
    txt.append(b, small);
    main.append(ico, txt);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "wt-alert-close";
    close.setAttribute("aria-label", "Fechar aviso");
    close.textContent = "×";
    card.append(main, close);
    const remove = () => {
      card.classList.add("leaving");
      setTimeout(() => card.remove(), 250);
    };
    main.addEventListener("click", () => {
      remove();
      if (onClick) onClick();
    });
    close.addEventListener("click", remove);
    box.appendChild(card);
    setTimeout(remove, 9000);
    return card;
  }

  window.WedTechAlerts = { show, chime, soundOn, setSound };
})();
