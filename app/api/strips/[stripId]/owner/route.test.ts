import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("../../../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({ user: { id: "server-user" }, supabase: { from: mocks.from } }),
}));
import { PATCH } from "./route";

const stripId = "12345678-1234-1234-1234-123456789abc";
const request = (body: unknown) =>
  new NextRequest("https://example.test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const context = { params: Promise.resolve({ stripId }) };

describe("PATCH strip owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select });
    mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({
      data: { visibility: "private", hidden_at: null },
      error: null,
    });
  });
  it("updates only the authenticated owner's row", async () => {
    const response = await PATCH(request({ visibility: "private", hidden: false }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ visibility: "private", hidden: false });
    expect(mocks.update).toHaveBeenCalledWith({ visibility: "private", hidden_at: null });
    expect(mocks.eq).toHaveBeenCalledWith("strip_id", stripId);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "server-user");
  });
  it.each([{}, { hidden: null }, { visibility: "public" }, { hidden: true, userId: "other" }])(
    "rejects invalid input %o",
    async (body) => {
      expect((await PATCH(request(body), context)).status).toBe(400);
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it("does not reveal another owner's row", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await PATCH(request({ hidden: true }), context)).status).toBe(404);
  });
  it("does not leak database errors", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "sensitive" } });
    const response = await PATCH(request({ hidden: true }), context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive");
  });
});
