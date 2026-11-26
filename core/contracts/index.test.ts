import { expectTypeOf, test } from "vitest";
import type {
  AuthPort,
  AuthUser,
  FrameManifest,
  ParticipantRole,
  RoomBus,
  RoomEventPayloads,
  RoomEventSender,
  RoomParticipant,
  RoomPort,
  StoragePort,
} from "./index";

test("participant roles match the realtime design", () => {
  expectTypeOf<ParticipantRole>().toEqualTypeOf<"host" | "member">();
  expectTypeOf<RoomParticipant["attributes"]["role"]>().toEqualTypeOf<ParticipantRole>();
  expectTypeOf<RoomPort["publishTrack"]>().parameters.toEqualTypeOf<[MediaStreamTrack]>();
});

test("room events expose only the documented payloads", () => {
  expectTypeOf<keyof RoomEventPayloads>().toEqualTypeOf<
    "START_SHOT" | "READY" | "SHOT_UPLOADED" | "ROOM_CHANGED"
  >();
  expectTypeOf<RoomEventPayloads["START_SHOT"]>().toEqualTypeOf<{
    round: number;
    delayMs: number;
  }>();
  expectTypeOf<RoomEventPayloads["READY"]>().toEqualTypeOf<{ ready: boolean }>();
  expectTypeOf<RoomEventPayloads["SHOT_UPLOADED"]>().toEqualTypeOf<{ round: number }>();
  expectTypeOf<RoomEventPayloads["ROOM_CHANGED"]>().toEqualTypeOf<undefined>();
});

test("RoomBus keeps sender metadata separate and pairs each event with its payload", () => {
  type OutboundEvent = Parameters<RoomBus["send"]>[0];

  expectTypeOf<{ type: "ROOM_CHANGED" }>().toExtend<OutboundEvent>();
  expectTypeOf<{
    type: "ROOM_CHANGED";
    payload: { ready: boolean };
  }>().not.toExtend<OutboundEvent>();
  expectTypeOf<{ type: "START_SHOT"; payload: { ready: boolean } }>().not.toExtend<OutboundEvent>();
  expectTypeOf<Extract<OutboundEvent, { type: "START_SHOT" }>>().not.toHaveProperty("sender");

  function subscribe(bus: RoomBus) {
    return bus.on("START_SHOT", (payload, sender) => {
      expectTypeOf(payload).toEqualTypeOf<RoomEventPayloads["START_SHOT"]>();
      expectTypeOf(sender).toEqualTypeOf<RoomEventSender>();
      expectTypeOf(payload).not.toHaveProperty("role");
    });
  }

  expectTypeOf(subscribe).returns.toEqualTypeOf<() => void>();
});

test("auth subscriptions report signed-in and signed-out users and can be cancelled", () => {
  type Listener = Parameters<AuthPort["onChange"]>[0];

  expectTypeOf<Listener>().parameters.toEqualTypeOf<[AuthUser | null]>();
  expectTypeOf<AuthPort["onChange"]>().returns.toEqualTypeOf<() => void>();
});

test("storage operations expose a consistent failure result", () => {
  type Failure = { ok: false; error: { message: string; code?: string } };

  expectTypeOf<
    Extract<Awaited<ReturnType<StoragePort["upload"]>>, { ok: false }>
  >().toEqualTypeOf<Failure>();
  expectTypeOf<
    Extract<Awaited<ReturnType<StoragePort["getUrl"]>>, { ok: false }>
  >().toEqualTypeOf<Failure>();
  expectTypeOf<
    Extract<Awaited<ReturnType<StoragePort["remove"]>>, { ok: false }>
  >().toEqualTypeOf<Failure>();
});

test("frame manifests expose the documented canvas and slot fields", () => {
  expectTypeOf<FrameManifest>().toEqualTypeOf<{
    version: 1;
    width: number;
    height: number;
    overlay: string;
    slots: { x: number; y: number; width: number; height: number; radius: number }[];
  }>();
});
