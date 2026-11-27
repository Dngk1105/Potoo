import { afterEach, expect, test, vi } from "vitest";
import { createSupabaseAuth } from "./supabase-auth";
import { createSupabaseServerAuthClient } from "./supabase-auth-ssr";

// Exercise the real SDK and cookie serialization without a network service.
afterEach(() => vi.unstubAllGlobals());

test("persists an SDK session in cookies and verifies the user on a later request", async () => {
  const user = {
    id: "user-1",
    email: "a@example.test",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2020-01-01T00:00:00Z",
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/token?")
      ? {
          access_token: "access-token",
          refresh_token: "refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          user,
        }
      : user;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const store = new Map<string, string>();
  const headers: Record<string, string> = {};
  const cookies = {
    getAll: () => Array.from(store, ([name, value]) => ({ name, value })),
    setAll: (
      values: { name: string; value: string }[],
      responseHeaders: Record<string, string>,
    ) => {
      for (const { name, value } of values) store.set(name, value);
      Object.assign(headers, responseHeaders);
    },
  };
  const first = createSupabaseAuth(
    createSupabaseServerAuthClient("https://example.test", "public-key", cookies),
  );
  await expect(
    first.signIn({ method: "email", email: "a@example.test", password: "password" }),
  ).resolves.toEqual({ status: "signed-in", user: { id: "user-1", email: "a@example.test" } });
  expect(store.size).toBeGreaterThan(0);
  expect(headers["Cache-Control"]).toContain("no-store");
  const second = createSupabaseAuth(
    createSupabaseServerAuthClient("https://example.test", "public-key", cookies),
  );
  await expect(second.currentUser()).resolves.toEqual({ id: "user-1", email: "a@example.test" });
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/user"))).toBe(true);
});
