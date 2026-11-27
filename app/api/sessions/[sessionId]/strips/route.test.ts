import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({
      user: { id: "12345678-1234-1234-1234-123456789abc" },
      createAdminClient: () => ({ rpc }),
    }),
}));
import { POST } from "./route";

const id = "12345678-1234-1234-1234-123456789abc";
const context = { params: Promise.resolve({ sessionId: id }) };
const request = (body: unknown) =>
  new NextRequest("https://example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST session strips", () => {
  it("fails closed for shared ownership without provenance", async () => {
    const response = await POST(
      request({ kind: "shared", canvasJson: { version: 1 }, ownerIds: [id] }),
      context,
    );
    expect(response.status).toBe(503);
  });
  it("creates a personal strip with an atomic RPC", async () => {
    rpc.mockResolvedValueOnce({ data: id, error: null });
    const response = await POST(
      request({ kind: "personal", canvasJson: { version: 1 }, ownerIds: [id] }),
      context,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ stripId: id, ownerIds: [id] });
    expect(rpc).toHaveBeenCalledWith("k406_create_personal_strip", {
      p_actor: id,
      p_session: id,
      p_canvas: { version: 1 },
    });
  });
  it("rejects a user without membership", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const response = await POST(
      request({ kind: "personal", canvasJson: { version: 1 }, ownerIds: [id] }),
      context,
    );
    expect(response.status).toBe(403);
  });
  it.each([
    { kind: "shared", canvasJson: { version: 1 }, ownerIds: [id, id] },
    { kind: "shared", canvasJson: {}, ownerIds: [id] },
    {
      kind: "personal",
      canvasJson: { version: 1 },
      ownerIds: ["22345678-1234-1234-1234-123456789abc"],
    },
    { kind: "shared", canvasJson: { version: 1 }, ownerIds: [id], extra: true },
  ])("rejects invalid input", async (body) => {
    expect((await POST(request(body), context)).status).toBe(400);
  });
});
