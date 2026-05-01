import type { Plugin } from "@opencode-ai/plugin"
import { loadAccounts, saveAccounts, loadRotationState, saveRotationState } from "./storage"
import { selectAccount, hasAccounts } from "./rotate"
import { createRotatingFetch } from "./fetch"
import { log } from "./logger"

const plugin: Plugin = async ({ client }) => {
  const authClient = client as any

  return {
    auth: {
      provider: "opencode",
      async loader(getAuth) {
        const data = loadAccounts()
        const state = loadRotationState()

        if (!hasAccounts(data.accounts)) {
          log("warn", "loader skipped", { reason: "no enabled accounts" })
          return {}
        }

        const { account, index } = selectAccount(data.accounts, state.lastUsedIndex)
        data.rotationIndex = index
        saveAccounts(data)
        saveRotationState({ lastUsedIndex: index })

        await authClient.auth.set({
          path: { id: "opencode" },
          body: { type: "api", key: account.apiKey },
        })

        const { fetch } = createRotatingFetch(data.accounts, state.lastUsedIndex)

        log("info", "loader active", {
          account: account.label || `account-${index}`,
          index,
          total: data.accounts.length,
        })

        return {
          apiKey: "",
          async fetch(input: RequestInfo | URL, init?: RequestInit) {
            return fetch(input, init)
          },
        }
      },
      methods: [
        {
          type: "api",
          label: "Add Go Account",
          prompts: [
            { type: "text", key: "apiKey", message: "Go API key from opencode.ai/auth" },
            { type: "text", key: "label", message: "Label for this account (optional)" },
          ],
          async authorize(inputs) {
            const key = inputs?.apiKey?.trim()
            if (!key) return { type: "failed" }

            const data = loadAccounts()
            const label = inputs?.label?.trim() || undefined
            data.accounts.push({
              apiKey: key,
              label,
              addedAt: Date.now(),
              enabled: true,
            })

            if (data.accounts.length === 1) data.rotationIndex = 0
            saveAccounts(data)

            await authClient.auth.set({
              path: { id: "opencode" },
              body: { type: "api", key },
            })

            log("info", "account added via auth login", {
              label: label || `account-${data.accounts.length}`,
              count: data.accounts.length,
            })

            return { type: "success", key }
          },
        },
      ],
    },
  }
}

export default plugin
