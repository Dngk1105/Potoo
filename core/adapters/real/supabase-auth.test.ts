import { AuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import type { AuthPort } from "@/core/contracts";
import { createSupabaseAuth } from "./supabase-auth";

function setup() {
  const auth = {
    getUser: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  };
  return { auth, port: createSupabaseAuth({ auth } as unknown as SupabaseClient) };
}

describe("Supabase Auth adapter", () => {
  test("uses verified user and returns null for a missing session", async () => {
    const { auth, port } = setup();
    expectTypeOf(port).toEqualTypeOf<AuthPort>();
    auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "1", email: "a@example.test" } },
      error: null,
    });
    await expect(port.currentUser()).resolves.toEqual({ id: "1", email: "a@example.test" });
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    await expect(port.currentUser()).resolves.toBeNull();
    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });

  test("propagates other authentication errors", async () => {
    const { auth, port } = setup();
    const error = new Error("network error");
    auth.getUser.mockResolvedValue({ data: { user: null }, error });
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error });
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error });
    auth.signOut.mockResolvedValue({ error });
    await expect(port.currentUser()).rejects.toBe(error);
    await expect(port.signIn({ method: "email", email: "x", password: "y" })).rejects.toBe(error);
    await expect(port.signIn({ method: "google" })).rejects.toBe(error);
    await expect(port.signOut()).rejects.toBe(error);
  });

  test("registers email and reports when confirmation is required", async () => {
    const { auth, port } = setup();
    auth.signUp.mockResolvedValue({ data: { user: { id: "1" }, session: null }, error: null });
    await expect(
      port.signUp({ email: "x", password: "y", redirectTo: "https://example.test" }),
    ).resolves.toEqual({
      status: "confirmation-required",
    });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "x",
      password: "y",
      options: { emailRedirectTo: "https://example.test" },
    });
  });

  test("registers with an immediate session and rejects malformed responses or errors", async () => {
    const { auth, port } = setup();
    const input = { email: "x", password: "y" };
    auth.signUp.mockResolvedValueOnce({
      data: { user: { id: "1", email: "x" }, session: {} },
      error: null,
    });
    await expect(port.signUp(input)).resolves.toEqual({
      status: "signed-in",
      user: { id: "1", email: "x" },
    });
    auth.signUp.mockResolvedValueOnce({ data: { user: null, session: {} }, error: null });
    await expect(port.signUp(input)).rejects.toThrow("without a user");
    const error = new Error("failed");
    auth.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error });
    await expect(port.signUp(input)).rejects.toBe(error);
  });

  test("signs in with email and maps an absent email to null", async () => {
    const { auth, port } = setup();
    auth.signInWithPassword.mockResolvedValue({ data: { user: { id: "1" } }, error: null });
    await expect(port.signIn({ method: "email", email: "x", password: "y" })).resolves.toEqual({
      status: "signed-in",
      user: { id: "1", email: null },
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "x", password: "y" });
  });

  test("returns the Google OAuth URL without navigating", async () => {
    const { auth, port } = setup();
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://example.test/auth" },
      error: null,
    });
    await expect(
      port.signIn({ method: "google", redirectTo: "https://example.test/callback" }),
    ).resolves.toEqual({
      status: "redirect",
      url: "https://example.test/auth",
    });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://example.test/callback", skipBrowserRedirect: true },
    });
  });

  test("rejects incomplete success responses", async () => {
    const { auth, port } = setup();
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });
    await expect(port.signIn({ method: "email", email: "x", password: "y" })).rejects.toThrow(
      "no user",
    );
    await expect(port.signIn({ method: "google" })).rejects.toThrow("no redirect URL");
  });

  test("signs out and forwards auth state changes until unsubscribed", async () => {
    const { auth, port } = setup();
    const unsubscribe = vi.fn();
    auth.signOut.mockResolvedValue({ error: null });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    await expect(port.signOut()).resolves.toBeUndefined();
    const listener = vi.fn();
    const stop = port.onChange(listener);
    const callback = auth.onAuthStateChange.mock.calls[0][0];
    callback("SIGNED_IN", { user: { id: "1", email: "x" } });
    callback("SIGNED_OUT", null);
    expect(listener.mock.calls).toEqual([[{ id: "1", email: "x" }], [null]]);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
