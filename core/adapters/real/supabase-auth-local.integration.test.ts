import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { createSupabaseAuth } from "./supabase-auth";

const enabled = process.env.LOCAL_SUPABASE_AUTH_TEST === "1";

describe.skipIf(!enabled)("Supabase local Auth", () => {
  test("signs in and out with a disposable local account", async () => {
    const url = process.env.LOCAL_SUPABASE_URL;
    const publicKey = process.env.LOCAL_SUPABASE_PUBLIC_KEY;
    const secretKey = process.env.LOCAL_SUPABASE_SECRET_KEY;
    if (!url || !publicKey || !secretKey) throw new Error("Local test configuration is missing");
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
      throw new Error("Auth integration test requires a local Supabase URL");
    }
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const admin = createClient(url, secretKey, options);
    const client = createClient(url, publicKey, options);
    const port = createSupabaseAuth(client);
    const email = `auth-test-${randomUUID()}@example.com`;
    const password = `${randomUUID()}Aa1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    if (!created.data.user) throw new Error("Failed to create disposable local account");
    const id = created.data.user.id;
    try {
      await expect(port.signIn({ method: "email", email, password })).resolves.toEqual({
        status: "signed-in",
        user: { id, email },
      });
      await expect(port.currentUser()).resolves.toEqual({ id, email });
      await port.signOut();
      await expect(port.currentUser()).resolves.toBeNull();
    } finally {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  }, 30000);
});
