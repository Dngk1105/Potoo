import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { withRouteAuth } from "./route-auth";

const request = (method = "GET", origin?: string) =>
  new NextRequest("https://example.test/api/test", {
    method,
    headers: { cookie: "session=old", ...(origin ? { origin } : {}) },
  });

describe("withRouteAuth", () => {
  const getUser = vi.fn();
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-test");
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.createServerClient.mockReset().mockReturnValue({ auth: { getUser } });
    mocks.createClient.mockReset().mockReturnValue({ admin: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("verifies the user before calling the handler and lazily creates an isolated admin client", async () => {
    const response = await withRouteAuth(request("POST", "https://example.test"), async (ctx) => {
      expect(getUser).toHaveBeenCalledOnce();
      expect(ctx.user.id).toBe("user-1");
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(ctx.createAdminClient()).toEqual({ admin: true });
      return Response.json({ ok: true });
    });
    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledWith("https://supabase.test", "secret-test", {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([undefined, "null", "https://evil.test", "https://example.test.evil.test"])(
    "rejects unsafe requests with origin %s before authentication",
    async (origin) => {
      const handler = vi.fn();
      const response = await withRouteAuth(request("POST", origin), handler);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: { code: "FORBIDDEN", message: "Forbidden" } });
      expect(getUser).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("verifies explicit bearer without Origin or cookie fallback and uses it for RLS", async () => {
    mocks.createClient.mockReturnValue({ auth: { getUser } });
    const req = new NextRequest("https://example.test/api/test", {
      method: "POST",
      headers: { authorization: "Bearer test-token", cookie: "session=old" },
    });
    const response = await withRouteAuth(req, async ({ user }) => Response.json({ id: user.id }));
    expect(response.status).toBe(200);
    expect(getUser).toHaveBeenCalledWith("test-token");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.createClient).toHaveBeenCalledWith("https://supabase.test", "public-test", {
      global: { headers: { Authorization: "Bearer test-token" } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  });

  it.each(["Basic abc", "Bearer", "Bearer a,b", "Bearer a b"])(
    "rejects malformed authorization %s even when cookies are present",
    async (authorization) => {
      const req = new NextRequest("https://example.test/api/test", {
        headers: { authorization, cookie: "session=old" },
      });
      const response = await withRouteAuth(req, vi.fn());
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHENTICATED", message: "Unauthorized" },
      });
      expect(mocks.createServerClient).not.toHaveBeenCalled();
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("does not fall back to cookies when a bearer token is rejected", async () => {
    mocks.createClient.mockReturnValue({ auth: { getUser } });
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const req = new NextRequest("https://example.test/api/test", {
      method: "POST",
      headers: { authorization: "Bearer invalid", cookie: "session=old" },
    });
    const handler = vi.fn();
    const response = await withRouteAuth(req, handler);
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("applies all refreshed cookies and SDK headers on a handler error", async () => {
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      expect(options.cookies.getAll()).toEqual([{ name: "session", value: "old" }]);
      getUser.mockImplementation(async () => {
        options.cookies.setAll(
          [{ name: "session", value: "new", options: { path: "/", httpOnly: true } }],
          { Pragma: "no-cache", Expires: "0" },
        );
        options.cookies.setAll([{ name: "extra", value: "value", options: { path: "/" } }], {});
        expect(options.cookies.getAll()).toContainEqual({ name: "session", value: "new" });
        return { data: { user: { id: "user-1" } }, error: null };
      });
      return { auth: { getUser } };
    });
    const response = await withRouteAuth(request(), async () => {
      throw new Error("sensitive detail");
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive detail");
    expect(response.cookies.get("session")?.value).toBe("new");
    expect(response.cookies.get("extra")?.value).toBe("value");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
  });

  it.each([
    [401, 401],
    [503, 503],
  ])("rejects auth error %i safely", async (status, expected) => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status, message: "sensitive" } });
    const handler = vi.fn();
    const response = await withRouteAuth(request(), handler);
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({
      error: {
        code: expected === 401 ? "UNAUTHENTICATED" : "SERVICE_UNAVAILABLE",
        message: expected === 401 ? "Unauthorized" : "Authentication unavailable",
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("handles missing configuration and thrown errors without leaking details", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await withRouteAuth(request(), vi.fn())).status).toBe(500);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    getUser.mockRejectedValue(new Error("sensitive"));
    const response = await withRouteAuth(request(), vi.fn());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive");
  });
});
