import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  info: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) =>
    key === "public-test"
      ? { auth: { getUser: mocks.getUser } }
      : {
          from: mocks.from,
          rpc: mocks.rpc,
          storage: { from: () => ({ info: mocks.info, createSignedUrl: mocks.sign }) },
        },
}));
import { POST } from "./route";
const stripId = "12345678-1234-1234-1234-123456789abc";
const owner1 = "22345678-1234-1234-1234-123456789abc";
const owner2 = "32345678-1234-1234-1234-123456789abc";
const req = () =>
  new NextRequest("https://example.test/api/strips/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shareToken: "token" }),
  });
let owners: { user_id: string; visibility: string }[];
let friendships: { requester_id: string; addressee_id: string }[];
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret-test");
  owners = [
    { user_id: owner1, visibility: "link" },
    { user_id: owner2, visibility: "link" },
  ];
  friendships = [];
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: { name: "AuthSessionMissingError" },
  });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.from.mockImplementation((table: string) =>
    table === "strips"
      ? {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: stripId,
                  kind: "personal",
                  session_id: stripId,
                  export_path: `strips/${stripId}.png`,
                  strip_owners: owners,
                },
                error: null,
              }),
            }),
          }),
        }
      : {
          select: () => ({ eq: () => ({ or: async () => ({ data: friendships, error: null }) }) }),
        },
  );
  mocks.info.mockResolvedValue({ data: {}, error: null });
  mocks.sign.mockResolvedValue({ data: { signedUrl: "signed" }, error: null });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe("open strip", () => {
  it("allows an anonymous viewer only when every owner allows link", async () => {
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ url: "signed", expiresIn: 60 });
    expect(mocks.sign).toHaveBeenCalledWith(`strips/${stripId}.png`, 60);
  });
  it("rejects anonymous viewers if any owner is private", async () => {
    owners[1].visibility = "private";
    expect((await POST(req())).status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("does not grant an owner an exception to the other owner's privacy", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner1 } }, error: null });
    owners[0].visibility = "private";
    owners[1].visibility = "private";
    expect((await POST(req())).status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("permits session membership across all non-private owners", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner1 } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    owners[0].visibility = "private";
    owners[1].visibility = "session";
    expect((await POST(req())).status).toBe(200);
  });
  it("permits accepted friendships only for owners granting friends", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner1 } }, error: null });
    owners[0].visibility = "private";
    owners[1].visibility = "friends";
    friendships = [{ requester_id: owner2, addressee_id: owner1 }];
    expect((await POST(req())).status).toBe(200);
  });
  it("fails closed without owners or when membership lookup fails", async () => {
    owners = [];
    expect((await POST(req())).status).toBe(404);
    owners = [{ user_id: owner2, visibility: "friends" }];
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner1 } }, error: null });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "secret" } });
    const response = await POST(req());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
