import { describe, it, expect } from "bun:test"
import { createRotatingFetch } from "../fetch"
import type { GoAccount } from "../types"

const mk = (apiKey: string): GoAccount => ({ apiKey, addedAt: Date.now(), enabled: true })

function mockRes(status: number, body = "ok") {
  return new Response(body, { status })
}

describe("createRotatingFetch", () => {
  it("injects auth header for the selected account", async () => {
    const accounts = [mk("key1"), mk("key2")]
    let capturedHeaders: Headers | undefined
    const baseFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers)
      return mockRes(200)
    }

    const { fetch } = createRotatingFetch(accounts, -1, baseFetch)
    await fetch("https://api.example.com", { headers: { "content-type": "application/json" } })

    expect(capturedHeaders!.get("Authorization")).toBe("Bearer key1")
    expect(capturedHeaders!.get("content-type")).toBe("application/json")
  })

  it("strips existing authorization headers", async () => {
    const accounts = [mk("key1")]
    let capturedHeaders: Headers | undefined
    const baseFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers)
      return mockRes(200)
    }

    const { fetch } = createRotatingFetch(accounts, -1, baseFetch)
    await fetch("https://api.example.com", {
      headers: { Authorization: "Bearer old-key" },
    })

    expect(capturedHeaders!.get("Authorization")).toBe("Bearer key1")
  })

  it("rotates to next account on 429 and retries", async () => {
    const accounts = [mk("key1"), mk("key2")]
    let callCount = 0
    const baseFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount++
      const h = new Headers(init?.headers)
      if (callCount === 1) {
        expect(h.get("Authorization")).toBe("Bearer key1")
        return mockRes(429)
      }
      expect(h.get("Authorization")).toBe("Bearer key2")
      return mockRes(200)
    }

    const { fetch } = createRotatingFetch(accounts, -1, baseFetch)
    const res = await fetch("https://api.example.com")
    expect(callCount).toBe(2)
    expect(res.status).toBe(200)
  })

  it("returns last 429 when all accounts exhausted", async () => {
    const accounts = [mk("key1"), mk("key2")]
    const baseFetch = async () => mockRes(429)

    const { fetch } = createRotatingFetch(accounts, -1, baseFetch)
    const res = await fetch("https://api.example.com")
    expect(res.status).toBe(429)
    const body = await res.text()
    expect(body).toContain("exhausted")
  })

  it("does not rotate on non-429 errors", async () => {
    const accounts = [mk("key1"), mk("key2")]
    let callCount = 0
    const baseFetch = async () => {
      callCount++
      return mockRes(500)
    }
    const { fetch } = createRotatingFetch(accounts, -1, baseFetch)
    const res = await fetch("https://api.example.com")
    expect(callCount).toBe(1)
    expect(res.status).toBe(500)
  })

  it("uses the same account for consecutive calls (session stickiness)", async () => {
    const accounts = [mk("key1"), mk("key2")]
    const authHeaders: string[] = []
    const baseFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers)
      authHeaders.push(h.get("Authorization")!)
      return mockRes(200)
    }

    const { fetch } = createRotatingFetch(accounts, -1, baseFetch)
    await fetch("https://api.example.com")
    await fetch("https://api.example.com")
    await fetch("https://api.example.com")
    expect(authHeaders).toEqual(["Bearer key1", "Bearer key1", "Bearer key1"])
  })
})
