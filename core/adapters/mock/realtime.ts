import type {
  ParticipantRole,
  RoomBus,
  RoomEvent,
  RoomEventPayloads,
  RoomEventSender,
  RoomPort,
  Unsubscribe,
} from "@/core/contracts";

export type MockRealtimeOptions = {
  /** Identity of the signed-in user, or a fixture identity for local testing. */
  identity: string;
  /** Read the current host from room state or a fixture shared by the test clients. */
  getHostIdentity: (roomId: string) => string | null;
  /** Notify after the room state used by getHostIdentity changes. */
  onRoomStateChanged?: (roomId: string, listener: () => void) => Unsubscribe;
};

type Connection = {
  roomId: string;
  channel: BroadcastChannel;
  id: string;
  peers: Map<string, string>;
  visibleHost: string | null;
  unsubscribeRoomState?: Unsubscribe;
};

type Delivery = { event: RoomEvent; sender: RoomEventSender };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readEvent(value: unknown): RoomEvent | undefined {
  if (!isRecord(value)) return;

  const { type, payload } = value;
  if (type === "ROOM_CHANGED") return payload === undefined ? { type } : undefined;
  if (!isRecord(payload)) return;

  switch (type) {
    case "START_SHOT": {
      const { round, delayMs } = payload;
      if (isNumber(round) && isNumber(delayMs)) return { type, payload: { round, delayMs } };
      break;
    }
    case "READY":
      if (typeof payload.ready === "boolean") return { type, payload: { ready: payload.ready } };
      break;
    case "SHOT_UPLOADED":
      if (isNumber(payload.round)) return { type, payload: { round: payload.round } };
      break;
  }
}

/** Create one pair per tab or simulated participant. Join and leave through the room port. */
export function createMockRealtime({
  identity,
  getHostIdentity,
  onRoomStateChanged,
}: MockRealtimeOptions): {
  room: RoomPort;
  bus: RoomBus;
} {
  const deliveries = new EventTarget();
  const participantChanges = new EventTarget();
  let connection: Connection | undefined;

  function requireConnection(): Connection {
    if (!connection) throw new Error("Join a room before using mock realtime.");
    return connection;
  }

  function roleOf(roomId: string, participantIdentity: string): ParticipantRole {
    return participantIdentity === getHostIdentity(roomId) ? "host" : "member";
  }

  function hasParticipant(joined: Connection, participantIdentity: string) {
    if (participantIdentity === identity) return true;
    for (const peerIdentity of joined.peers.values()) {
      if (peerIdentity === participantIdentity) return true;
    }
    return false;
  }

  function notifyParticipantsChanged(joined: Connection, membershipChanged: boolean) {
    if (connection !== joined) return;
    const hostIdentity = getHostIdentity(joined.roomId);
    const visibleHost =
      hostIdentity !== null && hasParticipant(joined, hostIdentity) ? hostIdentity : null;
    if (!membershipChanged && joined.visibleHost === visibleHost) return;

    joined.visibleHost = visibleHost;
    participantChanges.dispatchEvent(new Event("change"));
  }

  function announce(joined: Connection, kind: "join" | "present") {
    joined.channel.postMessage({ kind, connectionId: joined.id, identity });
  }

  function receive(joined: Connection, data: unknown) {
    if (connection !== joined || !isRecord(data)) return;

    const { kind, connectionId } = data;
    if (typeof connectionId !== "string" || connectionId === joined.id) return;

    if (kind === "join" || kind === "present") {
      if (typeof data.identity !== "string" || !data.identity) return;
      let added = false;
      if (!joined.peers.has(connectionId)) {
        added = !hasParticipant(joined, data.identity);
        joined.peers.set(connectionId, data.identity);
      }
      // Existing peers announce themselves once so late joiners can discover them.
      if (kind === "join") announce(joined, "present");
      notifyParticipantsChanged(joined, added);
      return;
    }

    if (kind === "leave") {
      const leavingIdentity = joined.peers.get(connectionId);
      joined.peers.delete(connectionId);
      if (leavingIdentity && !hasParticipant(joined, leavingIdentity)) {
        notifyParticipantsChanged(joined, true);
      }
      return;
    }

    if (kind !== "event") return;
    const senderIdentity = joined.peers.get(connectionId);
    const event = readEvent(data.event);
    if (!senderIdentity || !event) return;

    const role = roleOf(joined.roomId, senderIdentity);
    if (event.type === "START_SHOT" && role !== "host") return;

    deliveries.dispatchEvent(
      new CustomEvent<Delivery>(event.type, {
        detail: { event, sender: { identity: senderIdentity, role } },
      }),
    );
  }

  function closeConnection(joined: Connection) {
    try {
      joined.channel.postMessage({ kind: "leave", connectionId: joined.id });
    } finally {
      joined.channel.close();
      joined.unsubscribeRoomState?.();
    }
  }

  function disconnect() {
    const joined = connection;
    if (!joined) return;

    connection = undefined;
    globalThis.window?.removeEventListener("pagehide", disconnect);
    try {
      closeConnection(joined);
    } finally {
      participantChanges.dispatchEvent(new Event("change"));
    }
  }

  const room: RoomPort = {
    async join({ roomId }) {
      if (!roomId || !identity) throw new Error("Mock realtime requires a room and an identity.");
      if (connection?.roomId === roomId) return;

      const joined: Connection = {
        roomId,
        id: crypto.randomUUID(),
        channel: new BroadcastChannel(`potoo:mock-realtime:${roomId}`),
        peers: new Map(),
        visibleHost: null,
      };
      joined.channel.addEventListener("message", (message: MessageEvent<unknown>) => {
        receive(joined, message.data);
      });
      try {
        joined.unsubscribeRoomState = onRoomStateChanged?.(roomId, () => {
          notifyParticipantsChanged(joined, false);
        });
        joined.visibleHost = getHostIdentity(roomId) === identity ? identity : null;
        announce(joined, "join");
      } catch (error) {
        joined.channel.close();
        joined.unsubscribeRoomState?.();
        throw error;
      }
      const previous = connection;
      connection = joined;
      globalThis.window?.addEventListener("pagehide", disconnect);
      try {
        if (previous) closeConnection(previous);
      } finally {
        participantChanges.dispatchEvent(new Event("change"));
      }
    },
    async leave() {
      disconnect();
    },
    participants() {
      if (!connection) return [];

      const hostIdentity = getHostIdentity(connection.roomId);
      const identities = new Set([identity, ...connection.peers.values()]);
      return [...identities].map((participantIdentity) => ({
        identity: participantIdentity,
        attributes: { role: participantIdentity === hostIdentity ? "host" : "member" },
      }));
    },
    onParticipantsChanged(listener) {
      const subscription = () => listener();
      participantChanges.addEventListener("change", subscription);
      return () => participantChanges.removeEventListener("change", subscription);
    },
    async publishTrack() {
      // The mock simulates publication; the caller owns the track and its lifecycle.
      requireConnection();
    },
  };

  const bus: RoomBus = {
    async send(input) {
      const joined = requireConnection();
      const event = readEvent(input);
      if (!event) throw new Error("Invalid room event.");
      if (event.type === "START_SHOT" && roleOf(joined.roomId, identity) !== "host") {
        throw new Error("Only the host can send START_SHOT.");
      }

      // A tab can join just before a send, while its presence exchange is still pending.
      announce(joined, "present");
      joined.channel.postMessage({ kind: "event", connectionId: joined.id, event });
    },
    on(type, listener) {
      const subscription = (message: Event) => {
        // EventTarget dispatches each delivery under its RoomEvent type.
        const { event, sender } = (message as CustomEvent<Delivery>).detail;
        listener(event.payload as RoomEventPayloads[typeof type], sender);
      };
      deliveries.addEventListener(type, subscription);
      return () => deliveries.removeEventListener(type, subscription);
    },
  };

  return { room, bus };
}
