// src/storage.ts
import { mkdirSync, writeFileSync, renameSync, chmodSync, existsSync, readFileSync, copyFileSync } from "fs";
import { join } from "path";
function dir() {
  return join(process.env.HOME ?? "/root", ".config", "opencode");
}
function file() {
  return join(dir(), "opencode-go-accounts.json");
}
function stateFile() {
  return join(dir(), "opencode-go-rotation.json");
}
var PERMS = 384;
function newFile() {
  return { version: 1, accounts: [], rotationIndex: 0 };
}
function newState() {
  return { lastUsedIndex: -1 };
}
function atomicWrite(path, data) {
  const d = dir();
  mkdirSync(d, { recursive: true });
  const tmp = path + ".tmp." + process.pid;
  writeFileSync(tmp, data, "utf-8");
  chmodSync(tmp, PERMS);
  renameSync(tmp, path);
}
function loadAccounts() {
  const f = file();
  if (!existsSync(f))
    return newFile();
  try {
    const raw = readFileSync(f, "utf-8");
    return JSON.parse(raw);
  } catch {
    copyFileSync(f, f + ".bak." + Date.now());
    return newFile();
  }
}
function saveAccounts(data) {
  atomicWrite(file(), JSON.stringify(data, null, 2) + `
`);
}
function loadRotationState() {
  const sf = stateFile();
  if (!existsSync(sf))
    return newState();
  try {
    const raw = readFileSync(sf, "utf-8");
    return JSON.parse(raw);
  } catch {
    return newState();
  }
}
function saveRotationState(state) {
  atomicWrite(stateFile(), JSON.stringify(state) + `
`);
}

// src/rotate.ts
function hasAccounts(accounts) {
  return accounts.some((a) => a.enabled);
}

class NoEnabledAccounts extends Error {
  constructor() {
    super("no enabled Go accounts configured");
    this.name = "NoEnabledAccounts";
  }
}
function selectAccount(accounts, lastIndex) {
  const total = accounts.length;
  if (total === 0)
    throw new NoEnabledAccounts;
  for (let i = 1;i <= total; i++) {
    const idx = (lastIndex + i) % total;
    if (accounts[idx].enabled) {
      return { account: accounts[idx], index: idx };
    }
  }
  throw new NoEnabledAccounts;
}

// src/fetch.ts
function createRotatingFetch(accounts, lastIndex, baseFetch) {
  const state = {
    activeIndex: null,
    exhausted: new Set
  };
  const fetch = async (input, init) => {
    const useFetch = baseFetch ?? globalThis.fetch;
    const pickActive = () => {
      if (state.activeIndex !== null && !state.exhausted.has(state.activeIndex)) {
        const acct = accounts[state.activeIndex];
        if (acct && acct.enabled)
          return { account: acct, index: state.activeIndex };
      }
      const result = selectAccount(accounts, lastIndex);
      state.activeIndex = result.index;
      state.exhausted.delete(result.index);
      return result;
    };
    let current = pickActive();
    while (true) {
      const headers = new Headers(init?.headers);
      headers.delete("authorization");
      headers.delete("Authorization");
      headers.set("Authorization", `Bearer ${current.account.apiKey}`);
      const response = await useFetch(input, { ...init, headers });
      if (response.status !== 429)
        return response;
      state.exhausted.add(current.index);
      let nextResult;
      try {
        nextResult = selectAccount(accounts, current.index);
      } catch (err) {
        if (err instanceof NoEnabledAccounts) {
          return new Response("all Go accounts exhausted", {
            status: 429,
            statusText: "All accounts rate-limited"
          });
        }
        throw err;
      }
      if (state.exhausted.has(nextResult.index)) {
        return new Response("all Go accounts exhausted", {
          status: 429,
          statusText: "All accounts rate-limited"
        });
      }
      current = nextResult;
    }
  };
  return { fetch, state };
}

// src/logger.ts
import { appendFileSync, mkdirSync as mkdirSync2 } from "fs";
import { join as join2 } from "path";
var dir2 = join2(process.env.HOME ?? "/root", ".config", "opencode");
var file2 = join2(dir2, "opencode-go-multi-auth.log");
var started = false;
function ensure() {
  if (started)
    return;
  mkdirSync2(dir2, { recursive: true });
  started = true;
}
function log(level, msg, data) {
  ensure();
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...data
  });
  try {
    appendFileSync(file2, entry + `
`, "utf-8");
  } catch {}
}

// src/index.ts
var plugin = async ({ client }) => {
  const authClient = client;
  return {
    auth: {
      provider: "opencode",
      async loader(getAuth) {
        const data = loadAccounts();
        const state = loadRotationState();
        if (!hasAccounts(data.accounts)) {
          log("warn", "loader skipped", { reason: "no enabled accounts" });
          return {};
        }
        const { account, index } = selectAccount(data.accounts, state.lastUsedIndex);
        data.rotationIndex = index;
        saveAccounts(data);
        saveRotationState({ lastUsedIndex: index });
        await authClient.auth.set({
          path: { id: "opencode" },
          body: { type: "api", key: account.apiKey }
        });
        const { fetch } = createRotatingFetch(data.accounts, state.lastUsedIndex);
        log("info", "loader active", {
          account: account.label || `account-${index}`,
          index,
          total: data.accounts.length
        });
        return {
          apiKey: "",
          async fetch(input, init) {
            return fetch(input, init);
          }
        };
      },
      methods: [
        {
          type: "api",
          label: "Add Go Account",
          prompts: [
            { type: "text", key: "apiKey", message: "Go API key from opencode.ai/auth" },
            { type: "text", key: "label", message: "Label for this account (optional)" }
          ],
          async authorize(inputs) {
            const key = inputs?.apiKey?.trim();
            if (!key)
              return { type: "failed" };
            const data = loadAccounts();
            const label = inputs?.label?.trim() || undefined;
            data.accounts.push({
              apiKey: key,
              label,
              addedAt: Date.now(),
              enabled: true
            });
            if (data.accounts.length === 1)
              data.rotationIndex = 0;
            saveAccounts(data);
            await authClient.auth.set({
              path: { id: "opencode" },
              body: { type: "api", key }
            });
            log("info", "account added via auth login", {
              label: label || `account-${data.accounts.length}`,
              count: data.accounts.length
            });
            return { type: "success", key };
          }
        }
      ]
    }
  };
};
var src_default = plugin;
export {
  src_default as default
};
