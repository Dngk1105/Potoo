import { createHash } from "node:crypto";

import { AccessToken } from "livekit-server-sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { verifyLiveKitWebhook } from "./livekit-webhook";

const key = "test-key";
const secret = "test-secret-not-a-real-credential";
const body =
  '{"event":"participant_left","room":{"name":"room-1"},"participant":{"identity":"user-1"}}';

async function sign(rawBody: string, apiKey = key, apiSecret = secret) {
  const token = new AccessToken(apiKey, apiSecret);
  token.sha256 = createHash("sha256").update(rawBody).digest("base64");
  return token.toJwt();
}

describe("verifyLiveKitWebhook", () => {
  it("verifies the raw payload with the SDK", async () => {
    const event = await verifyLiveKitWebhook(body, await sign(body), key, secret);
    expect(event.event).toBe("participant_left");
    expect(event.room?.name).toBe("room-1");
    expect(event.participant?.identity).toBe("user-1");
  });

  it("rejects an altered body, missing header, wrong secret, or wrong key", async () => {
    const token = await sign(body);
    await expect(verifyLiveKitWebhook(`${body} `, token, key, secret)).rejects.toThrow();
    await expect(verifyLiveKitWebhook(body, undefined, key, secret)).rejects.toThrow();
    await expect(verifyLiveKitWebhook(body, token, key, "wrong-secret")).rejects.toThrow();
    await expect(verifyLiveKitWebhook(body, token, "wrong-key", secret)).rejects.toThrow();
  });

  it("rejects tokens without a body hash and missing credentials", async () => {
    const token = await new AccessToken(key, secret).toJwt();
    await expect(verifyLiveKitWebhook(body, token, key, secret)).rejects.toThrow();
    expect(() => verifyLiveKitWebhook(body, token, "", secret)).toThrow();
    expect(() => verifyLiveKitWebhook(body, token, key, "")).toThrow();
  });
});
