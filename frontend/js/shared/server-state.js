(() => {
  "use strict";

  const entries = new Map();
  const migrationKey = (app) => `wedtech-db-imported-${app}`;
  const accountKey = (userId, app) => `wedtech-db-cache-${userId}-${app}`;
  const metaKey = (userId, app) => `wedtech-db-meta-${userId}-${app}`;
  const recoveryKey = (userId, app) => `wedtech-db-recovery-${userId}-${app}`;
  let failureShown = false;

  function parse(value) {
    try {
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function writeMeta(userId, app, revision, dirty) {
    try {
      localStorage.setItem(metaKey(userId, app), JSON.stringify({ revision, dirty }));
    } catch {}
  }

  function reportFailure(message) {
    if (failureShown) return;
    failureShown = true;
    window.dispatchEvent(new CustomEvent("wedtech:persistence-error", { detail: { message } }));
  }

  function load(app, storageKey) {
    const bootstrap = window.WEDTECH_STATE_BOOTSTRAP?.app === app
      ? window.WEDTECH_STATE_BOOTSTRAP
      : { revision: 0, data: null };
    const userId = Number(window.CURRENT_USER?.id || 0);
    const serverRevision = Number(bootstrap.revision || 0);
    let localData = null;
    try {
      localData = parse(localStorage.getItem(storageKey));
    } catch {}

    if (!userId) {
      return { data: localData, revision: 0, needsSave: false, conflict: false };
    }

    let cached = null;
    let meta = null;
    try {
      cached = parse(localStorage.getItem(accountKey(userId, app)));
      meta = parse(localStorage.getItem(metaKey(userId, app)));
    } catch {}
    let data = null;
    let needsSave = false;
    let conflict = false;

    if (meta?.dirty && cached) {
      if (meta.revision === serverRevision) {
        data = cached;
        needsSave = true;
      } else if (bootstrap.data) {
        try {
          localStorage.setItem(recoveryKey(userId, app), JSON.stringify({ revision: meta.revision, data: cached }));
        } catch {}
        data = bootstrap.data;
        writeMeta(userId, app, serverRevision, false);
        window.dispatchEvent(new CustomEvent("wedtech:persistence-conflict", {
          detail: { message: "O banco tinha uma versão mais recente. A versão local foi preservada como cópia de recuperação." },
        }));
      } else {
        data = cached;
        conflict = true;
      }
    } else if (bootstrap.data) {
      data = bootstrap.data;
    } else {
      let alreadyMigrated = false;
      try {
        alreadyMigrated = localStorage.getItem(migrationKey(app)) === "1";
      } catch {}
      if (!alreadyMigrated) {
        data = localData;
        needsSave = Boolean(localData);
      }
    }

    const entry = { revision: serverRevision, pending: null, waiters: [], timer: null, saving: false, blocked: conflict };
    entries.set(app, entry);

    if (data && !conflict) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
        localStorage.setItem(accountKey(userId, app), JSON.stringify(data));
      } catch {}
      if (bootstrap.data && !meta?.dirty) writeMeta(userId, app, serverRevision, false);
    }

    return { data, revision: serverRevision, needsSave, conflict };
  }

  async function flush(app, entry) {
    if (entry.saving || !entry.pending || entry.blocked) return;
    const snapshot = entry.pending;
    entry.pending = null;
    const waiters = entry.waiters.splice(0);
    entry.saving = true;
    let saved = false;

    try {
      const response = await fetch(window.WEDTECH_STATE_ENDPOINT, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app, revision: entry.revision, data: snapshot }),
      });
      const result = await response.json().catch(() => ({}));
      // Sessão encerrada (servidor reiniciado ou tempo esgotado): no painel, volta para o login.
      // A alteração continua no cache local marcada como pendente.
      if (response.status === 401 && window.CURRENT_USER) {
        location.href = new URL("../login.php", new URL(window.WEDTECH_STATE_ENDPOINT, location.href)).href;
      }
      if (response.status === 409) {
        entry.blocked = true;
        throw new Error(result.erro || "Os dados mudaram em outra aba. Recarregue antes de continuar.");
      }
      if (!response.ok || !Number.isInteger(result.revision)) {
        throw new Error(result.erro || "Não foi possível salvar no banco de dados.");
      }

      entry.revision = result.revision;
      failureShown = false;
      const userId = Number(window.CURRENT_USER?.id || 0);
      if (userId) {
        try {
          localStorage.setItem(migrationKey(app), "1");
          localStorage.setItem(accountKey(userId, app), JSON.stringify(snapshot));
          writeMeta(userId, app, entry.revision, Boolean(entry.pending));
        } catch {}
      }
      saved = true;
      waiters.forEach((resolve) => resolve(true));
    } catch (error) {
      const userId = Number(window.CURRENT_USER?.id || 0);
      if (!entry.blocked && !entry.pending) entry.pending = snapshot;
      if (userId) writeMeta(userId, app, entry.revision, true);
      waiters.forEach((resolve) => resolve(false));
      entry.waiters.splice(0).forEach((resolve) => resolve(false));
      reportFailure(error.message);
    } finally {
      entry.saving = false;
      if (saved && entry.pending && !entry.blocked) schedule(app, entry, 0);
    }
  }

  function schedule(app, entry, delay = 120) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      flush(app, entry);
    }, delay);
  }

  function save(app, data, storageKey) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}

    const userId = Number(window.CURRENT_USER?.id || 0);
    if (!userId) return Promise.resolve(false);

    const snapshot = JSON.stringify(data);
    try {
      localStorage.setItem(accountKey(userId, app), snapshot);
      writeMeta(userId, app, entries.get(app)?.revision || 0, true);
    } catch {}

    let entry = entries.get(app);
    if (!entry) {
      const bootstrap = window.WEDTECH_STATE_BOOTSTRAP?.app === app ? window.WEDTECH_STATE_BOOTSTRAP : null;
      entry = { revision: Number(bootstrap?.revision || 0), pending: null, waiters: [], timer: null, saving: false, blocked: false };
      entries.set(app, entry);
    }
    if (entry.blocked) {
      reportFailure("Há conflito com uma versão mais recente no banco. Recarregue o painel antes de continuar.");
      return Promise.resolve(false);
    }

    writeMeta(userId, app, entry.revision, true);

    entry.pending = JSON.parse(snapshot);
    const result = new Promise((resolve) => entry.waiters.push(resolve));
    schedule(app, entry);
    return result;
  }

  async function loadRemote(app, storageKey) {
    try {
      const url = new URL(window.WEDTECH_STATE_ENDPOINT, location.href);
      url.searchParams.set("app", app);
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) return { authenticated: false, ...load(app, storageKey) };
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.erro || "Não foi possível carregar os dados.");

      if (!window.CURRENT_USER) window.CURRENT_USER = { id: result.user_id };
      window.WEDTECH_STATE_BOOTSTRAP = {
        app,
        revision: result.state?.revision || 0,
        data: result.state?.data || null,
      };
      return { authenticated: true, ...load(app, storageKey) };
    } catch (error) {
      reportFailure(error.message);
      return { authenticated: false, ...load(app, storageKey) };
    }
  }

  // Tempo real: pergunta ao servidor se há versão mais nova (compra na vitrine, devolução, outra
  // tela, mudança do consultor) e, se houver, baixa os dados. Nunca atropela uma gravação em andamento.
  const contracts = new Map();
  async function pull(app, storageKey) {
    const entry = entries.get(app);
    if (!entry || entry.pending || entry.saving || entry.timer) return null;
    const url = new URL(window.WEDTECH_STATE_ENDPOINT, location.href);
    url.searchParams.set("app", app);
    url.searchParams.set("revisao", "1");
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const check = await response.json().catch(() => ({}));
    const contractChanged = contracts.has(app) && contracts.get(app) !== check.contrato;
    contracts.set(app, check.contrato);
    if (!(check.revision > entry.revision || contractChanged)) return null;

    url.searchParams.delete("revisao");
    const full = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const result = await full.json().catch(() => ({}));
    // Durante o download o usuário pode ter alterado algo: nesse caso a gravação dele vem primeiro
    if (!full.ok || !result.ok || !result.state?.data || entry.pending || entry.saving || entry.timer) return null;
    entry.revision = result.state.revision;
    entry.blocked = false;
    const userId = Number(window.CURRENT_USER?.id || 0);
    try {
      localStorage.setItem(storageKey, JSON.stringify(result.state.data));
      if (userId) {
        localStorage.setItem(accountKey(userId, app), JSON.stringify(result.state.data));
        writeMeta(userId, app, entry.revision, false);
      }
    } catch {}
    return result.state.data;
  }

  window.WedTechServerState = { load, loadRemote, save, pull };
})();