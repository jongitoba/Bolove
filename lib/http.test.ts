import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http";

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns immediately on success", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.test");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry a 4xx client error", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.test");

    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a transient 5xx and succeeds once the server recovers", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return calls < 3 ? new Response("boom", { status: 503 }) : new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.test", undefined, 2);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up and returns the last failing response after maxRetries", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.test", undefined, 2);

    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial attempt + 2 retries
  });
});
