import { NextRequest } from "next/server";
import { afterEach, expect, test, vi } from "vitest";
import { proxy } from "./proxy";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/core/adapters", () => ({ createSupabaseServerAuthClient: create }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

test("refreshes cookies on both downstream request and browser response", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
  const getClaims = vi.fn(async () => {
    adapter.setAll([{ name: "session", value: "fresh", options: { path: "/", httpOnly: true } }], {
      "Cache-Control": "private, no-store",
    });
  });
  let adapter: {
    setAll: (
      cookies: { name: string; value: string; options: { path: string; httpOnly: boolean } }[],
      headers: Record<string, string>,
    ) => void;
  };
  create.mockImplementation((_url, _key, cookies) => {
    adapter = cookies;
    return { auth: { getClaims } };
  });
  const request = new NextRequest("https://app.example/", {
    headers: { cookie: "session=old; other=value" },
  });
  const response = await proxy(request);
  expect(getClaims).toHaveBeenCalledOnce();
  expect(request.cookies.get("session")?.value).toBe("fresh");
  expect(response.cookies.get("session")?.value).toBe("fresh");
  expect(response.headers.get("x-middleware-request-cookie")).toContain("session=fresh");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
