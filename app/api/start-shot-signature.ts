import "server-only";
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from "node:crypto";

export type SignedStartShot = {
  version: 1;
  eventId: string;
  requestId: string;
  roomId: string;
  sessionId: string;
  hostId: string;
  generation: number;
  round: number;
  delayMs: number;
  issuedAt: number;
  expiresAt: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = [
  "version",
  "eventId",
  "requestId",
  "roomId",
  "sessionId",
  "hostId",
  "generation",
  "round",
  "delayMs",
  "issuedAt",
  "expiresAt",
];
const maxLifetimeMs = 30000;

export function loadStartShotHmacKey(encoded: string | undefined): Buffer | null {
  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) return null;
  const decoded = Buffer.from(encoded, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === encoded ? decoded : null;
}

type Ed25519Key = {
  privateKey: KeyObject;
  publicKey: KeyObject;
  kid: string;
  encodedPublicKey: string;
};

export function loadStartShotEd25519Key(encoded: string | undefined): Ed25519Key | null {
  if (!encoded || encoded.length > 512 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const der = Buffer.from(encoded, "base64url");
    if (der.toString("base64url") !== encoded) return null;
    const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    if (privateKey.asymmetricKeyType !== "ed25519") return null;
    const publicKey = createPublicKey(privateKey);
    const spki = publicKey.export({ format: "der", type: "spki" });
    return {
      privateKey,
      publicKey,
      kid: createHash("sha256").update(spki).digest("base64url").slice(0, 16),
      encodedPublicKey: spki.toString("base64url"),
    };
  } catch {
    return null;
  }
}

export function wrapStartShotEnvelope(hmacEnvelope: string, key: Ed25519Key): string {
  const encoded = Buffer.from(hmacEnvelope, "utf8").toString("base64url");
  const message = `potoo:start-shot:v2:${key.kid}:${encoded}`;
  const signature = sign(null, Buffer.from(message, "utf8"), key.privateKey).toString("base64url");
  return `2.${key.kid}.${encoded}.${signature}`;
}

export function verifyStartShotEnvelope(
  token: string,
  hmacKey: Uint8Array,
  key: Ed25519Key,
  now: number,
): SignedStartShot | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== "2" ||
    parts[1] !== key.kid ||
    !/^[A-Za-z0-9_-]+$/.test(parts[2]) ||
    !/^[A-Za-z0-9_-]{86}$/.test(parts[3])
  )
    return null;
  try {
    const bytes = Buffer.from(parts[2], "base64url");
    const signature = Buffer.from(parts[3], "base64url");
    if (
      bytes.toString("base64url") !== parts[2] ||
      signature.length !== 64 ||
      signature.toString("base64url") !== parts[3]
    )
      return null;
    const message = `potoo:start-shot:v2:${parts[1]}:${parts[2]}`;
    if (!verify(null, Buffer.from(message, "utf8"), key.publicKey, signature)) return null;
    const hmacEnvelope = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return verifyStartShotSignature(hmacEnvelope, hmacKey, now);
  } catch {
    return null;
  }
}

function validPayload(value: unknown): value is SignedStartShot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== fields.length || fields.some((field) => !(field in data)))
    return false;
  for (const field of ["eventId", "requestId", "roomId", "sessionId", "hostId"]) {
    if (typeof data[field] !== "string" || !uuid.test(data[field] as string)) return false;
  }
  for (const field of ["generation", "round", "delayMs", "issuedAt", "expiresAt"]) {
    if (
      typeof data[field] !== "number" ||
      !Number.isSafeInteger(data[field]) ||
      (data[field] as number) < 0
    )
      return false;
  }
  return (
    data.version === 1 &&
    (data.round as number) <= 2147483647 &&
    (data.delayMs as number) <= 60000 &&
    (data.expiresAt as number) > (data.issuedAt as number) &&
    (data.expiresAt as number) - (data.issuedAt as number) <= maxLifetimeMs
  );
}

function validKey(key: Uint8Array): boolean {
  return key instanceof Uint8Array && key.byteLength >= 32;
}

/** Sign only after a server-side transaction has authorized the host and session. */
export function signStartShot(payload: SignedStartShot, key: Uint8Array): string {
  if (!validPayload(payload) || !validKey(key)) throw new Error("Invalid signing input");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

/** A valid MAC is not authorization: the caller must still check current DB state and replay. */
export function verifyStartShotSignature(
  token: string,
  key: Uint8Array,
  now: number,
): SignedStartShot | null {
  if (
    typeof token !== "string" ||
    !validKey(key) ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    token.length > 4096
  )
    return null;
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[1])
  )
    return null;
  try {
    const received = Buffer.from(parts[1], "base64url");
    if (received.toString("base64url") !== parts[1]) return null;
    const expected = createHmac("sha256", key).update(parts[0]).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const bytes = Buffer.from(parts[0], "base64url");
    if (bytes.toString("base64url") !== parts[0]) return null;
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    // The DB clock can be slightly ahead of the route host; DB claim still checks expiry.
    if (!validPayload(payload) || payload.issuedAt > now + 5000 || payload.expiresAt <= now)
      return null;
    return payload;
  } catch {
    return null;
  }
}
