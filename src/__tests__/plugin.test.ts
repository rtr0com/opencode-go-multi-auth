import { describe, it, expect } from "bun:test"
import type { Plugin } from "@opencode-ai/plugin"

describe("plugin", () => {
  it("exports a default function matching Plugin type", async () => {
    const mod = await import("../index")
    expect(typeof mod.default).toBe("function")

    const result = mod.default({
      client: {} as any,
      project: {} as any,
      directory: "/tmp",
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      experimental_workspace: {} as any,
      $: null as any,
    })

    const hooks = await result
    expect(hooks).toBeDefined()
    expect(hooks.auth).toBeDefined()
    expect(hooks.auth!.provider).toBe("opencode")
    expect(typeof hooks.auth!.loader).toBe("function")
    expect(Array.isArray(hooks.auth!.methods)).toBe(true)
  })

  it("has at least 3 auth methods", async () => {
    const mod = await import("../index")
    const result = mod.default({
      client: {} as any,
      project: {} as any,
      directory: "/tmp",
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      experimental_workspace: {} as any,
      $: null as any,
    })
    const hooks = await result
    expect(hooks.auth!.methods.length).toBeGreaterThanOrEqual(3)
  })

  it("has Add Go Account method", async () => {
    const mod = await import("../index")
    const result = mod.default({
      client: {} as any,
      project: {} as any,
      directory: "/tmp",
      worktree: "/tmp",
      serverUrl: new URL("http://localhost"),
      experimental_workspace: {} as any,
      $: null as any,
    })
    const hooks = await result
    const method = hooks.auth!.methods.find((m) => m.label === "Add Go Account")
    expect(method).toBeDefined()
  })
})
