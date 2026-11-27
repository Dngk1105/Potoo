import { createBrowserClient, createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Pass only a publishable or anon key, never a secret or service-role key. */
export function createSupabaseBrowserAuthClient(
  url: string,
  publishableKey: string,
): SupabaseClient {
  return createBrowserClient(url, publishableKey);
}

/** Create once per request. Persist both cookies and the supplied response headers. */
export function createSupabaseServerAuthClient(
  url: string,
  publishableKey: string,
  cookies: CookieMethodsServer & Required<Pick<CookieMethodsServer, "setAll">>,
): SupabaseClient {
  return createServerClient(url, publishableKey, { cookies });
}

/** Exchange the callback code using the same cookie store that initiated OAuth. */
export async function exchangeSupabaseOAuthCode(
  client: Pick<SupabaseClient, "auth">,
  code: string,
): Promise<void> {
  if (!code) throw new Error("Missing OAuth authorization code");
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
}
