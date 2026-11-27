import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  info: vi.fn(),
  existing: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}));
vi.mock("../../../route-auth", () => ({
  withRouteAuth: (_req: NextRequest, fn: (context: unknown) => Promise<Response>) =>
    fn({
      user: { id: "12345678-1234-1234-1234-123456789abc" },
      supabase: { rpc: mocks.rpc, from: mocks.from },
      createAdminClient: () => ({ storage: { from: () => ({ info: mocks.info }) } }),
    }),
}));
import { POST } from "./route";
const id = "12345678-1234-1234-1234-123456789abc";
const req = (body: unknown) =>
  new NextRequest("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const context = { params: Promise.resolve({ sessionId: id }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.info.mockResolvedValue({ data: {}, error: null });
  mocks.existing.mockResolvedValue({ data: null, error: null });
  mocks.single.mockResolvedValue({ data: { id }, error: null });
  const chain = { eq: vi.fn(), maybeSingle: mocks.existing };
  chain.eq.mockReturnValue(chain);
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.from.mockReturnValue({ select: () => chain, insert: mocks.insert });
});
describe("record shot", () => {
  it("constructs the path and records the authenticated user", async () => {
    const response = await POST(req({ round: 0 }), context);
    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith({
      session_id: id,
      user_id: id,
      round: 0,
      storage_path: `sessions/${id}/0/${id}.jpg`,
    });
  });
  it("rejects non-members before storage access", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(req({ round: 0 }), context)).status).toBe(403);
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it("rejects missing objects without inserting", async () => {
    mocks.info.mockResolvedValue({ error: { statusCode: "404" } });
    expect((await POST(req({ round: 0 }), context)).status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects client identity and invalid rounds", async () => {
    expect((await POST(req({ round: 0, userId: id }), context)).status).toBe(400);
    expect((await POST(req({ round: -1 }), context)).status).toBe(400);
  });
});
