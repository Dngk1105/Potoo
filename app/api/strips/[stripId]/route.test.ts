import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  info: vi.fn(),
  update: vi.fn(),
  lookup: vi.fn(),
  result: vi.fn(),
}));
vi.mock("../../route-auth", () => ({
  withRouteAuth: (_req: NextRequest, fn: (context: unknown) => Promise<Response>) =>
    fn({
      user: { id: "user" },
      createAdminClient: () => ({
        from: mocks.from,
        storage: { from: () => ({ info: mocks.info }) },
      }),
    }),
}));
import { PATCH } from "./route";
const id = "12345678-1234-1234-1234-123456789abc";
const context = { params: Promise.resolve({ stripId: id }) };
const req = (body: unknown) =>
  new NextRequest("https://example.test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({ data: { kind: "personal", created_by: "user" }, error: null });
  mocks.result.mockResolvedValue({
    data: { id, canvas_json: { version: 1 }, export_path: null },
    error: null,
  });
  mocks.info.mockResolvedValue({ data: {}, error: null });
  const chain = { eq: vi.fn(), select: vi.fn(), maybeSingle: mocks.result };
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }),
    update: mocks.update,
  });
});
describe("edit strip", () => {
  it("updates a personal strip belonging to the authenticated creator", async () => {
    const response = await PATCH(req({ canvasJson: { version: 1 } }), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ canvas_json: { version: 1 } });
  });
  it("rejects other creators", async () => {
    mocks.lookup.mockResolvedValue({
      data: { kind: "personal", created_by: "other" },
      error: null,
    });
    expect((await PATCH(req({ exported: true }), context)).status).toBe(403);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("fails closed for shared strips", async () => {
    mocks.lookup.mockResolvedValue({ data: { kind: "shared", created_by: "user" }, error: null });
    expect((await PATCH(req({ exported: true }), context)).status).toBe(503);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires a present standard export before updating", async () => {
    mocks.info.mockResolvedValue({ error: { statusCode: "404" } });
    expect((await PATCH(req({ exported: true }), context)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
