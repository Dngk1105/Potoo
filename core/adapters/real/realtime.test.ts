import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
let createRealRealtime: typeof import("./realtime").createRealRealtime;
import { encodeSignedStartShot } from "./room-packet";

const sdk = vi.hoisted(() => ({
  rooms: [] as MockRoom[],
  connectError: undefined as Error | undefined,
}));
class MockRoom extends EventEmitter {
  localParticipant = {
    identity: "local",
    attributes: { role: "host" },
    publishData: vi.fn().mockResolvedValue(undefined),
    publishTrack: vi.fn().mockResolvedValue(undefined),
  };
  remoteParticipants = new Map();
  connect = vi.fn().mockImplementation(async () => {
    if (sdk.connectError) throw sdk.connectError;
  });
  disconnect = vi.fn().mockImplementation(async () => {
    this.emit("disconnected");
  });
  constructor(readonly options: unknown) {
    super();
    sdk.rooms.push(this);
  }
}
vi.doMock("livekit-client", () => ({
  Room: MockRoom,
  RoomEvent: {
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    ParticipantAttributesChanged: "participantAttributesChanged",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    Reconnected: "reconnected",
    Disconnected: "disconnected",
    DataReceived: "dataReceived",
  },
}));

beforeAll(async () => {
  ({ createRealRealtime } = await import("./realtime"));
});

beforeEach(() => {
  sdk.rooms.length = 0;
  sdk.connectError = undefined;
});

describe("real realtime", () => {
  it("connects once, shares reliable data and preserves caller-owned tracks", async () => {
    const getCredentials = vi.fn().mockResolvedValue({ url: "wss://example.test", token: "token" });
    const { room, bus } = createRealRealtime({ getCredentials });
    const track = {} as MediaStreamTrack;
    await expect(bus.send({ type: "ROOM_CHANGED" })).rejects.toThrow();
    await room.join({ roomId: "one" });
    await room.join({ roomId: "one" });
    const connection = sdk.rooms[0];
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(connection.options).toEqual({
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: false,
    });
    expect(connection.connect).toHaveBeenCalledWith("wss://example.test", "token");
    await room.publishTrack(track);
    expect(connection.localParticipant.publishTrack).toHaveBeenCalledWith(track);
    await bus.send({ type: "READY", payload: { ready: true } });
    expect(connection.localParticipant.publishData).toHaveBeenCalledWith(expect.any(Uint8Array), {
      reliable: true,
    });
    await room.leave();
    expect(connection.disconnect).toHaveBeenCalledWith(false);
    expect(room.participants()).toEqual([]);
  });

  it("updates snapshots on membership, role changes and disconnect", async () => {
    const { room } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
    });
    const listener = vi.fn();
    const unsubscribe = room.onParticipantsChanged(listener);
    await room.join({ roomId: "one" });
    const connection = sdk.rooms[0];
    const remote = { identity: "peer", attributes: { role: "member" } };
    connection.remoteParticipants.set("peer", remote);
    connection.emit("participantConnected", remote);
    remote.attributes.role = "host";
    connection.emit("participantAttributesChanged", { role: "host" }, remote);
    expect(room.participants()).toEqual([
      { identity: "local", attributes: { role: "host" } },
      { identity: "peer", attributes: { role: "host" } },
    ]);
    expect(listener).toHaveBeenCalledTimes(3);
    connection.emit("disconnected");
    expect(room.participants()).toEqual([]);
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("exposes subscribed remote tracks and notifies on removal and leave", async () => {
    const { room } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
    });
    const listener = vi.fn();
    const unsubscribe = room.onRemoteTracksChanged(listener);
    await room.join({ roomId: "one" });
    const connection = sdk.rooms[0];
    const track = {} as MediaStreamTrack;
    const attach = vi.fn();
    const detach = vi.fn();
    const publications = new Map([
      ["track-1", { trackSid: "track-1", track: { mediaStreamTrack: track, attach, detach } }],
    ]);
    connection.remoteParticipants.set("peer", {
      identity: "peer",
      trackPublications: publications,
    });
    connection.emit("trackSubscribed");
    const snapshot = room.remoteTracks();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ participantIdentity: "peer", trackId: "track-1", track });
    const element = {} as HTMLMediaElement;
    snapshot[0].attach(element);
    snapshot[0].detach(element);
    expect(attach).toHaveBeenCalledExactlyOnceWith(element);
    expect(detach).toHaveBeenCalledExactlyOnceWith(element);
    publications.clear();
    connection.emit("trackUnsubscribed");
    expect(room.remoteTracks()).toEqual([]);
    await room.leave();
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
  });

  it("issues, publishes and claims locally; receiver trusts only verification", async () => {
    const payload = { sessionId: "session", requestId: "request", round: 1, delayMs: 10 };
    const sender = { identity: "server-host", role: "host" as const };
    const issueStartShot = vi.fn().mockResolvedValue("signed");
    const verifyStartShot = vi.fn().mockResolvedValue({ payload, sender });
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      issueStartShot,
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const handler = vi.fn();
    const unsubscribe = bus.on("START_SHOT", handler);
    await bus.send({ type: "START_SHOT", payload });
    expect(issueStartShot).toHaveBeenCalledWith("one", payload);
    expect(sdk.rooms[0].localParticipant.publishData).toHaveBeenCalledWith(
      encodeSignedStartShot("signed"),
      { reliable: true },
    );
    expect(handler).toHaveBeenCalledWith(payload, sender);
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("signed"), {
      identity: "forged",
      attributes: { role: "member" },
    });
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("signed"), undefined);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(verifyStartShot).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
    unsubscribe();
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("signed"), undefined);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(verifyStartShot).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("retries a previously verified packet when its claim failed temporarily", async () => {
    const payload = { sessionId: "s", requestId: "r", round: 1, delayMs: 10 };
    const verifyStartShot = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValueOnce({ payload, sender: { identity: "host", role: "host" } });
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const listener = vi.fn();
    bus.on("START_SHOT", listener);
    const packet = encodeSignedStartShot("retryable");
    sdk.rooms[0].emit("dataReceived", packet);
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => setImmediate(resolve));
    sdk.rooms[0].emit("dataReceived", packet);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
    expect(verifyStartShot).toHaveBeenCalledTimes(2);
    await room.leave();
  });

  it("coalesces a replay competing with the host local claim", async () => {
    const payload = { sessionId: "s", requestId: "r", round: 1, delayMs: 10 };
    let finish!: (value: unknown) => void;
    const verifyStartShot = vi.fn(
      () =>
        new Promise<never>((resolve) => {
          finish = resolve as (value: unknown) => void;
        }),
    );
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      issueStartShot: async () => "signed",
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const listener = vi.fn();
    bus.on("START_SHOT", listener);
    sdk.rooms[0].localParticipant.publishData.mockImplementationOnce(async (packet: Uint8Array) => {
      sdk.rooms[0].emit("dataReceived", packet);
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
    const sending = bus.send({ type: "START_SHOT", payload });
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledOnce());
    finish({ payload, sender: { identity: "host", role: "host" } });
    await expect(sending).resolves.toBeUndefined();
    expect(listener).toHaveBeenCalledOnce();
    expect(verifyStartShot).toHaveBeenCalledOnce();
    await room.leave();
  });

  it("reports a local verification failure after publish without dispatching", async () => {
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      issueStartShot: async () => "signed",
      preverifyStartShot: async () => {},
      verifyStartShot: async () => {
        throw new Error("unavailable");
      },
    });
    await room.join({ roomId: "one" });
    const handler = vi.fn();
    bus.on("START_SHOT", handler);
    await expect(
      bus.send({
        type: "START_SHOT",
        payload: { sessionId: "s", requestId: "r", round: 1, delayMs: 10 },
      }),
    ).rejects.toThrow("local verification failed after publish");
    expect(sdk.rooms[0].localParticipant.publishData).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails closed without callbacks and drops late or invalid claims", async () => {
    const payload = { sessionId: "session", requestId: "request", round: 1, delayMs: 10 };
    let resolve!: (value: unknown) => void;
    const verifyStartShot = vi.fn(
      () =>
        new Promise<never>((done) => {
          resolve = done as (value: unknown) => void;
        }),
    );
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    await expect(bus.send({ type: "START_SHOT", payload })).rejects.toThrow(
      "requires server authorization",
    );
    const handler = vi.fn();
    bus.on("START_SHOT", handler);
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("signed"), undefined);
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledOnce());
    await room.leave();
    await room.join({ roomId: "one" });
    resolve({ payload, sender: { identity: "host", role: "host" } });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects malformed verification results, failures and limits concurrent claims", async () => {
    const payload = { sessionId: "s", requestId: "r", round: 1, delayMs: 10 };
    const verifyStartShot = vi
      .fn()
      .mockResolvedValueOnce({ payload, sender: { identity: "x", role: "member" } })
      .mockResolvedValueOnce({
        payload: { ...payload, delayMs: NaN },
        sender: { identity: "x", role: "host" },
      })
      .mockRejectedValueOnce(new Error("replay"))
      .mockImplementation(() => new Promise(() => {}));
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const handler = vi.fn();
    bus.on("START_SHOT", handler);
    for (let i = 0; i < 3; i++)
      sdk.rooms[0].emit("dataReceived", encodeSignedStartShot(`signed-${i}`));
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledTimes(3));
    await Promise.resolve();
    for (let i = 0; i < 30; i++)
      sdk.rooms[0].emit("dataReceived", encodeSignedStartShot(`more-${i}`));
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledTimes(4));
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not mark a verified packet as replay when claim capacity is full", async () => {
    const payload = { sessionId: "s", requestId: "r", round: 1, delayMs: 10 };
    const sender = { identity: "host", role: "host" as const };
    const pending: Array<(value: { payload: typeof payload; sender: typeof sender }) => void> = [];
    const verifyStartShot = vi.fn(
      () =>
        new Promise<{ payload: typeof payload; sender: typeof sender }>((resolve) =>
          pending.push(resolve),
        ),
    );
    let sequence = 0;
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      issueStartShot: async () => `local-${sequence++}`,
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const sends = Array.from({ length: 16 }, (_, index) =>
      bus.send({ type: "START_SHOT", payload: { ...payload, requestId: `r-${index}` } }),
    );
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledTimes(16));
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("received"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(verifyStartShot).toHaveBeenCalledTimes(16);
    pending[0]({ payload, sender });
    await sends[0];
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("received"));
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledTimes(17));
    for (const resolve of pending.slice(1)) resolve({ payload, sender });
    await Promise.all(sends);
    await room.leave();
  });

  it("drops invalid packets before claiming and bounds local work", async () => {
    const verifyStartShot = vi.fn();
    const preverifyStartShot = vi.fn(async (_room: string, envelope: string) => {
      if (envelope.startsWith("bad")) throw new Error("invalid");
    });
    const { room } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot,
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    for (let i = 0; i < 50; i++)
      sdk.rooms[0].emit("dataReceived", encodeSignedStartShot(`bad-${i}`));
    await vi.waitFor(() => expect(preverifyStartShot).toHaveBeenCalledTimes(32));
    expect(verifyStartShot).not.toHaveBeenCalled();
    await room.leave();
  });

  it("does not let rejected signatures fill the claim queue behind a slow claim", async () => {
    let finishClaim!: (value: unknown) => void;
    const payload = { sessionId: "s", requestId: "r", round: 1, delayMs: 10 };
    const preverifyStartShot = vi.fn(async (_room: string, envelope: string) => {
      if (envelope.startsWith("bad")) throw new Error("invalid signature");
    });
    const verifyStartShot = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishClaim = resolve;
          }),
      )
      .mockResolvedValueOnce({
        payload: { ...payload, requestId: "r2", round: 2 },
        sender: { identity: "host", role: "host" },
      });
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot,
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const listener = vi.fn();
    bus.on("START_SHOT", listener);
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("valid-1"));
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledOnce());
    for (let i = 0; i < 32; i++)
      sdk.rooms[0].emit("dataReceived", encodeSignedStartShot(`bad-${i}`));
    await vi.waitFor(() => expect(preverifyStartShot).toHaveBeenCalledTimes(33));
    await new Promise<void>((resolve) => setImmediate(resolve));
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("valid-2"));
    await vi.waitFor(() => expect(preverifyStartShot).toHaveBeenCalledTimes(34));
    finishClaim({ payload, sender: { identity: "host", role: "host" } });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls.map(([event]) => event.round)).toEqual([1, 2]);
    await room.leave();
  });

  it("preserves packet order when preverification completes out of order", async () => {
    let finishFirst!: () => void;
    const preverifyStartShot = vi.fn((_room: string, envelope: string) =>
      envelope === "first"
        ? new Promise<void>((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve(),
    );
    const verifyStartShot = vi.fn(async (_room: string, envelope: string) => ({
      payload: {
        sessionId: "s",
        requestId: envelope,
        round: envelope === "first" ? 1 : 2,
        delayMs: 10,
      },
      sender: { identity: "host", role: "host" as const },
    }));
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot,
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const listener = vi.fn();
    bus.on("START_SHOT", listener);
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("first"));
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("second"));
    await vi.waitFor(() => expect(preverifyStartShot).toHaveBeenCalledTimes(2));
    expect(verifyStartShot).not.toHaveBeenCalled();
    finishFirst();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls.map(([p]) => p.round)).toEqual([1, 2]);
    await room.leave();
  });

  it("drops a preverification that completes after its timeout", async () => {
    vi.useFakeTimers();
    try {
      let finish!: () => void;
      const preverifyStartShot = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const verifyStartShot = vi.fn();
      const { room } = createRealRealtime({
        getCredentials: async () => ({ url: "url", token: "token" }),
        preverifyStartShot,
        verifyStartShot,
      });
      await room.join({ roomId: "one" });
      sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("first"));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(8001);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(verifyStartShot).not.toHaveBeenCalled();
      await room.leave();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops preverification completed after leaving", async () => {
    let finish!: () => void;
    const preverifyStartShot = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const verifyStartShot = vi.fn();
    const { room } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot,
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("first"));
    await vi.waitFor(() => expect(preverifyStartShot).toHaveBeenCalledOnce());
    await room.leave();
    finish();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(verifyStartShot).not.toHaveBeenCalled();
  });

  it("preserves received event order while verification is asynchronous", async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = { sessionId: "s", requestId: "r1", round: 1, delayMs: 10 };
    const second = { ...first, requestId: "r2", round: 2 };
    const sender = { identity: "host", role: "host" as const };
    const verifyStartShot = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ payload: second, sender });
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const listener = vi.fn();
    bus.on("START_SHOT", listener);
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("first"));
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("second"));
    await vi.waitFor(() => expect(verifyStartShot).toHaveBeenCalledTimes(1));
    resolveFirst({ payload: first, sender });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls.map(([payload]) => payload.round)).toEqual([1, 2]);
  });

  it("drops events from the old room after a room switch is requested", async () => {
    let finishCredentials!: (value: { url: string; token: string }) => void;
    const getCredentials = vi.fn((roomId: string) =>
      roomId === "two"
        ? new Promise<{ url: string; token: string }>((resolve) => {
            finishCredentials = resolve;
          })
        : Promise.resolve({ url: "url", token: "token" }),
    );
    const verifyStartShot = vi.fn();
    const { room } = createRealRealtime({ getCredentials, verifyStartShot });
    await room.join({ roomId: "one" });
    const switching = room.join({ roomId: "two" });
    await vi.waitFor(() => expect(getCredentials).toHaveBeenCalledTimes(2));
    sdk.rooms[0].emit("dataReceived", encodeSignedStartShot("old-room"));
    await Promise.resolve();
    expect(verifyStartShot).not.toHaveBeenCalled();
    finishCredentials({ url: "url", token: "token" });
    await switching;
  });

  it("does not publish after issue finishes for an old connection", async () => {
    let resolve!: (value: string) => void;
    const issueStartShot = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const verifyStartShot = vi.fn();
    const { room, bus } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
      issueStartShot,
      preverifyStartShot: async () => {},
      verifyStartShot,
    });
    await room.join({ roomId: "one" });
    const send = bus.send({
      type: "START_SHOT",
      payload: { sessionId: "s", requestId: "r", round: 1, delayMs: 10 },
    });
    await room.leave();
    resolve("signed");
    await expect(send).rejects.toThrow("Room connection changed");
    expect(sdk.rooms[0].localParticipant.publishData).not.toHaveBeenCalled();
    expect(verifyStartShot).not.toHaveBeenCalled();
  });

  it("keeps the current connection when credentials or a new connection fail", async () => {
    const getCredentials = vi.fn(async (roomId: string) => {
      if (roomId === "credentials-fail") throw new Error("credentials failed");
      return { url: "url", token: "token" };
    });
    const { room, bus } = createRealRealtime({ getCredentials });
    await room.join({ roomId: "one" });
    const original = sdk.rooms[0];

    await expect(room.join({ roomId: "credentials-fail" })).rejects.toThrow("credentials failed");
    expect(original.disconnect).not.toHaveBeenCalled();

    sdk.connectError = new Error("connect failed");
    await expect(room.join({ roomId: "two" })).rejects.toThrow("connect failed");
    expect(sdk.rooms[1].disconnect).toHaveBeenCalledWith(false);
    expect(original.disconnect).not.toHaveBeenCalled();
    expect(room.participants()).toEqual([{ identity: "local", attributes: { role: "host" } }]);
    await bus.send({ type: "ROOM_CHANGED" });
    expect(original.localParticipant.publishData).toHaveBeenCalledOnce();

    sdk.connectError = undefined;
    await room.join({ roomId: "two" });
    expect(original.disconnect).toHaveBeenCalledWith(false);
  });

  it("serializes join and leave and disconnects previous rooms without stopping tracks", async () => {
    const { room } = createRealRealtime({
      getCredentials: async () => ({ url: "url", token: "token" }),
    });
    await Promise.all([room.join({ roomId: "one" }), room.join({ roomId: "two" }), room.leave()]);
    expect(sdk.rooms).toHaveLength(2);
    expect(sdk.rooms[0].disconnect).toHaveBeenCalledWith(false);
    expect(sdk.rooms[1].disconnect).toHaveBeenCalledWith(false);
    expect(room.participants()).toEqual([]);
  });
});
