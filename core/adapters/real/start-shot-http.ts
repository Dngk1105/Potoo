import type { RoomEventPayloads, RoomEventSender } from "@/core/contracts";

type StartShotPayload = RoomEventPayloads["START_SHOT"];
type VerifiedStartShot = { payload: StartShotPayload; sender: RoomEventSender };
type Fetch = typeof globalThis.fetch;

class RequestError extends Error {
  constructor(readonly status: number) {
    super(`START_SHOT request failed (${status})`);
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw new Error("Invalid base64url");
  const binary = atob(
    value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4),
  );
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) throw new Error("Non-canonical base64url");
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validPayload(value: unknown): value is StartShotPayload {
  return (
    record(value) &&
    typeof value.sessionId === "string" &&
    uuid.test(value.sessionId) &&
    typeof value.requestId === "string" &&
    uuid.test(value.requestId) &&
    typeof value.round === "number" &&
    Number.isInteger(value.round) &&
    value.round >= 0 &&
    value.round <= 2147483647 &&
    typeof value.delayMs === "number" &&
    Number.isInteger(value.delayMs) &&
    value.delayMs >= 0 &&
    value.delayMs <= 60000
  );
}

/** Same-origin transport; callers must select an active session before issuing a shot. */
export function createStartShotHttp(fetcher: Fetch = globalThis.fetch) {
  let cachedKey: { kid: string; key: CryptoKey; expires: number } | undefined;
  let keyRequest: Promise<{ kid: string; key: CryptoKey; expires: number }> | undefined;
  let lastUnknownKeyRefresh = Number.NEGATIVE_INFINITY;
  let keyFailureUntil = 0;
  async function publicKey(forceRefresh = false) {
    if (!forceRefresh && cachedKey && cachedKey.expires > Date.now()) return cachedKey;
    if (keyRequest) return keyRequest;
    if (Date.now() < keyFailureUntil) throw new Error("START_SHOT key temporarily unavailable");
    keyRequest = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetcher("/api/start-shot-public-key", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) throw new RequestError(response.status);
        const value: unknown = await response.json();
        if (
          !record(value) ||
          value.version !== 2 ||
          typeof value.kid !== "string" ||
          !/^[A-Za-z0-9_-]{16}$/.test(value.kid) ||
          typeof value.publicKey !== "string" ||
          value.publicKey.length > 256
        )
          throw new Error("Invalid START_SHOT public key");
        const bytes = decodeBase64Url(value.publicKey);
        const subtle = globalThis.crypto?.subtle;
        if (!subtle) throw new Error("Web Crypto unavailable");
        const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
        if (encodeBase64Url(digest).slice(0, 16) !== value.kid)
          throw new Error("Invalid START_SHOT key ID");
        const key = await subtle.importKey("spki", bytes, { name: "Ed25519" }, false, ["verify"]);
        return { kid: value.kid, key, expires: Date.now() + 60000 };
      } finally {
        clearTimeout(timer);
      }
    })();
    try {
      cachedKey = await keyRequest;
      keyFailureUntil = 0;
      return cachedKey;
    } catch (error) {
      keyFailureUntil = Date.now() + 5000;
      throw error;
    } finally {
      keyRequest = undefined;
    }
  }
  async function post(
    roomId: string,
    suffix: string,
    method: "POST" | "PUT",
    body: object,
    timeoutMs = 8000,
  ): Promise<unknown> {
    if (!uuid.test(roomId)) throw new Error("Invalid room ID");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`/api/rooms/${encodeURIComponent(roomId)}/${suffix}`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new RequestError(response.status);
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async preverifyStartShot(roomId: string, envelope: string): Promise<void> {
      if (!uuid.test(roomId) || typeof envelope !== "string" || envelope.length > 4096)
        throw new Error("Invalid START_SHOT envelope");
      const parts = envelope.split(".");
      if (parts.length !== 4 || parts[0] !== "2" || !/^[A-Za-z0-9_-]{16}$/.test(parts[1]))
        throw new Error("Invalid START_SHOT envelope");
      const signature = decodeBase64Url(parts[3]);
      if (signature.length !== 64) throw new Error("Invalid START_SHOT signature");
      const innerBytes = decodeBase64Url(parts[2]);
      let trusted = await publicKey();
      if (trusted.kid !== parts[1] && Date.now() - lastUnknownKeyRefresh >= 5000) {
        lastUnknownKeyRefresh = Date.now();
        trusted = await publicKey(true);
      }
      if (trusted.kid !== parts[1]) throw new Error("Unknown START_SHOT key");
      const { kid, key } = trusted;
      const valid = await crypto.subtle.verify(
        "Ed25519",
        key,
        signature,
        new TextEncoder().encode(`potoo:start-shot:v2:${kid}:${parts[2]}`),
      );
      if (!valid) throw new Error("Invalid START_SHOT signature");
      const inner = new TextDecoder("utf-8", { fatal: true }).decode(innerBytes).split(".");
      if (inner.length !== 2 || decodeBase64Url(inner[1]).length !== 32)
        throw new Error("Invalid START_SHOT envelope");
      const payload: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(inner[0])),
      );
      if (
        !record(payload) ||
        typeof payload.roomId !== "string" ||
        !uuid.test(payload.roomId) ||
        payload.roomId.toLowerCase() !== roomId.toLowerCase()
      )
        throw new Error("Wrong START_SHOT room");
    },
    async selectSession(roomId: string, sessionId: string | null): Promise<void> {
      if (sessionId !== null && !uuid.test(sessionId)) throw new Error("Invalid session ID");
      await post(roomId, "shot-session", "PUT", { sessionId });
    },
    async issueStartShot(roomId: string, payload: StartShotPayload): Promise<string> {
      if (!validPayload(payload)) throw new Error("Invalid START_SHOT payload");
      const result = await post(roomId, "start-shot", "POST", payload);
      if (
        !record(result) ||
        typeof result.envelope !== "string" ||
        !result.envelope ||
        result.envelope.length > 4096
      ) {
        throw new Error("Invalid START_SHOT response");
      }
      return result.envelope;
    },
    async verifyStartShot(roomId: string, envelope: string): Promise<VerifiedStartShot> {
      if (typeof envelope !== "string" || !envelope || envelope.length > 4096)
        throw new Error("Invalid START_SHOT envelope");
      const claimRequestId = crypto.randomUUID();
      const body = { envelope, claimRequestId };
      let result: unknown;
      try {
        result = await post(roomId, "start-shot/verify", "POST", body, 3500);
      } catch (error) {
        if (error instanceof RequestError && error.status < 500) throw error;
        result = await post(roomId, "start-shot/verify", "POST", body, 3500);
      }
      if (
        !record(result) ||
        !validPayload(result.payload) ||
        !record(result.sender) ||
        typeof result.sender.identity !== "string" ||
        !uuid.test(result.sender.identity) ||
        result.sender.role !== "host"
      ) {
        throw new Error("Invalid START_SHOT verification");
      }
      return {
        payload: result.payload,
        sender: { identity: result.sender.identity, role: "host" },
      };
    },
  };
}
