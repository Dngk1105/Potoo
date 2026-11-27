import { describe, expect, test, vi } from "vitest";
import { createHash, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
vi.mock("server-only", () => ({}));
import {
  signStartShot,
  verifyStartShotSignature,
  loadStartShotEd25519Key,
  wrapStartShotEnvelope,
  verifyStartShotEnvelope,
  type SignedStartShot,
} from "./start-shot-signature";

const key = new Uint8Array(32).fill(7);
const payload: SignedStartShot = {
  version: 1,
  eventId: "10000000-0000-4000-8000-000000000001",
  requestId: "10000000-0000-4000-8000-000000000002",
  roomId: "10000000-0000-4000-8000-000000000003",
  sessionId: "10000000-0000-4000-8000-000000000004",
  hostId: "10000000-0000-4000-8000-000000000005",
  generation: 2,
  round: 1,
  delayMs: 3000,
  issuedAt: 1000,
  expiresAt: 11000,
};

describe("START_SHOT signatures", () => {
  test("v2 uses the published SPKI and domain-separated signature", () => {
    const pair = generateKeyPairSync("ed25519");
    const encoded = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url");
    const ed = loadStartShotEd25519Key(encoded)!;
    const spki = pair.publicKey.export({ type: "spki", format: "der" });
    expect(ed.kid).toBe(createHash("sha256").update(spki).digest("base64url").slice(0, 16));
    expect(ed.encodedPublicKey).toBe(spki.toString("base64url"));
    const hmac = signStartShot(payload, key);
    const token = wrapStartShotEnvelope(hmac, ed);
    const [version, kid, body, signature] = token.split(".");
    expect(version).toBe("2");
    expect(Buffer.from(body, "base64url").toString("utf8")).toBe(hmac);
    expect(
      verify(
        null,
        Buffer.from(`potoo:start-shot:v2:${kid}:${body}`),
        createPublicKey(pair.privateKey),
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    expect(verifyStartShotEnvelope(token, key, ed, 5000)).toEqual(payload);
    expect(verifyStartShotEnvelope(hmac, key, ed, 5000)).toBeNull();
    expect(verifyStartShotEnvelope(token, new Uint8Array(32).fill(8), ed, 5000)).toBeNull();
    for (const index of [1, 2, 3]) {
      const parts = token.split(".");
      parts[index] = (parts[index][0] === "A" ? "B" : "A") + parts[index].slice(1);
      expect(verifyStartShotEnvelope(parts.join("."), key, ed, 5000)).toBeNull();
    }
    expect(verifyStartShotEnvelope(token, key, ed, 11000)).toBeNull();
  });
  test("rejects malformed or wrong-type private keys", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "der" })
      .toString("base64url");
    const ed = generateKeyPairSync("ed25519")
      .privateKey.export({ type: "pkcs8", format: "der" })
      .toString("base64url");
    for (const value of [undefined, "", "bad", ed + "=", rsa])
      expect(loadStartShotEd25519Key(value)).toBeNull();
  });
  test("verifies an intact unexpired envelope", () => {
    const token = signStartShot(payload, key);
    expect(verifyStartShotSignature(token, key, 5000)).toEqual(payload);
  });
  test("rejects tampering, wrong keys and malformed tokens", () => {
    const token = signStartShot(payload, key);
    const [body, signature] = token.split(".");
    const changed = Buffer.from(JSON.stringify({ ...payload, round: 99 })).toString("base64url");
    expect(verifyStartShotSignature(`${changed}.${signature}`, key, 5000)).toBeNull();
    expect(
      verifyStartShotSignature(`${body}.${signature}`, new Uint8Array(32).fill(8), 5000),
    ).toBeNull();
    expect(verifyStartShotSignature(`${body}.${signature}.extra`, key, 5000)).toBeNull();
    expect(verifyStartShotSignature("x".repeat(4097), key, 5000)).toBeNull();
  });
  test("rejects expired, future and invalid payloads", () => {
    const token = signStartShot(payload, key);
    expect(verifyStartShotSignature(token, key, 11000)).toBeNull();
    expect(verifyStartShotSignature(token, key, 999)).toEqual(payload);
    const future = signStartShot({ ...payload, issuedAt: 7000, expiresAt: 11000 }, key);
    expect(verifyStartShotSignature(future, key, 1000)).toBeNull();
    expect(() => signStartShot({ ...payload, delayMs: -1 }, key)).toThrow();
    expect(() => signStartShot({ ...payload, expiresAt: 31001 }, key)).toThrow();
    expect(() => signStartShot(payload, new Uint8Array(31))).toThrow();
  });
});
