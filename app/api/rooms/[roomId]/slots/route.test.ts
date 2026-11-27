import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.fn();
vi.mock("../../../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({ user: { id: "actor" }, createAdminClient: () => ({ rpc }) }),
}));
import { PUT } from "./route";
const roomId = "12345678-1234-4234-8234-123456789abc";
const userId = "aaaaaaaa-1234-4234-8234-123456789abc";
const context = { params: Promise.resolve({ roomId }) };
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/rooms/x/slots", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => rpc.mockReset());
describe("set slots", () => {
  it("rejects invalid or duplicate assignments", async () => {
    for (const body of [
      {},
      { slots: [], x: 1 },
      { slots: [{ userId, slotIndex: -1 }] },
      {
        slots: [
          { userId, slotIndex: 0 },
          { userId: userId.toUpperCase(), slotIndex: 1 },
        ],
      },
      {
        slots: [
          { userId, slotIndex: 0 },
          { userId: roomId, slotIndex: 0 },
        ],
      },
      { slots: [{ userId, slotIndex: 0, extra: true }] },
    ]) {
      expect((await PUT(request(body), context)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ slots: [] }, { slots: [{ userId, slotIndex: 0 }] }])(
    "sends full replacement to transaction",
    async ({ slots }) => {
      rpc.mockResolvedValue({ data: { slots }, error: null });
      expect(await (await PUT(request({ slots }), context)).json()).toEqual({ slots });
      expect(rpc).toHaveBeenCalledWith("k405_set_slots", {
        p_actor: "actor",
        p_room_id: roomId,
        p_slots: slots,
      });
    },
  );
  it.each([
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["CONFLICT", 409],
    ["INVALID_REQUEST", 400],
  ])("maps %s", async (code, status) => {
    rpc.mockResolvedValue({ data: { code }, error: null });
    expect((await PUT(request({ slots: [] }), context)).status).toBe(status);
  });
  it("does not claim success on DB failure", async () => {
    rpc.mockResolvedValue({ error: {}, data: null });
    expect((await PUT(request({ slots: [] }), context)).status).toBe(503);
  });
});
