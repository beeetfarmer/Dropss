import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseAPI, settingsAPI } from "./api";

const fetchMock = vi.fn();

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: url as string, init: init as RequestInit, headers: init.headers as Headers };
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "dropss_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("apiFetch", () => {
  it("sends the CSRF token on writes", async () => {
    document.cookie = "dropss_csrf=token%2F1";
    respond(200, { started: true });

    await releaseAPI.refreshAll();

    expect(lastCall().init.method).toBe("POST");
    expect(lastCall().headers.get("X-CSRF-Token")).toBe("token/1");
  });

  it("does not send the CSRF token on reads", async () => {
    document.cookie = "dropss_csrf=token";
    respond(200, { running: false });

    await releaseAPI.getRefreshStatus();

    expect(lastCall().headers.has("X-CSRF-Token")).toBe(false);
  });

  it("includes credentials", async () => {
    respond(200, {});

    await settingsAPI.get();

    expect(lastCall().init.credentials).toBe("include");
  });

  it("surfaces the server's error detail", async () => {
    respond(400, { detail: "Bad value" });

    await expect(settingsAPI.update({})).rejects.toThrow("Bad value");
  });

  it("falls back to the raw body for non-JSON errors", async () => {
    respond(502, "Bad gateway");

    await expect(settingsAPI.get()).rejects.toThrow("Bad gateway");
  });

  it("redirects to login on 401", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { pathname: "/settings", replace });
    respond(401, {});

    await expect(settingsAPI.get()).rejects.toThrow("Authentication required");

    expect(replace).toHaveBeenCalledWith("/login");
  });
});

describe("releaseAPI", () => {
  it("builds the release list query", async () => {
    respond(200, []);

    await releaseAPI.getAll(true, 5, 10, 20);

    expect(lastCall().url).toContain("/releases/?only_new=true&artist_id=5&limit=10&offset=20");
  });
});
