import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import {
  createSupabaseBrowserAuthClient,
  createSupabaseServerAuthClient,
  exchangeSupabaseOAuthCode,
} from "./supabase-auth-ssr";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("Supabase SSR auth helpers", () => {
  test("creates browser and request-scoped server clients with caller cookies", () => {
    const cookies = { getAll: vi.fn(), setAll: vi.fn() };
    createSupabaseBrowserAuthClient("https://example.test", "public-key");
    createSupabaseServerAuthClient("https://example.test", "public-key", cookies);
    createSupabaseServerAuthClient("https://example.test", "public-key", cookies);
    expect(createBrowserClient).toHaveBeenCalledWith("https://example.test", "public-key");
    expect(createServerClient).toHaveBeenCalledTimes(2);
    expect(createServerClient).toHaveBeenCalledWith("https://example.test", "public-key", {
      cookies,
    });
  });

  test("exchanges callback codes and propagates failures", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValueOnce({ error: null });
    const client = { auth: { exchangeCodeForSession } } as unknown as SupabaseClient;
    await expect(exchangeSupabaseOAuthCode(client, "code")).resolves.toBeUndefined();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("code");
    const error = new Error("exchange failed");
    exchangeCodeForSession.mockResolvedValueOnce({ error });
    await expect(exchangeSupabaseOAuthCode(client, "bad-code")).rejects.toBe(error);
    await expect(exchangeSupabaseOAuthCode(client, "")).rejects.toThrow("Missing OAuth");
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(2);
  });
});
