import "server-only";

import { WebhookReceiver } from "livekit-server-sdk";

// Pass the unmodified request body and Authorization header; verification must not be skipped.
export function verifyLiveKitWebhook(
  rawBody: string,
  authorization: string | undefined,
  apiKey: string,
  apiSecret: string,
) {
  if (!apiKey || !apiSecret) throw new Error("LiveKit webhook credentials are required");
  return new WebhookReceiver(apiKey, apiSecret).receive(rawBody, authorization);
}
