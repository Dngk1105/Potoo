import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { createSupabaseAuth } from "./supabase-auth";
import { createSupabaseServerAuthClient } from "./supabase-auth-ssr";

// Opt-in uses an admin key only to clean up the unique local test account.
describe.skipIf(process.env.LOCAL_SUPABASE_PUBLISHABLE_AUTH_TEST !== "1")(
  "publishable local Auth",
  () => {
    test("signs up a unique account and persists the SDK cookie state", async () => {
      const url = process.env.LOCAL_SUPABASE_URL;
      const key = process.env.LOCAL_SUPABASE_PUBLIC_KEY;
      const secret = process.env.LOCAL_SUPABASE_SECRET_KEY;
      if (!url || !key || !secret) throw new Error("Local test configuration is missing");
      const parsed = new URL(url);
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
        !["http:", "https:"].includes(parsed.protocol)
      ) {
        throw new Error("Auth integration test requires a local Supabase URL");
      }
      const jar = new Map<string, string>();
      const cookies = {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (items: { name: string; value: string }[]) => {
          for (const item of items) {
            if (item.value) jar.set(item.name, item.value);
            else jar.delete(item.name);
          }
        },
      };
      const email = `auth-${randomUUID()}@example.com`;
      const password = `${randomUUID()}Aa1!`;
      const auth = createSupabaseAuth(createSupabaseServerAuthClient(url, key, cookies));
      const admin = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      try {
        const result = await auth.signUp({
          email,
          password,
          redirectTo: "http://localhost:3000/auth/callback",
        });
        if (result.status === "signed-in") {
          const next = createSupabaseAuth(createSupabaseServerAuthClient(url, key, cookies));
          expect(await next.currentUser()).toEqual({ id: result.user.id, email });
          await next.signOut();
        } else {
          expect(result.status).toBe("confirmation-required");
          expect([...jar.keys()].some((name) => name.includes("code-verifier"))).toBe(true);
        }
      } finally {
        let page = 1;
        while (true) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
          if (error) throw error;
          const created = data.users.find((user) => user.email === email);
          if (created) {
            const deleted = await admin.auth.admin.deleteUser(created.id);
            if (deleted.error) throw deleted.error;
            break;
          }
          if (data.users.length < 100) break;
          page += 1;
        }
      }
    }, 30000);
  },
);
