import { expectTypeOf, test } from "vitest";
import type { FrameManifest, ParticipantRole, RoomEventPayloads } from "./index";

test("participant roles match the realtime design", () => {
  expectTypeOf<ParticipantRole>().toEqualTypeOf<"host" | "member">();
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

test("frame manifests expose the documented canvas and slot fields", () => {
  expectTypeOf<FrameManifest>().toEqualTypeOf<{
    version: unknown;
    width: number;
    height: number;
    overlay: string;
    slots: { x: number; y: number; width: number; height: number; radius: number }[];
  }>();
});
