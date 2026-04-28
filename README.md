# opencode-go-multi-auth

> **Multi-account API key rotation for [OpenCode](https://opencode.ai) Go subscription.**

Run multiple OpenCode Go accounts side-by-side. The plugin picks one account per OpenCode process (not per subagent/task) and sticks with it. When you hit Go's rate limit (HTTP 429), it automatically fails over to the next account.

![License](https://img.shields.io/github/license/masrurimz/opencode-go-multi-auth)
![GitHub last commit](https://img.shields.io/github/last-commit/masrurimz/opencode-go-multi-auth)

---

## Features

- **Multi-account rotation** — Spread your usage across several Go API keys.
- **Per-process account stickiness** — One account per OpenCode process. Quit and reopen to rotate. New subagents and tasks reuse the same account.
- **Automatic 429 failover** — When the active account is rate-limited, the plugin transparently retries with the next account.
- **CLI account management** — Add, list, remove, and inspect accounts from the terminal.
- **Persistent state** — Accounts and rotation position survive restarts.
- **No modifications to OpenCode** — Installs as a plugin, zero risk to your existing setup.

---

## Installation

```sh
opencode plugin github:masrurimz/opencode-go-multi-auth --global
```

This installs the plugin globally so every OpenCode session uses it.

**Prerequisites:**
- [OpenCode](https://opencode.ai) 1.x (Go subscription)
- [Bun](https://bun.sh) 1.x (for local development)
- One or more Go API keys from [opencode.ai/auth](https://opencode.ai/auth)

---

## Quick Start

### 1. Get your Go API keys

Open [opencode.ai/auth](https://opencode.ai/auth) in your browser and generate one or more Go subscription API keys. Copy each key to your clipboard.

### 2. Add an account to the plugin

In OpenCode, open the auth settings and run the **Add Go Account** method:

```
OpenCode Settings → Auth → Add Go Account
```

Paste your Go API key when prompted. Optionally give it a label (e.g. "Work", "Personal", "Account 2").

Repeat for each Go subscription you own.

### 3. Start using OpenCode

That's it. The plugin automatically picks an account on every session start and signs all requests with its API key. OpenCode will show "opencode" as the active auth provider.

---

## Commands

| Method | Label | Purpose |
|---|---|---|
| `api` | **Add Go Account** | Add a new Go API key to the rotation pool |
| `oauth` | **Manage Accounts** | List all accounts and remove unwanted ones |
| `oauth` | **View Account Status** | Show account list, status, and rotation position |

Access these from OpenCode's auth settings panel.

---

## How Rotation Works

1. **OpenCode process starts** — The plugin loads all configured accounts and picks the next one in round-robin order (tracked in `~/.config/opencode/opencode-go-rotation.json`).
2. **Per-process stickiness** — The same account is used for every request during the process lifetime. All subagents, tasks, and conversations share the same account. This preserves token caches.
3. **On 429 (rate limit)** — The plugin marks the current account as exhausted, switches to the next enabled account, and retries the request. If all accounts are exhausted, it returns a 429 response.
4. **Next process** — Quit and reopen OpenCode. The rotation index advances, so the new process gets a different account.

See [docs/quota-rotation.md](./docs/quota-rotation.md) for details.

---

## Storage

Accounts and rotation state live in `~/.config/opencode/`:

| File | Purpose |
|---|---|
| `opencode-go-accounts.json` | Stored API keys, labels, enabled/disabled state |
| `opencode-go-rotation.json` | Last used account index (for round-robin) |

Both files use `0o600` permissions. The accounts file is written atomically (tmp + rename). If the file becomes corrupt, a `.bak.<timestamp>` backup is created automatically.

---

## Development

```sh
git clone https://github.com/masrurimz/opencode-go-multi-auth
cd opencode-go-multi-auth
bun install
bun test       # 23 tests across 4 modules
bun run build  # bundles to dist/index.mjs
bun run typecheck  # tsc --noEmit
```

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│   index.ts  │────▶│   storage.ts │────▶│  Disk    │
│  (Plugin)   │     │  (Accounts)  │     │ (JSON)   │
└──────┬──────┘     └──────────────┘     └──────────┘
       │
       ├──▶ rotate.ts     ── round-robin selection
       ├──▶ fetch.ts      ── auth header injection + 429 failover
       └──▶ types.ts      ── shared type definitions
```

See [docs/architecture.md](./docs/architecture.md) for the full breakdown.

---

## License

MIT
