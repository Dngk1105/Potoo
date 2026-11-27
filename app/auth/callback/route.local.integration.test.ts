import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const enabled = process.env.LOCAL_SUPABASE_AUTH_TEST === "1";

afterEach(() => vi.unstubAllEnvs());

describe.skipIf(!enabled)("local email confirmation callback", () => {
  test("verifies a real signup token and deletes the disposable user", async () => {
    const url = process.env.LOCAL_SUPABASE_URL;
    const publicKey = process.env.LOCAL_SUPABASE_PUBLIC_KEY;
    const secretKey = process.env.LOCAL_SUPABASE_SECRET_KEY;
    if (!url || !publicKey || !secretKey) throw new Error("Local test configuration is missing");
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
      throw new Error("Auth integration test requires local Supabase");
    }
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `confirm-test-${randomUUID()}@example.com`;
    const password = `${randomUUID()}Aa1!`;
    const generated = await admin.auth.admin.generateLink({ type: "signup", email, password });
    if (generated.error) throw generated.error;
    const userId = generated.data.user?.id;
    const tokenHash = generated.data.properties?.hashed_token;
    if (!userId) throw new Error("Failed to create confirmation fixture");
    try {
      if (!tokenHash) throw new Error("Confirmation fixture has no token");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publicKey);
      const callback = new URL("http://localhost:3000/auth/callback");
      callback.searchParams.set("token_hash", tokenHash);
      callback.searchParams.set("type", "signup");
      const response = await GET(new NextRequest(callback));
      expect(response.headers.get("location")).toBe("http://localhost:3000/");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"))).toBe(true);
      const confirmed = await admin.auth.admin.getUserById(userId);
      expect(confirmed.error).toBeNull();
      expect(confirmed.data.user?.email_confirmed_at).toBeTruthy();
    } finally {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  }, 30000);
});
