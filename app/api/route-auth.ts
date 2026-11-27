import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type Context = {
  user: User;
  supabase: SupabaseClient;
  /** Bypasses RLS. Check authorization for every operation before using it. */
  createAdminClient: () => SupabaseClient;
};

type Handler = (context: Context) => Promise<Response>;

/** For authenticated Route Handlers only; never use for webhooks or public routes. */
export async function withRouteAuth(request: NextRequest, handler: Handler): Promise<NextResponse> {
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const pendingHeaders = new Headers();
  const finish = (response: Response) => {
    const result = new NextResponse(response.body, response);
    pendingCookies.forEach(({ name, value, options }) => result.cookies.set(name, value, options));
    pendingHeaders.forEach((value, name) => result.headers.set(name, value));
    result.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
    return result;
  };
  const fail = (status: number, code: string, message: string) =>
    finish(NextResponse.json({ error: { code, message } }, { status }));

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s,]+)$/i);
  if (authorization !== null && !match) return fail(401, "UNAUTHENTICATED", "Unauthorized");
  const token = match?.[1];

  // Bearer credentials are explicit; cookies require a same-origin mutation.
  if (!token && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) return fail(403, "FORBIDDEN", "Forbidden");
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return fail(500, "INTERNAL_ERROR", "Internal server error");

    const supabase = token
      ? createClient(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        })
      : createServerClient(url, key, {
          cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookies, headers) => {
              cookies.forEach(({ name, value }) => request.cookies.set(name, value));
              pendingCookies.push(...cookies);
              Object.entries(headers).forEach(([name, value]) => pendingHeaders.set(name, value));
            },
          },
        });
    const { data, error } = token
      ? await supabase.auth.getUser(token)
      : await supabase.auth.getUser();
    if (error || !data.user) {
      if (error && ![400, 401, 403].includes(error.status ?? 0)) {
        return fail(503, "SERVICE_UNAVAILABLE", "Authentication unavailable");
      }
      return fail(401, "UNAUTHENTICATED", "Unauthorized");
    }

    const createAdminClient = () => {
      const secret = process.env.SUPABASE_SECRET_KEY;
      if (!secret) throw new Error("Missing server configuration");
      return createClient(url, secret, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
    };
    return finish(await handler({ user: data.user, supabase, createAdminClient }));
  } catch {
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}
