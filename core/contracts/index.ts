// Draft for review. See docs/design/contracts.md and docs/design/realtime.md.
type ParticipantRole = "host" | "member";

type RoomEventPayloads = {
  START_SHOT: { round: number; delayMs: number };
  READY: { ready: boolean };
  SHOT_UPLOADED: { round: number };
  ROOM_CHANGED: undefined;
};

type FrameManifest = {
  // The manifest version format is pending review.
  version: unknown;
  width: number;
  height: number;
  overlay: string;
  slots: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  }[];
};

export type { FrameManifest, ParticipantRole, RoomEventPayloads };
