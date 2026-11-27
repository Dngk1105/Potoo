import { Room, RoomEvent as LiveKitEvent, type Participant } from "livekit-client";
import type {
  RoomBus,
  RoomEvent,
  RoomEventPayloads,
  RoomEventSender,
  RoomParticipant,
  RoomPort,
} from "@/core/contracts";
import {
  decodeRoomPacket,
  encodeRoomPacket,
  decodeSignedStartShot,
  encodeSignedStartShot,
} from "./room-packet";

/** The token endpoint is not specified yet; the caller supplies server-issued credentials. */
export type RealRealtimeOptions = {
  getCredentials: (roomId: string) => Promise<{ url: string; token: string }>;
  issueStartShot?: (roomId: string, payload: RoomEventPayloads["START_SHOT"]) => Promise<string>;
  preverifyStartShot?: (roomId: string, envelope: string) => Promise<void>;
  verifyStartShot?: (
    roomId: string,
    envelope: string,
  ) => Promise<{ payload: RoomEventPayloads["START_SHOT"]; sender: RoomEventSender }>;
};

function verifiedShot(
  value: unknown,
): { payload: RoomEventPayloads["START_SHOT"]; sender: RoomEventSender } | undefined {
  if (!value || typeof value !== "object") return;
  const { payload, sender } = value as { payload?: unknown; sender?: unknown };
  if (!payload || typeof payload !== "object" || !sender || typeof sender !== "object") return;
  const p = payload as Record<string, unknown>;
  const s = sender as Record<string, unknown>;
  if (
    typeof p.sessionId !== "string" ||
    !p.sessionId ||
    typeof p.requestId !== "string" ||
    !p.requestId ||
    typeof p.round !== "number" ||
    !Number.isFinite(p.round) ||
    typeof p.delayMs !== "number" ||
    !Number.isFinite(p.delayMs) ||
    typeof s.identity !== "string" ||
    !s.identity ||
    s.role !== "host"
  )
    return;
  return {
    payload: { sessionId: p.sessionId, requestId: p.requestId, round: p.round, delayMs: p.delayMs },
    sender: { identity: s.identity, role: "host" },
  };
}

function participantSnapshot(participant: Participant): RoomParticipant | undefined {
  const role = participant.attributes.role;
  if (role !== "host" && role !== "member") return;
  return { identity: participant.identity, attributes: { ...participant.attributes, role } };
}

/** Create a room and bus sharing one LiveKit connection. */
export function createRealRealtime({
  getCredentials,
  issueStartShot,
  preverifyStartShot,
  verifyStartShot,
}: RealRealtimeOptions): {
  room: RoomPort;
  bus: RoomBus;
} {
  let active: Room | undefined;
  let activeRoomId: string | undefined;
  let generation = 0;
  let pendingTransitions = 0;
  let pendingVerifications = 0;
  const claimStates = new WeakMap<
    Room,
    { pending: Map<string, Promise<boolean>>; delivered: Set<string> }
  >();
  const isCurrent = (connection: Room, roomId: string, version: number) =>
    pendingTransitions === 0 &&
    active === connection &&
    activeRoomId === roomId &&
    generation === version;
  async function claim(connection: Room, roomId: string, version: number, envelope: string) {
    if (!verifyStartShot || pendingVerifications >= 16 || !isCurrent(connection, roomId, version))
      return false;
    pendingVerifications++;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = verifiedShot(
        await Promise.race([
          verifyStartShot(roomId, envelope),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("START_SHOT verification timed out")),
              8000,
            );
          }),
        ]),
      );
      if (!result || !isCurrent(connection, roomId, version)) return false;
      deliveries.dispatchEvent(
        new CustomEvent("START_SHOT", {
          detail: { event: { type: "START_SHOT", payload: result.payload }, sender: result.sender },
        }),
      );
      return true;
    } catch {
      // Verification and claim failures never dispatch an event.
      return false;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      pendingVerifications--;
    }
  }
  function claimOnce(
    connection: Room,
    roomId: string,
    version: number,
    envelope: string,
  ): Promise<boolean> {
    const state = claimStates.get(connection);
    if (!state || !isCurrent(connection, roomId, version)) return Promise.resolve(false);
    if (state.delivered.has(envelope)) return Promise.resolve(true);
    const existing = state.pending.get(envelope);
    if (existing) return existing;
    const pending = claim(connection, roomId, version, envelope)
      .then((success) => {
        if (success && isCurrent(connection, roomId, version)) {
          state.delivered.add(envelope);
          if (state.delivered.size > 256)
            state.delivered.delete(state.delivered.values().next().value!);
        }
        return success;
      })
      .finally(() => {
        state.pending.delete(envelope);
      });
    state.pending.set(envelope, pending);
    return pending;
  }
  let operations = Promise.resolve();
  const changes = new Set<() => void>();
  const trackChanges = new Set<() => void>();
  const deliveries = new EventTarget();
  const notify = () => changes.forEach((listener) => listener());
  const notifyTracks = () => trackChanges.forEach((listener) => listener());
  const enqueue = (operation: () => Promise<void>) => {
    const result = operations.then(operation);
    operations = result.catch(() => {});
    return result;
  };
  function requireRoom(): Room {
    if (!active) throw new Error("Join a room before using realtime.");
    return active;
  }
  function bind(connection: Room) {
    let preverifyTail: Promise<void> = Promise.resolve();
    let claimTail: Promise<void> = Promise.resolve();
    let queuedClaims = 0;
    let pendingPreverifications = 0;
    let waitingPackets = 0;
    const queuedEnvelopes = new Set<string>();
    const state = { pending: new Map<string, Promise<boolean>>(), delivered: new Set<string>() };
    claimStates.set(connection, state);
    const changed = () => {
      if (active === connection) notify();
    };
    connection.on(LiveKitEvent.ParticipantConnected, changed);
    connection.on(LiveKitEvent.ParticipantDisconnected, () => {
      changed();
      if (active === connection) notifyTracks();
    });
    connection.on(LiveKitEvent.ParticipantAttributesChanged, changed);
    connection.on(LiveKitEvent.Reconnected, () => {
      changed();
      if (active === connection) notifyTracks();
    });
    connection.on(LiveKitEvent.TrackSubscribed, () => {
      if (active === connection) notifyTracks();
    });
    connection.on(LiveKitEvent.TrackUnsubscribed, () => {
      if (active === connection) notifyTracks();
    });
    connection.on(LiveKitEvent.Disconnected, () => {
      if (active !== connection) return;
      active = undefined;
      activeRoomId = undefined;
      generation++;
      notify();
      notifyTracks();
    });
    connection.on(LiveKitEvent.DataReceived, (packet, participant) => {
      if (active !== connection || !activeRoomId || pendingTransitions > 0) return;
      const envelope = decodeSignedStartShot(packet);
      if (envelope) {
        if (
          !preverifyStartShot ||
          !verifyStartShot ||
          pendingPreverifications >= 32 ||
          waitingPackets >= 32 ||
          queuedEnvelopes.has(envelope) ||
          state.pending.has(envelope) ||
          state.delivered.has(envelope)
        )
          return;
        const roomId = activeRoomId;
        const version = generation;
        pendingPreverifications++;
        waitingPackets++;
        const verification = Promise.resolve()
          .then(() => preverifyStartShot(roomId, envelope))
          .then(
            () => true,
            () => false,
          )
          .finally(() => {
            pendingPreverifications--;
          });
        let timer: ReturnType<typeof setTimeout>;
        const bounded = Promise.race([
          verification,
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), 8000);
          }),
        ]).finally(() => clearTimeout(timer));
        preverifyTail = preverifyTail
          .then(async () => {
            if (
              !(await bounded) ||
              !isCurrent(connection, roomId, version) ||
              queuedEnvelopes.has(envelope) ||
              state.pending.has(envelope) ||
              state.delivered.has(envelope)
            )
              return;
            if (queuedClaims >= 16 || pendingVerifications >= 16) return;
            queuedEnvelopes.add(envelope);
            queuedClaims++;
            claimTail = claimTail
              .then(async () => {
                await claimOnce(connection, roomId, version, envelope);
              })
              .finally(() => {
                queuedEnvelopes.delete(envelope);
                queuedClaims--;
              });
          })
          .finally(() => {
            waitingPackets--;
          });
        return;
      }
      if (!participant) return;
      const source = participantSnapshot(participant);
      if (!source) return;
      const sender: RoomEventSender = { identity: source.identity, role: source.attributes.role };
      const event = decodeRoomPacket(packet, sender);
      if (event)
        deliveries.dispatchEvent(new CustomEvent(event.type, { detail: { event, sender } }));
    });
  }
  const room: RoomPort = {
    join({ roomId }) {
      const transition = roomId !== activeRoomId || pendingTransitions > 0;
      if (transition) {
        generation++;
        pendingTransitions++;
      }
      const result = enqueue(async () => {
        if (!roomId) throw new Error("A room ID is required.");
        if (active && activeRoomId === roomId) return;
        const { url, token } = await getCredentials(roomId);
        const connection = new Room({
          adaptiveStream: true,
          dynacast: true,
          stopLocalTrackOnUnpublish: false,
        });
        bind(connection);
        try {
          await connection.connect(url, token);
        } catch (error) {
          await connection.disconnect(false);
          throw error;
        }
        const previous = active;
        active = connection;
        activeRoomId = roomId;
        try {
          if (previous) await previous.disconnect(false);
        } finally {
          notify();
          notifyTracks();
        }
      });
      return result.finally(() => {
        if (transition) pendingTransitions--;
      });
    },
    leave() {
      generation++;
      pendingTransitions++;
      const result = enqueue(async () => {
        const connection = active;
        if (!connection) return;
        active = undefined;
        activeRoomId = undefined;
        try {
          await connection.disconnect(false);
        } finally {
          notify();
          notifyTracks();
        }
      });
      return result.finally(() => {
        pendingTransitions--;
      });
    },
    participants() {
      if (!active) return [];
      return [active.localParticipant, ...active.remoteParticipants.values()]
        .map(participantSnapshot)
        .filter((participant): participant is RoomParticipant => participant !== undefined);
    },
    onParticipantsChanged(listener) {
      const subscription = () => listener();
      changes.add(subscription);
      return () => {
        changes.delete(subscription);
      };
    },
    remoteTracks() {
      if (!active) return [];
      return [...active.remoteParticipants.values()].flatMap((participant) =>
        [...participant.trackPublications.values()].flatMap((publication) => {
          const remoteTrack = publication.track;
          if (!remoteTrack) return [];
          return [
            {
              participantIdentity: participant.identity,
              trackId: publication.trackSid,
              track: remoteTrack.mediaStreamTrack,
              attach: (element: HTMLMediaElement) => {
                remoteTrack.attach(element);
              },
              detach: (element: HTMLMediaElement) => {
                remoteTrack.detach(element);
              },
            },
          ];
        }),
      );
    },
    onRemoteTracksChanged(listener) {
      trackChanges.add(listener);
      return () => trackChanges.delete(listener);
    },
    async publishTrack(track) {
      await requireRoom().localParticipant.publishTrack(track);
    },
  };
  const bus: RoomBus = {
    async send(event) {
      const connection = requireRoom();
      if (event.type === "START_SHOT") {
        if (!issueStartShot || !preverifyStartShot || !verifyStartShot || !activeRoomId)
          throw new Error("START_SHOT requires server authorization.");
        const roomId = activeRoomId;
        const version = generation;
        const envelope = await issueStartShot(roomId, event.payload);
        if (!isCurrent(connection, roomId, version)) throw new Error("Room connection changed.");
        await preverifyStartShot(roomId, envelope);
        if (!isCurrent(connection, roomId, version)) throw new Error("Room connection changed.");
        const packet = encodeSignedStartShot(envelope);
        await connection.localParticipant.publishData(packet, { reliable: true });
        if (!isCurrent(connection, roomId, version)) throw new Error("Room connection changed.");
        if (!(await claimOnce(connection, roomId, version, envelope))) {
          throw new Error("START_SHOT local verification failed after publish.");
        }
        return;
      }
      await connection.localParticipant.publishData(encodeRoomPacket(event), { reliable: true });
    },
    on(type, listener) {
      const subscription = (message: Event) => {
        const { event, sender } = (
          message as CustomEvent<{ event: RoomEvent; sender: RoomEventSender }>
        ).detail;
        listener(event.payload as RoomEventPayloads[typeof type], sender);
      };
      deliveries.addEventListener(type, subscription);
      return () => deliveries.removeEventListener(type, subscription);
    },
  };
  return { room, bus };
}
