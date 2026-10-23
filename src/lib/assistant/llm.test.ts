import { describe, expect, it } from "vitest";
import { buildChatRequest, loadSettings, saveSettings, parseSSELine, streamChat, defaultSettings, PROVIDER_PRESETS, ASSISTANT_STORAGE_KEY } from "./llm";
import { buildFinanceSummary } from "./context";
import { emptyData } from "../storage";

const summary = buildFinanceSummary(emptyData(), "2026-10-23");

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  } as Storage;
}

describe("buildChatRequest", () => {
  it("puts the summary in the system message and keeps the last 12 turns", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" as const : "user" as const, content: `m${i}` }));
    const body = buildChatRequest(summary, history, "m1");
    expect(body.stream).toBe(true);
    expect(body.model).toBe("m1");
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("FINANCE SUMMARY");
    expect(body.messages).toHaveLength(13);
    expect(body.messages[1].content).toBe("m8");
  });

  it("never includes the api key in the body", () => {
    const body = JSON.stringify(buildChatRequest(summary, [{ role: "user", content: "hi" }], "x"));
    expect(body).not.toContain("gsk_secret");
  });
});

describe("parseSSELine", () => {
  it("extracts content deltas", () => {
    expect(parseSSELine('data: {"choices":[{"delta":{"content":"Hel"}}]}')).toBe("Hel");
  });
  it("returns null at [DONE] and empty string for other lines", () => {
    expect(parseSSELine("data: [DONE]")).toBeNull();
    expect(parseSSELine(": keep-alive")).toBe("");
    expect(parseSSELine("data: not json")).toBe("");
  });
});

describe("streamChat", () => {
  it("streams deltas from a fake SSE response and sends the bearer key", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Your "}}]}\n\ndata: {"choices":[{"delta":{"content":"books"}}]}\n',
      "data: [DONE]\n",
    ];
    let seen: { url: string; auth: string | null } = { url: "", auth: null };
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, auth: (init.headers as Record<string, string>).Authorization };
      const stream = new ReadableStream({
        start(c) {
          for (const ch of chunks) c.enqueue(encoder.encode(ch));
          c.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;

    const out: string[] = [];
    await streamChat({
      settings: { ...defaultSettings(), apiKey: "gsk_test" },
      summary,
      history: [{ role: "user", content: "hi" }],
      onDelta: (t) => out.push(t),
      fetchImpl: fakeFetch,
    });
    expect(out.join("")).toBe("Your books");
    expect(seen.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(seen.auth).toBe("Bearer gsk_test");
  });

  it("refuses to call without a key", async () => {
    await expect(streamChat({ settings: defaultSettings(), summary, history: [], onDelta: () => {} })).rejects.toThrow(/API key/);
  });

  it("surfaces HTTP errors readably", async () => {
    const fakeFetch = (async () => new Response("bad key", { status: 401 })) as typeof fetch;
    await expect(
      streamChat({ settings: { ...defaultSettings(), apiKey: "k" }, summary, history: [], onDelta: () => {}, fetchImpl: fakeFetch }),
    ).rejects.toThrow(/401/);
  });
});

describe("settings storage", () => {
  it("round-trips provider settings and falls back to Groq defaults", () => {
    const st = memStorage();
    expect(loadSettings(st).providerId).toBe("groq");
    saveSettings({ providerId: "custom", baseUrl: "https://example.test/v1", model: "m", apiKey: "k" }, st);
    expect(loadSettings(st)).toEqual({ providerId: "custom", baseUrl: "https://example.test/v1", model: "m", apiKey: "k" });
    expect(st.getItem(ASSISTANT_STORAGE_KEY)).toContain("example.test");
  });
  it("ships a groq preset with an openai-compatible base url", () => {
    expect(PROVIDER_PRESETS.find((p) => p.id === "groq")?.baseUrl).toBe("https://api.groq.com/openai/v1");
  });
});
