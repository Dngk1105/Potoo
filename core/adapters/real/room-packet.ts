import type { RoomEvent, RoomEventSender } from "@/core/contracts";

const MAX_PACKET_BYTES = 15 * 1024;
const encoder = new TextEncoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEvent(value: unknown): RoomEvent | undefined {
  if (!isRecord(value)) return;
  const { type, payload } = value;
  if (type === "ROOM_CHANGED") return payload === undefined ? { type } : undefined;
  if (!isRecord(payload)) return;

  switch (type) {
    case "READY":
      if (typeof payload.ready === "boolean") return { type, payload: { ready: payload.ready } };
      break;
    case "SHOT_UPLOADED":
      if (typeof payload.round === "number" && Number.isFinite(payload.round)) {
        return { type, payload: { round: payload.round } };
      }
  }
}

/** Encode an event for reliable LiveKit data delivery. */
export function encodeRoomPacket(event: RoomEvent): Uint8Array<ArrayBuffer> {
  const checked = readEvent(event);
  if (!checked) throw new Error("Invalid room event.");
  const bytes = encoder.encode(JSON.stringify(checked));
  if (bytes.byteLength > MAX_PACKET_BYTES) throw new Error("Room packet exceeds 15 KiB.");
  return bytes;
}

export function encodeSignedStartShot(envelope: string): Uint8Array<ArrayBuffer> {
  if (typeof envelope !== "string" || !envelope) throw new Error("Invalid START_SHOT envelope.");
  const bytes = encoder.encode(JSON.stringify({ type: "SIGNED_START_SHOT", envelope }));
  if (bytes.byteLength > MAX_PACKET_BYTES) throw new Error("Room packet exceeds 15 KiB.");
  return bytes;
}

export function decodeSignedStartShot(bytes: Uint8Array): string | undefined {
  if (bytes.byteLength > MAX_PACKET_BYTES) return;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 2 ||
      value.type !== "SIGNED_START_SHOT" ||
      typeof value.envelope !== "string" ||
      !value.envelope
    )
      return;
    return value.envelope;
  } catch {
    return;
  }
}

/** The sender must come from the LiveKit packet participant, never from the packet body. */
export function decodeRoomPacket(
  bytes: Uint8Array,
  sender: RoomEventSender,
): RoomEvent | undefined {
  if (
    bytes.byteLength > MAX_PACKET_BYTES ||
    !sender?.identity ||
    (sender.role !== "host" && sender.role !== "member")
  )
    return;
  try {
    const event = readEvent(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    return event;
  } catch {
    return;
  }
}
