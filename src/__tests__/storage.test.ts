import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { loadAccounts, saveAccounts, loadRotationState, saveRotationState } from "../storage"

// storage.ts calls homedir() dynamically, so overriding HOME before each test works
const origHome = process.env.HOME
let tmpHome: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "go-storage-test-"))
  process.env.HOME = tmpHome
})

afterEach(() => {
  process.env.HOME = origHome
  try { rmSync(tmpHome, { recursive: true, force: true }) } catch {}
})

describe("storage", () => {
  it("returns default when file does not exist", () => {
    const result = loadAccounts()
    expect(result).toEqual({ version: 1, accounts: [], rotationIndex: 0 })
  })

  it("round-trips save and load for accounts", () => {
    const data = {
      version: 1 as const,
      accounts: [{ apiKey: "sk-test", addedAt: 1000, enabled: true }],
      rotationIndex: 0,
    }
    saveAccounts(data)
    const loaded = loadAccounts()
    expect(loaded).toEqual(data)
  })

  it("round-trips save and load for rotation state", () => {
    saveRotationState({ lastUsedIndex: 3 })
    const loaded = loadRotationState()
    expect(loaded).toEqual({ lastUsedIndex: 3 })
  })

  it("returns default rotation state when file does not exist", () => {
    const result = loadRotationState()
    expect(result).toEqual({ lastUsedIndex: -1 })
  })

  it("handles corrupt accounts file with backup", () => {
    const d = join(tmpHome, ".config", "opencode")
    mkdirSync(d, { recursive: true })
    const filePath = join(d, "opencode-go-accounts.json")
    writeFileSync(filePath, "not-json-at-all")

    const result = loadAccounts()
    expect(result).toEqual({ version: 1, accounts: [], rotationIndex: 0 })

    const files = readdirSync(d)
    expect(files.some((f) => f.startsWith("opencode-go-accounts.json.bak."))).toBe(true)
  })

  it("handles corrupt rotation state file gracefully", () => {
    const d = join(tmpHome, ".config", "opencode")
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, "opencode-go-rotation.json"), "{bad json")

    const result = loadRotationState()
    expect(result).toEqual({ lastUsedIndex: -1 })
  })
})
