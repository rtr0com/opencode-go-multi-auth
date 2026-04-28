# Architecture

How `opencode-go-multi-auth` is built, how the modules interact, and the data flow.

---

## Module Overview

```
src/
├── types.ts       # Shared type definitions
├── storage.ts     # Atomic file I/O for accounts & rotation state
├── rotate.ts      # Round-robin account selection logic
├── fetch.ts       # Auth header injection + 429 failover interceptor
├── index.ts       # Plugin entry point (loader + auth methods)
└── __tests__/     # 23 automated tests
    ├── storage.test.ts
    ├── rotate.test.ts
    ├── fetch.test.ts
    └── plugin.test.ts
```

---

## Data Flow

### Session Start

```
1. OpenCode starts
         │
2. Auth Store Check ─── empty? ──▶ Skip plugin loader
         │
      has value
         │
3. Plugin loader() invoked
         │
4. loadAccounts() ──────────▶ reads ~/.config/opencode/opencode-go-accounts.json
   loadRotationState() ────▶ reads ~/.config/opencode/opencode-go-rotation.json
         │
5. hasAccounts() check ────▶ if no enabled accounts, return {} (skip)
         │
      has accounts
         │
6. selectAccount(accounts, lastUsedIndex)
   │  ├── start from (lastIndex + 1) % total
   │  ├── skip disabled accounts
   │  └── return { account, index }
   │
7. Persist rotation state
   │  ├── saveAccounts({ ...rotationIndex: index })
   │  └── saveRotationState({ lastUsedIndex: index })
   │
8. Sync key to auth store
   │  └── authClient.auth.set({ body: { type: "api", key } })
   │
9. Create rotating fetch
   │  └── createRotatingFetch(accounts, lastUsedIndex)
   │
10. Return { apiKey, fetch } to OpenCode
```

### Request Flow

```
OpenCode API call
         │
         ▼
rotatingFetch(input, init)
         │
         ├── headers.set("Authorization", "Bearer <activeKey>")
         ├── await globalThis.fetch(input, headers)
         │
         ▼
    Response status?
         │
     200 ──▶ return response ✓
     429 ──▶ mark account exhausted
             │
             ▼
             select next enabled account
             │
          exhausted? ──▶ return 429 "all Go accounts exhausted"
             │
          not exhausted
             │
             ▼
             retry request with new auth header
```

### Account Management Flow

```
User selects "Add Go Account"
         │
         ├── prompts: apiKey, label
         │
         ▼
authorize({ apiKey, label })
    │
    ├── loadAccounts() from disk
    ├── append new account
    ├── saveAccounts() to disk
    ├── authClient.auth.set() to prime store
    └── return success

User selects "Manage Accounts"
         │
         ▼
authorize()
    ├── loadAccounts() from disk
    ├── print account list to terminal
    ├── prompt: "Enter number to remove"
    ├── splice selected account
    ├── adjust rotationIndex if needed
    ├── saveAccounts() to disk
    └── return dummy oauth result

User selects "View Account Status"
         │
         ▼
authorize()
    ├── loadAccounts() from disk
    ├── print account list with active marker
    ├── print rotation position
    └── return dummy oauth result
```

---

## Module Details

### `types.ts` — Shared Types

```ts
interface GoAccount {
  apiKey: string
  label?: string
  addedAt: number        // Unix ms timestamp
  enabled: boolean       // false = skipped during rotation
}

interface AccountsFile {
  version: 1             // schema version for forward compat
  accounts: GoAccount[]
  rotationIndex: number  // which account is currently active (0-based)
}

interface RotationState {
  lastUsedIndex: number  // persisted across sessions (-1 = none)
}
```

### `storage.ts` — File I/O

Uses `process.env.HOME` to locate the config directory (`~/.config/opencode/`).

**Atomic write pattern:**

```ts
function atomicWrite(path: string, data: string) {
  const tmp = path + ".tmp." + process.pid  // same filesystem = no EXDEV
  writeFileSync(tmp, data, "utf-8")
  chmodSync(tmp, 0o600)
  renameSync(tmp, path)  // atomic on POSIX
}
```

**Corrupt file recovery:** If JSON parsing fails, the corrupt file is copied to `path.bak.<timestamp>` and a fresh default is returned. Previous state is never silently lost.

### `rotate.ts` — Selection Logic

```ts
function selectAccount(
  accounts: GoAccount[],
  lastIndex: number        // -1 means "start from 0"
): { account: GoAccount; index: number }
```

The selection loop:

```
for i = 1 to total:
    candidate = (lastIndex + i) % total
    if accounts[candidate].enabled:
        return accounts[candidate]
throw NoEnabledAccounts
```

This guarantees every enabled account gets a turn before any account repeats.

### `fetch.ts` — HTTP Interceptor

Wraps `globalThis.fetch` (or a provided `baseFetch`) to:

1. **Strip** any `Authorization` header from the incoming request.
2. **Set** `Authorization: Bearer <activeAccountKey>`.
3. **Forward** the request.
4. **On 429:** Mark the current account as exhausted, select the next enabled account, inject its key, and retry. If all accounts are exhausted, return a synthetic 429 response.
5. **On non-429:** Pass the response through unchanged.

The interceptor accepts a `baseFetch` parameter for testability:

```ts
const { fetch } = createRotatingFetch(accounts, lastIndex, mockFetch)
```

### `index.ts` — Plugin Entry

The plugin is an async function matching OpenCode's `Plugin` type:

```ts
const plugin: Plugin = async ({ client }) => {
  return {
    auth: {
      provider: "opencode",
      loader: async (getAuth) => { /* ... */ },
      methods: [ /* 3 auth methods */ ],
    },
  }
}
```

The `loader` and `authorize` functions both use `authClient.auth.set()` to sync the current key to OpenCode's auth store. This is essential because OpenCode's provider code (in `provider.ts:1076`) checks the auth store before calling the loader.

Auth methods that don't perform real OAuth (Manage Accounts, View Account Status) return a dummy `AuthOauthResult`:

```ts
return {
  url: "",
  instructions: "",
  method: "auto" as const,
  callback: () => Promise.resolve({ type: "failed" as const }),
}
```

This satisfies the plugin interface without triggering a browser-based OAuth flow.

---

## Storage Format

### `~/.config/opencode/opencode-go-accounts.json`

```json
{
  "version": 1,
  "accounts": [
    {
      "apiKey": "go_xxxxxxxxxxxx",
      "label": "Work Account",
      "addedAt": 1745800000000,
      "enabled": true
    },
    {
      "apiKey": "go_yyyyyyyyyyyy",
      "label": "Personal",
      "addedAt": 1745800100000,
      "enabled": true
    }
  ],
  "rotationIndex": 0
}
```

### `~/.config/opencode/opencode-go-rotation.json`

```json
{
  "lastUsedIndex": 0
}
```

Both files are created with `0o600` permissions (readable only by the owner) since they contain sensitive API keys.

---

## Plugin System Integration

OpenCode loads plugins via the `@opencode-ai/plugin` package. The plugin exports a default function:

```ts
export default plugin
// type: (input: PluginInput) => Promise<Hooks>
```

The `PluginInput` provides:
- `client` — OpenCode's internal client (accessed as `any` for `auth.set()` / `auth.get()`)
- `project`, `directory`, `worktree`, `serverUrl`, `experimental_workspace`, `$` — standard context

The returned `Hooks.auth` object has:
- `provider: "opencode"` — must match the target provider ID
- `loader(getAuth) -> { apiKey, fetch }` — called at session start
- `methods: AuthMethod[]` — available to the user via command palette

The auth methods use two types:
- `type: "api"` — for credential-based auth (Add Go Account)
- `type: "oauth"` — for browser-flow auth (Manage Accounts, View Account Status — hijacked for CLI use)

---

## Security Considerations

- **API keys are stored in plaintext** on disk (`~/.config/opencode/`). Only the owner can read them (`0o600`).
- **Keys are held in memory** for the duration of the session.
- **No network calls** are made by the plugin itself — it only intercepts OpenCode's existing API calls.
- **No external dependencies** other than `@opencode-ai/plugin` for type definitions.
- The dummy OAuth callback (`() => Promise.resolve({ type: "failed" })`) is never called by OpenCode for these methods — it's a type system requirement.
