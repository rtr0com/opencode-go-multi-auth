# 429 Handling & Rotation

How the plugin distributes requests across multiple Go accounts and handles rate limits from Go's API. Note: there is **no proactive quota detection**. The plugin only reacts to HTTP 429 (Too Many Requests) responses.

---

## The Problem

OpenCode's Go subscription has a **rate limit** (requests per minute / tokens per minute). With a single account, hitting this limit means waiting. With multiple accounts, you can distribute the load and keep working.

However, each account has its own **token cache** — switching accounts mid-process invalidates cached tokens and causes extra round-trips. The plugin balances these concerns with **per-process stickiness**.

---

## Rotation Strategy: Round-Robin with Per-Process Stickiness

### How It Works

```
┌─────────────────────────────────────────────────────┐
│                    OpenCode Process N               │
│                                                      │
│  Start ──▶ pick Account[lastIndex + 1]               │
│              │                                        │
│              ▼                                        │
│           ┌──────────┐                               │
│           │ Account 2│◀──── stick for entire process │
│           └──────────┘                               │
│                │                                      │
│  Request 1 ────┤ (200) ✓                              │
│  Request 2 ────┤ (200) ✓                              │
│  Request 3 ────┤ (429) ✗ ──▶ failover to Account 3  │
│  Request 4 ────┤ (200) ✓                              │
│                                                      │
│  End ──▶ persist lastUsedIndex = 2                   │
└─────────────────────────────────────────────────────┘
```

1. **Process start**: The plugin reads `lastUsedIndex` from disk and calls `selectAccount(accounts, lastIndex)`.
2. **Pick next**: `selectAccount` iterates through accounts starting from `lastIndex + 1`, skipping disabled accounts, and picks the first enabled one.
3. **Stick**: The selected account is used for every request in the process (all subagents, tasks, conversations). This preserves token caches and avoids auth overhead.
4. **Next process**: `lastUsedIndex` is updated and persisted to disk — the next OpenCode restart picks the next account in sequence.

### Why Per-Process Stickiness?

OpenCode caches authentication tokens per account. Switching accounts mid-process means:
- Token cache is invalidated
- New tokens must be fetched
- Additional latency on the first request after switching

By sticking with one account per OpenCode process, there is zero auth overhead for the vast majority of work. Only 429 failures trigger a mid-process switch.

---

## 429 (Rate Limit) Handling

When the Go API returns HTTP 429, the plugin's `fetch.ts` interceptor kicks in:

### The Failover Flow

```
Request ──▶ Inject auth header → Send → 429?
                                            │
                                     Yes    │    No
                                     │      ▼
                                     │   Return response ✓
                                     ▼
                          Mark account as exhausted
                                     │
                                     ▼
                     Select next enabled account
                                     │
                                     ▼
                      Is next account exhausted too?
                                     │
                              Yes    │    No
                              │      ▼
                              ▼   Inject new auth header
                     Return 429      │
                     "all Go         ▼
                      accounts     Retry request
                      exhausted"
```

### Key Behaviors

- **Only 429 triggers rotation.** HTTP 4xx/5xx errors pass through normally.
- **Exhaustion is per-process.** The `exhausted: Set<number>` is in-memory only — restarting OpenCode resets it and gives all accounts a fresh chance.
- **All-exhausted fallback.** If every account has been tried and all returned 429, the plugin returns a 429 response with body `"all Go accounts exhausted"` and no further retries happen.

### Example

```
3 accounts: A, B, C

OpenCode process uses A. A hits 429.
  → Failover to B. B also hits 429.
    → Failover to C. C succeeds.
      → Process continues on C.

Next OpenCode restart: picks B (round-robin from lastUsedIndex).
```

---

## Exhaustion Details

### Per-Process Exhaustion

The `RotatingFetchState` tracks exhausted accounts in a `Set<number>`:

```ts
interface RotatingFetchState {
  activeIndex: number | null
  exhausted: Set<number>  // indices of 429'd accounts this process (in-memory only)
}
```

This set is **not persisted to disk**. When OpenCode restarts, all accounts start fresh. This avoids permanently marking accounts as exhausted and lets rate limit windows expire naturally.

### Exhaustion Guard

The loop won't retry an account that's already in the exhausted set. The `while(true)` loop in `fetch.ts` breaks when the next candidate is already exhausted, returning a 429 immediately instead of infinite-looping.

---

## Rotation State Persistence

The rotation index is stored in `~/.config/opencode/opencode-go-rotation.json`:

```json
{ "lastUsedIndex": 1 }
```

This single field tells the plugin which account was used last. On the next OpenCode restart, `selectAccount` starts from `lastUsedIndex` and picks the next one:

```
lastUsedIndex = -1  → first OpenCode run → pick account 0
lastUsedIndex =  0  → next OpenCode run  → pick account 1
lastUsedIndex =  1  → next OpenCode run  → pick account 2
lastUsedIndex =  2  → next OpenCode run  → pick account 0 (wrap)
```

### What Happens If You Delete an Account

If you remove an account from the middle of the list, the `rotationIndex` in `accountsFile` is adjusted:

```ts
if (data.rotationIndex >= data.accounts.length) {
  data.rotationIndex = Math.max(0, data.accounts.length - 1)
}
```

The `lastUsedIndex` in the rotation state file may point beyond the new array bounds — `selectAccount` handles this gracefully by wrapping.

---

## Important: No Proactive Quota Detection

The plugin does **not** query any API or dashboard for remaining quota. It has no knowledge of your Go subscription's usage limits. It only reacts to HTTP 429 responses:

| What it does | What it does NOT do |
|---|---|
| React to HTTP 429 (rate limited) | Check remaining quota proactively |
| Fail over to the next account | Expose quota usage in the UI |
| Retry the request on a fresh account | Report how many tokens you've used |

To check your actual Go quota, visit [opencode.ai/auth](https://opencode.ai/auth) in your browser.

If you see frequent 429s across *all* your accounts, you've likely exhausted your total Go subscription quota and need to wait for the rate limit window to reset.
---

## Best Practices

| Scenario | Recommendation |
|---|---|
| Light usage (1-2 processes/day) | 2 accounts are enough |
| Moderate usage (frequent coding) | 3-4 accounts |
| Heavy usage (CI/CD, batch processing) | 5+ accounts |
| Seeing frequent 429s | Add more accounts |
| All accounts exhausted on restart | Wait a few minutes (rate limits reset) |
