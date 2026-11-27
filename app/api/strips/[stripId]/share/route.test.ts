import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../../route-auth", () => ({
  withRouteAuth: (_req: NextRequest, fn: (context: unknown) => Promise<Response>) =>
    fn({
      user: { id: "12345678-1234-1234-1234-123456789abc" },
      createAdminClient: () => ({ rpc }),
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
describe("share strip", () => {
  it("returns a token after an atomic owner check", async () => {
    rpc.mockResolvedValueOnce({ data: "token", error: null });
    const response = await POST(req({}), { params: Promise.resolve({ stripId: id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ shareToken: "token" });
    expect(rpc).toHaveBeenCalledWith("k406_share_strip", {
      p_actor: id,
      p_strip: id,
      p_token: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects non-owners", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const response = await POST(req({}), { params: Promise.resolve({ stripId: id }) });
    expect(response.status).toBe(403);
  });
  it("rejects unknown fields", async () => {
    const response = await POST(req({ userId: id }), { params: Promise.resolve({ stripId: id }) });
    expect(response.status).toBe(400);
  });
});
