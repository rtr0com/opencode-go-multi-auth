import { mkdtempSync, writeFileSync, renameSync, chmodSync, existsSync, readFileSync, copyFileSync } from "fs"
import { tmpdir, homedir } from "os"
import { join } from "path"
import type { AccountsFile, RotationState } from "./types.js"

const DIR = join(homedir(), ".config", "opencode")
const FILE = join(DIR, "opencode-go-accounts.json")
const STATE_FILE = join(DIR, "opencode-go-rotation.json")
const PERMS = 0o600

function newFile(): AccountsFile {
  return { version: 1, accounts: [], rotationIndex: 0 }
}

function newState(): RotationState {
  return { lastUsedIndex: -1 }
}

function atomicWrite(path: string, data: string) {
  const d = mkdtempSync(join(tmpdir(), "go-multi-auth-"))
  const tmp = join(d, "tmp.json")
  writeFileSync(tmp, data, "utf-8")
  chmodSync(tmp, PERMS)
  renameSync(tmp, path)
}

export function loadAccounts(): AccountsFile {
  if (!existsSync(FILE)) return newFile()
  try {
    const raw = readFileSync(FILE, "utf-8")
    return JSON.parse(raw) as AccountsFile
  } catch {
    copyFileSync(FILE, FILE + ".bak." + Date.now())
    return newFile()
  }
}

export function saveAccounts(data: AccountsFile) {
  atomicWrite(FILE, JSON.stringify(data, null, 2) + "\n")
}

export function loadRotationState(): RotationState {
  if (!existsSync(STATE_FILE)) return newState()
  try {
    const raw = readFileSync(STATE_FILE, "utf-8")
    return JSON.parse(raw) as RotationState
  } catch {
    return newState()
  }
}

export function saveRotationState(state: RotationState) {
  atomicWrite(STATE_FILE, JSON.stringify(state) + "\n")
}
