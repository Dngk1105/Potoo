import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { exchange, create, verifyOtp } = vi.hoisted(() => ({
  exchange: vi.fn(),
  create: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("@/core/adapters", () => ({
  createSupabaseServerAuthClient: create,
  exchangeSupabaseOAuthCode: exchange,
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
  create.mockReturnValue({ auth: { verifyOtp } });
  exchange.mockResolvedValue(undefined);
  verifyOtp.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function request(query: string) {
  return new NextRequest(`https://app.example/auth/callback${query}`);
}

describe("auth callback", () => {
  test.each(["https://evil.example", "//evil.example/path", "/\\evil.example", "/\t/evil.example"])(
    "rejects external destination %s",
    async (next) => {
      const response = await GET(request(`?code=ok&next=${encodeURIComponent(next)}`));
      expect(response.headers.get("location")).toBe("https://app.example/");
    },
  );
  test("persists SDK cookies and cache headers on a safe redirect", async () => {
    create.mockImplementation((_url, _key, cookies) => {
      cookies.setAll([{ name: "session", value: "new", options: { path: "/", httpOnly: true } }], {
        "Cache-Control": "private, no-store",
      });
      return { auth: {} };
    });
    const response = await GET(request("?code=ok&next=%2Froom%3Fx%3D1"));
    expect(response.headers.get("location")).toBe("https://app.example/room?x=1");
    expect(response.cookies.get("session")?.value).toBe("new");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  test("verifies an email token hash without exposing it in the redirect", async () => {
    const response = await GET(request("?token_hash=one-time-secret&type=signup&next=%2Froom"));
    expect(response.headers.get("location")).toBe("https://app.example/room");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time-secret", type: "signup" });
  });
  test("rejects unsupported, ambiguous, and invalid email tokens", async () => {
    for (const query of ["?token_hash=x&type=unknown", "?token_hash=x&type=signup&code=y"]) {
      const response = await GET(request(query));
      expect(response.headers.get("location")).toBe("https://app.example/?auth=error");
    }
    verifyOtp.mockResolvedValueOnce({ error: new Error("private") });
    const response = await GET(request("?token_hash=x&type=signup"));
    expect(response.headers.get("location")).toBe("https://app.example/?auth=error");
  });
  test("fails closed without exposing provider errors or codes", async () => {
    exchange.mockRejectedValue(new Error("sensitive"));
    for (const query of ["", "?error=denied&code=ok", "?code=bad"]) {
      const response = await GET(request(query));
      expect(response.headers.get("location")).toBe("https://app.example/?auth=error");
    }
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});
