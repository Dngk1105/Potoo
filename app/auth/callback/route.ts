import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerAuthClient, exchangeSupabaseOAuthCode } from "@/core/adapters";

function destination(value: string | null, origin: string): URL {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return new URL("/", origin);
  }
  const url = new URL(value, origin);
  return url.origin === origin ? url : new URL("/", origin);
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = request.nextUrl.searchParams.get("type");
  const allowedTypes = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
  const hasOtp = !!tokenHash && !!otpType && allowedTypes.includes(otpType);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = NextResponse.redirect(new URL("/?auth=error", origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (
    (!code && !hasOtp) ||
    (code && tokenHash) ||
    !url ||
    !key ||
    request.nextUrl.searchParams.has("error")
  )
    return response;

  const client = createSupabaseServerAuthClient(url, key, {
    getAll: () => request.cookies.getAll(),
    setAll: (cookies, headers) => {
      for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    },
  });
  try {
    if (code) {
      await exchangeSupabaseOAuthCode(client, code);
    } else if (tokenHash && otpType && hasOtp) {
      const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
      if (error) throw error;
    }
    response.headers.set(
      "Location",
      destination(request.nextUrl.searchParams.get("next"), origin).href,
    );
  } catch {
    // Keep the generic error redirect and any cookie cleanup from the SDK.
  }
  return response;
}
