#!/usr/bin/env bun
import { Command } from "commander"
import { loadAccounts, saveAccounts, loadRotationState, saveRotationState } from "./storage"
import { hasAccounts } from "./rotate"
import { log } from "./logger"

const program = new Command()

program.name("go-multi-auth").description("Manage OpenCode Go multi-account auth").version("0.1.0")

program
  .command("list")
  .description("Show all configured Go accounts")
  .action(() => {
    const data = loadAccounts()
    if (data.accounts.length === 0) {
      console.log("No Go accounts configured.")
      return
    }
    for (let i = 0; i < data.accounts.length; i++) {
      const a = data.accounts[i]
      const label = a.label || `Account ${i + 1}`
      const status = a.enabled ? "enabled" : "disabled"
      const mark = i === data.rotationIndex ? " ← current" : ""
      console.log(`  ${i + 1}. ${label} [${status}]${mark}`)
    }
    log("info", "list", { count: data.accounts.length })
  })

program
  .command("add")
  .description("Add a new Go account")
  .option("-k, --key <key>", "Go API key")
  .option("-l, --label <label>", "Account label")
  .action((opts) => {
    if (!opts.key) {
      console.error("Error: --key is required")
      process.exit(1)
    }
    const data = loadAccounts()
    data.accounts.push({
      apiKey: opts.key.trim(),
      label: opts.label?.trim() || undefined,
      addedAt: Date.now(),
      enabled: true,
    })
    if (data.accounts.length === 1) data.rotationIndex = 0
    saveAccounts(data)
    const label = opts.label?.trim() || `Account ${data.accounts.length}`
    console.log(`Added: ${label}`)
    log("info", "add", { label, count: data.accounts.length })
  })

program
  .command("remove")
  .description("Remove an account by number (1-based)")
  .argument("<number>", "Account number to remove")
  .action((numStr) => {
    const num = Number.parseInt(numStr, 10) - 1
    const data = loadAccounts()
    if (Number.isNaN(num) || num < 0 || num >= data.accounts.length) {
      console.error(`Error: invalid account number "${numStr}". Choose 1-${data.accounts.length}`)
      process.exit(1)
    }
    const removed = data.accounts.splice(num, 1)[0]
    if (data.rotationIndex >= data.accounts.length) {
      data.rotationIndex = Math.max(0, data.accounts.length - 1)
    }
    saveAccounts(data)
    const label = removed.label || `Account ${num + 1}`
    console.log(`Removed: ${label}`)
    log("info", "remove", { label })
  })

program
  .command("status")
  .description("Show rotation state and current account")
  .action(() => {
    const data = loadAccounts()
    const state = loadRotationState()
    if (!hasAccounts(data.accounts)) {
      console.log("No enabled accounts. Plugin inactive.")
      return
    }
    console.log(`Accounts: ${data.accounts.length}`)
    console.log(`Rotation: ${data.rotationIndex + 1} of ${data.accounts.length}`)
    console.log(`Last used index: ${state.lastUsedIndex}`)
    log("info", "status", { count: data.accounts.length, rotationIndex: data.rotationIndex })
  })

program.parse()
