import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("../../livekit-webhook", () => ({ verifyLiveKitWebhook: verify }));
import { POST } from "./route";

const id = "00000000-0000-4000-8000-000000000001";
const request = (authorization = "signed") =>
  new Request("https://example.test/api/livekit/webhook", {
    method: "POST",
    headers: authorization ? { authorization } : {},
    body: '{ "raw": true }',
  });

describe("LiveKit webhook route", () => {
  beforeEach(() => {
    vi.stubEnv("LIVEKIT_API_KEY", "key");
    vi.stubEnv("LIVEKIT_API_SECRET", "secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });
  it("verifies the exact raw body before acknowledging other events", async () => {
    verify.mockResolvedValue({ event: "room_started" });
    expect((await POST(request())).status).toBe(200);
    expect(verify).toHaveBeenCalledWith('{ "raw": true }', "signed", "key", "secret");
  });
  it("rejects absent and invalid signatures", async () => {
    expect((await POST(request(""))).status).toBe(401);
    verify.mockRejectedValue(new Error("invalid"));
    expect((await POST(request())).status).toBe(401);
  });
  it("validates participant_left identifiers", async () => {
    verify.mockResolvedValue({ event: "participant_left", room: { name: id }, participant: {} });
    expect((await POST(request())).status).toBe(400);
  });
  it("requests retry instead of transferring an unsafe host role", async () => {
    verify.mockResolvedValue({
      event: "participant_left",
      room: { name: id },
      participant: { identity: id },
    });
    expect((await POST(request())).status).toBe(503);
  });
});
