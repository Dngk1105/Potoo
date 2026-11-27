import { describe, expect, it } from "vitest";
import type { RoomEvent } from "@/core/contracts";
import {
  decodeRoomPacket,
  encodeRoomPacket,
  decodeSignedStartShot,
  encodeSignedStartShot,
} from "./room-packet";

const host = { identity: "host", role: "host" } as const;
const member = { identity: "member", role: "member" } as const;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("room packet codec", () => {
  it.each<RoomEvent>([
    { type: "READY", payload: { ready: true } },
    { type: "SHOT_UPLOADED", payload: { round: 2 } },
    { type: "ROOM_CHANGED" },
  ])("round trips $type", (event) => {
    expect(decodeRoomPacket(encodeRoomPacket(event), host)).toEqual(event);
  });

  it("rejects legacy START_SHOT and accepts only a bounded signed envelope", () => {
    const packet = bytes({ type: "START_SHOT", payload: { round: 1, delayMs: 1 }, sender: host });
    expect(decodeRoomPacket(packet, member)).toBeUndefined();
    expect(decodeRoomPacket(packet, host)).toBeUndefined();
    expect(decodeSignedStartShot(encodeSignedStartShot("signed"))).toBe("signed");
    expect(
      decodeSignedStartShot(bytes({ type: "SIGNED_START_SHOT", envelope: "signed", sender: host })),
    ).toBeUndefined();
    expect(decodeSignedStartShot(new Uint8Array(15 * 1024 + 1))).toBeUndefined();
    expect(() => encodeSignedStartShot("x".repeat(15 * 1024))).toThrow();
  });

  it("accepts member events and requires a valid transport sender", () => {
    const packet = encodeRoomPacket({ type: "READY", payload: { ready: false } });
    expect(decodeRoomPacket(packet, member)).toEqual({ type: "READY", payload: { ready: false } });
    expect(decodeRoomPacket(packet, { identity: "", role: "host" })).toBeUndefined();
    expect(decodeRoomPacket(packet, { identity: "x", role: "other" } as never)).toBeUndefined();
  });

  it("ignores malformed, oversized, unknown and invalid packets", () => {
    for (const packet of [
      new Uint8Array([0xff]),
      new TextEncoder().encode("{"),
      new Uint8Array(15 * 1024 + 1),
      bytes({ type: "OTHER" }),
      bytes({ type: "ROOM_CHANGED", payload: {} }),
      bytes({ type: "READY", payload: { ready: "yes" } }),
      bytes({ type: "START_SHOT", payload: { round: null, delayMs: 1 } }),
    ])
      expect(decodeRoomPacket(packet, host)).toBeUndefined();
    expect(() => encodeRoomPacket({ type: "READY", payload: { ready: 1 } } as never)).toThrow();
  });
});
