import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerAuthClient } from "@/core/adapters";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const responseHeaders = new Headers();
  const client = createSupabaseServerAuthClient(url, key, {
    getAll: () => request.cookies.getAll(),
    setAll: (cookies, headers) => {
      for (const { name, value } of cookies) request.cookies.set(name, value);
      const previous = response;
      response = NextResponse.next({ request });
      for (const cookie of previous.cookies.getAll()) response.cookies.set(cookie);
      for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
      responseHeaders.forEach((value, name) => response.headers.set(name, value));
    },
  });
  await client.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/((?!auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
