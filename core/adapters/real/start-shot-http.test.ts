import { describe, expect, test, vi } from "vitest";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { createStartShotHttp } from "./start-shot-http";

const roomId = "abcdef00-0000-4000-8000-000000000001";
const payload = {
  sessionId: "10000000-0000-4000-8000-000000000002",
  requestId: "10000000-0000-4000-8000-000000000003",
  round: 1,
  delayMs: 3000,
};
const sender = { identity: "10000000-0000-4000-8000-000000000004", role: "host" as const };

describe("START_SHOT same-origin transport", () => {
  test("preverifies Ed25519, validates room, key and canonical encoding", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const der = publicKey.export({ type: "spki", format: "der" });
    const kid = createHash("sha256").update(der).digest("base64url").slice(0, 16);
    const inner = `${Buffer.from(JSON.stringify({ roomId })).toString("base64url")}.${Buffer.alloc(32).toString("base64url")}`;
    const encoded = Buffer.from(inner).toString("base64url");
    const signature = sign(
      null,
      Buffer.from(`potoo:start-shot:v2:${kid}:${encoded}`),
      privateKey,
    ).toString("base64url");
    const envelope = `2.${kid}.${encoded}.${signature}`;
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ version: 2, kid, publicKey: der.toString("base64url") }));
    const api = createStartShotHttp(fetcher);
    await expect(api.preverifyStartShot(roomId, envelope)).resolves.toBeUndefined();
    await expect(api.preverifyStartShot(roomId.toUpperCase(), envelope)).resolves.toBeUndefined();
    await expect(api.preverifyStartShot(payload.sessionId, envelope)).rejects.toThrow();
    await expect(
      api.preverifyStartShot(
        roomId,
        `2.${kid}.${encoded}.${Buffer.alloc(64).toString("base64url")}`,
      ),
    ).rejects.toThrow();
    await expect(
      api.preverifyStartShot(roomId, `2.${"a".repeat(16)}.${encoded}.${signature}`),
    ).rejects.toThrow();
    await expect(api.preverifyStartShot(roomId, `1.${encoded}.${signature}`)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/start-shot-public-key",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin", redirect: "error" }),
    );
  });

  test("refreshes the trusted key after rotation and rate-limits unknown key IDs", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100000);
    try {
      function fixture() {
        const { publicKey, privateKey } = generateKeyPairSync("ed25519");
        const der = publicKey.export({ type: "spki", format: "der" });
        const kid = createHash("sha256").update(der).digest("base64url").slice(0, 16);
        const inner = `${Buffer.from(JSON.stringify({ roomId })).toString("base64url")}.${Buffer.alloc(32).toString("base64url")}`;
        const encoded = Buffer.from(inner).toString("base64url");
        const signature = sign(
          null,
          Buffer.from(`potoo:start-shot:v2:${kid}:${encoded}`),
          privateKey,
        ).toString("base64url");
        return { kid, der, encoded, signature, envelope: `2.${kid}.${encoded}.${signature}` };
      }
      const first = fixture();
      const second = fixture();
      let current = first;
      const fetcher = vi.fn(async () =>
        Response.json({
          version: 2,
          kid: current.kid,
          publicKey: current.der.toString("base64url"),
        }),
      );
      const api = createStartShotHttp(fetcher);
      await api.preverifyStartShot(roomId, first.envelope);
      current = second;
      await api.preverifyStartShot(roomId, second.envelope);
      expect(fetcher).toHaveBeenCalledTimes(2);
      const unknown = `2.${"a".repeat(16)}.${second.encoded}.${second.signature}`;
      await expect(api.preverifyStartShot(roomId, unknown)).rejects.toThrow(
        "Unknown START_SHOT key",
      );
      await expect(api.preverifyStartShot(roomId, unknown)).rejects.toThrow(
        "Unknown START_SHOT key",
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
      clock.mockReturnValue(105000);
      await expect(api.preverifyStartShot(roomId, unknown)).rejects.toThrow(
        "Unknown START_SHOT key",
      );
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      clock.mockRestore();
    }
  });

  test("keeps the cached trusted key when an unknown-key refresh fails", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const der = publicKey.export({ type: "spki", format: "der" });
    const kid = createHash("sha256").update(der).digest("base64url").slice(0, 16);
    const inner = `${Buffer.from(JSON.stringify({ roomId })).toString("base64url")}.${Buffer.alloc(32).toString("base64url")}`;
    const encoded = Buffer.from(inner).toString("base64url");
    const signature = sign(
      null,
      Buffer.from(`potoo:start-shot:v2:${kid}:${encoded}`),
      privateKey,
    ).toString("base64url");
    const valid = `2.${kid}.${encoded}.${signature}`;
    const unknown = `2.${"a".repeat(16)}.${encoded}.${signature}`;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ version: 2, kid, publicKey: der.toString("base64url") }),
      )
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    const api = createStartShotHttp(fetcher);
    await api.preverifyStartShot(roomId, valid);
    await expect(api.preverifyStartShot(roomId, unknown)).rejects.toThrow("network unavailable");
    await expect(api.preverifyStartShot(roomId, valid)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("backs off failed key fetches and recovers without repeated requests", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100000);
    try {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const der = publicKey.export({ type: "spki", format: "der" });
      const kid = createHash("sha256").update(der).digest("base64url").slice(0, 16);
      const inner = `${Buffer.from(JSON.stringify({ roomId })).toString("base64url")}.${Buffer.alloc(32).toString("base64url")}`;
      const encoded = Buffer.from(inner).toString("base64url");
      const signature = sign(
        null,
        Buffer.from(`potoo:start-shot:v2:${kid}:${encoded}`),
        privateKey,
      ).toString("base64url");
      const envelope = `2.${kid}.${encoded}.${signature}`;
      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("network unavailable"))
        .mockResolvedValueOnce(
          Response.json({ version: 2, kid, publicKey: der.toString("base64url") }),
        );
      const api = createStartShotHttp(fetcher);
      await expect(api.preverifyStartShot(roomId, envelope)).rejects.toThrow("network unavailable");
      await expect(api.preverifyStartShot(roomId, envelope)).rejects.toThrow(
        "temporarily unavailable",
      );
      expect(fetcher).toHaveBeenCalledOnce();
      clock.mockReturnValue(105000);
      await expect(api.preverifyStartShot(roomId, envelope)).resolves.toBeUndefined();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });

  test("fails closed when Ed25519 is unsupported", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const der = publicKey.export({ type: "spki", format: "der" });
    const kid = createHash("sha256").update(der).digest("base64url").slice(0, 16);
    const api = createStartShotHttp(
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ version: 2, kid, publicKey: der.toString("base64url") }),
        ),
    );
    const spy = vi
      .spyOn(crypto.subtle, "importKey")
      .mockRejectedValueOnce(new Error("unsupported"));
    await expect(
      api.preverifyStartShot(roomId, `2.${kid}.eA.${Buffer.alloc(64).toString("base64url")}`),
    ).rejects.toThrow("unsupported");
    spy.mockRestore();
  });
  test("selects a session and issues using the original request ID", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ envelope: "signed" }));
    const api = createStartShotHttp(fetcher);
    await api.selectSession(roomId, payload.sessionId);
    expect(await api.issueStartShot(roomId, payload)).toBe("signed");
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `/api/rooms/${roomId}/shot-session`,
      expect.objectContaining({ method: "PUT", credentials: "same-origin" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `/api/rooms/${roomId}/start-shot`,
      expect.objectContaining({ method: "POST", cache: "no-store", body: JSON.stringify(payload) }),
    );
  });
  test("returns only a valid server verification", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ payload, sender }));
    expect(await createStartShotHttp(fetcher).verifyStartShot(roomId, "signed")).toEqual({
      payload,
      sender,
    });
  });
  test("retries a lost claim response with the same claimRequestId", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce(Response.json({ payload, sender }));
    const api = createStartShotHttp(fetcher);
    expect(await api.verifyStartShot(roomId, "signed")).toEqual({ payload, sender });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    const second = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(first).toEqual(second);
    expect(first.claimRequestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test("does not retry a replay rejection", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    await expect(createStartShotHttp(fetcher).verifyStartShot(roomId, "signed")).rejects.toThrow(
      "409",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  test("rejects HTTP errors and forged or malformed responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ payload, sender: { ...sender, role: "member" } }));
    const api = createStartShotHttp(fetcher);
    await expect(api.issueStartShot(roomId, payload)).rejects.toThrow("403");
    await expect(api.verifyStartShot(roomId, "signed")).rejects.toThrow(
      "Invalid START_SHOT verification",
    );
    await expect(api.verifyStartShot("../../invalid", "signed")).rejects.toThrow("Invalid room ID");
  });
});
