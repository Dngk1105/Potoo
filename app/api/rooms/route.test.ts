import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
vi.mock("../route-auth", () => ({
  withRouteAuth: (_request: NextRequest, handler: (context: unknown) => Promise<Response>) =>
    handler({ user: { id: "actor" }, createAdminClient: () => ({ rpc }) }),
}));
import { POST } from "./route";

function request(body: string, contentType = "application/json") {
  return new NextRequest("http://localhost/api/rooms", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

beforeEach(() => rpc.mockReset());

describe("create room", () => {
  it("validates the body before accessing the database", async () => {
    for (const value of ["null", "[]", '{"extra":1}', "{"]) {
      expect((await POST(request(value))).status).toBe(400);
    }
    expect((await POST(request("{}", "text/plain"))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates a room and host membership through one RPC", async () => {
    rpc.mockResolvedValue({ data: "room-id", error: null });
    const response = await POST(request("{}"));
    const result = await response.json();
    expect(response.status).toBe(201);
    expect(result.roomId).toBe("room-id");
    expect(result.pin).toMatch(/^\d{6}$/);
    expect(rpc).toHaveBeenCalledWith("k405_create_room", { p_actor: "actor", p_pin: result.pin });
  });

  it("retries PIN collisions and fails closed for database errors", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    rpc.mockResolvedValueOnce({ data: "room-id", error: null });
    expect((await POST(request("{}"))).status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    const response = await POST(request("{}"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "SERVICE_UNAVAILABLE", message: "Service unavailable" },
    });
  });

  it("limits collision retries", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await POST(request("{}"))).status).toBe(503);
    expect(rpc).toHaveBeenCalledTimes(32);
  });
});
