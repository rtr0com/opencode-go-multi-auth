# Account Management

Manage your Go accounts — add, list, remove, and inspect them — from OpenCode's auth settings panel.

---

## Overview

The plugin provides three auth methods accessible from OpenCode's auth settings:

| Method | What it does |
|---|---|
| **Add Go Account** | Add a new Go API key to the pool |
| **Manage Accounts** | List all accounts and remove unwanted ones |
| **View Account Status** | Show account details and current rotation position |

---

## Adding an Account

### Steps

1. Open OpenCode and go to **Settings → Auth**.
2. Find the **Go Multi-Auth** provider and click **Add Go Account**.
3. Enter your Go API key (from [opencode.ai/auth](https://opencode.ai/auth)).
4. Optionally enter a label (e.g., "Work account", "Personal").
5. Confirm — you'll see a success message.

### Prompt Fields

| Field | Required | Description |
|---|---|---|
| `apiKey` | Yes | Go API key starting with `go_` |
| `label` | No | Human-readable name for this account |

### Notes

- Adding an account does **not** switch the current OpenCode process's active account. The new account will be available on the next OpenCode restart.
- The first account ever added primes the auth store (see [authentication.md](./authentication.md) for why this matters).
- Duplicate API keys are not detected — you can add the same key twice (though you probably shouldn't).

---

## Listing Accounts

### View Account Status

1. Go to OpenCode **Settings → Auth → View Account Status**.
2. Click the method.
3. Output appears in the terminal that launched OpenCode:

```
Go Account Status:
  1. Work [enabled] (active)
  2. Personal [enabled]
  3. Old Account [disabled]

Rotation position: 1 of 3
```

### Reading the Output

Each line shows:

- **Number** — Index in the account list (1-based).
- **Label** — The label you gave when adding the account, or "Account N" if no label was set.
- **Status** — `[enabled]` or `[disabled]` (all accounts are enabled when added; disabling is a future feature).
- **(active)** — Indicates which account the current OpenCode process is using.

The footer shows the current rotation position (starting from 1) and the total number of accounts across all sessions.

---

## Removing an Account

### Via OpenCode Auth Settings

1. Go to OpenCode **Settings → Auth → Manage Accounts**.
2. Click the method.
3. The terminal shows the account list:

```
Configured Go accounts:
  1. Work [enabled]
  2. Personal [enabled]

Enter number to remove (or Enter to cancel):
```

4. Type the number of the account to remove and press Enter.
5. The account is removed immediately. Press Enter without typing a number to cancel.

### What Happens When You Remove

- The account is spliced from the in-memory array.
- The updated list is written to `~/.config/opencode/opencode-go-accounts.json`.
- If the removed account was the active rotation index, the index is adjusted:
  - If the rotation index was beyond the new array bounds, it's set to the last available index.
  - If the array is now empty, the rotation index becomes 0.
- **The removed API key cannot be recovered** from the plugin — add it again if needed.

---

## Account State

### Enabled / Disabled

Every account has an `enabled` boolean field. Currently all accounts are added as `enabled: true`. There is no disable/enable action in the UI yet. Disabled accounts are skipped during rotation.

### Active Account

The "active" marker indicates which account the current OpenCode process picked. This is determined at process start by the round-robin logic. You cannot manually set the active account (it's automatic).

### Rotation Index

Tracked in `~/.config/opencode/opencode-go-rotation.json`. This is the index of the last used account. On the next OpenCode restart, the **next** enabled account is selected:

```
OpenCode run 1: Account 1 (rotationIndex = 0)
OpenCode run 2: Account 2 (rotationIndex = 1)
OpenCode run 3: Account 3 (rotationIndex = 2)
OpenCode run 4: Account 1 (rotationIndex = 0) ← wraps around
Session 2: Account 2 (rotationIndex = 1)
Session 3: Account 3 (rotationIndex = 2)
Session 4: Account 1 (rotationIndex = 0) ← wraps around
```

---

## Example Workflows

### Adding Multiple Accounts

```
Settings → Auth → Add Go Account → paste key1 → label "Work"
Settings → Auth → Add Go Account → paste key2 → label "Personal"
Settings → Auth → Add Go Account → paste key3 → label "Backup"
```

### Checking Which Account Is Active

```
Settings → Auth → View Account Status
→ "Rotation position: 2 of 3" (Account 2 is active this process)
```

### Replacing an Old Account

```
Settings → Auth → Manage Accounts
→ "Enter number to remove: 3" (removes old account)
Settings → Auth → Add Go Account
→ paste new key → label "New Backup"
```
