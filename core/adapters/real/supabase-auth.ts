import { isAuthSessionMissingError, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { AuthPort, AuthUser } from "@/core/contracts";

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

/** The caller configures the client, its SSR cookie storage, and the OAuth callback. */
export function createSupabaseAuth(client: Pick<SupabaseClient, "auth">): AuthPort {
  return {
    async currentUser() {
      const { data, error } = await client.auth.getUser();
      if (error) {
        if (isAuthSessionMissingError(error)) return null;
        throw error;
      }
      return data.user ? toAuthUser(data.user) : null;
    },
    async signUp(input) {
      const { data, error } = await client.auth.signUp({
        email: input.email,
        password: input.password,
        ...(input.redirectTo ? { options: { emailRedirectTo: input.redirectTo } } : {}),
      });
      if (error) throw error;
      if (!data.session) return { status: "confirmation-required" };
      if (!data.user) throw new Error("Supabase sign-up returned a session without a user");
      return { status: "signed-in", user: toAuthUser(data.user) };
    },
    async signIn(input) {
      if (input.method === "email") {
        const { data, error } = await client.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
        if (error) throw error;
        if (!data.user) throw new Error("Supabase sign-in returned no user");
        return { status: "signed-in", user: toAuthUser(data.user) };
      }

      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: input.redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Supabase OAuth returned no redirect URL");
      return { status: "redirect", url: data.url };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(session?.user ? toAuthUser(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
