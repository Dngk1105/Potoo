import { afterEach, expect, test, vi } from "vitest";
import { createMockRealtime, type MockRealtimeOptions } from "../index";

const peers: ReturnType<typeof createMockRealtime>[] = [];

function peer(
  identity: string,
  getHostIdentity: MockRealtimeOptions["getHostIdentity"] = () => "host",
  onRoomStateChanged?: MockRealtimeOptions["onRoomStateChanged"],
) {
  const adapter = createMockRealtime({ identity, getHostIdentity, onRoomStateChanged });
  peers.push(adapter);
  return adapter;
}

afterEach(async () => {
  await Promise.all(peers.splice(0).map(({ room }) => room.leave()));
});

test("late joiners discover existing participants and leave clears presence", async () => {
  const roomId = crypto.randomUUID();
  const host = peer("host");
  const member = peer("member");

  await host.room.join({ roomId });
  expect(host.room.participants()).toEqual([{ identity: "host", attributes: { role: "host" } }]);

  await member.room.join({ roomId });
  await member.room.join({ roomId });
  await vi.waitFor(() => {
    expect(member.room.participants()).toEqual([
      { identity: "member", attributes: { role: "member" } },
      { identity: "host", attributes: { role: "host" } },
    ]);
    expect(host.room.participants()).toHaveLength(2);
  });

  await member.room.leave();
  await member.room.leave();
  expect(member.room.participants()).toEqual([]);
  await vi.waitFor(() => expect(host.room.participants()).toHaveLength(1));
});

test("sends all documented events and resolves sender metadata separately", async () => {
  const roomId = crypto.randomUUID();
  const host = peer("host");
  const member = peer("member");
  const starts = vi.fn();
  const ownStarts = vi.fn();
  const ready = vi.fn();
  const uploaded = vi.fn();
  const changed = vi.fn();
  host.bus.on("START_SHOT", ownStarts);
  host.bus.on("READY", ready);
  host.bus.on("SHOT_UPLOADED", uploaded);
  member.bus.on("START_SHOT", starts);
  member.bus.on("ROOM_CHANGED", changed);

  await host.room.join({ roomId });
  await member.room.join({ roomId });
  await member.bus.send({ type: "READY", payload: { ready: true } });
  await member.bus.send({ type: "SHOT_UPLOADED", payload: { round: 1 } });
  await host.bus.send({ type: "START_SHOT", payload: { round: 1, delayMs: 1000 } });
  await host.bus.send({ type: "ROOM_CHANGED" });

  await vi.waitFor(() => {
    expect(starts).toHaveBeenCalledExactlyOnceWith(
      { round: 1, delayMs: 1000 },
      { identity: "host", role: "host" },
    );
    expect(ready).toHaveBeenCalledExactlyOnceWith(
      { ready: true },
      { identity: "member", role: "member" },
    );
    expect(uploaded).toHaveBeenCalledExactlyOnceWith(
      { round: 1 },
      { identity: "member", role: "member" },
    );
    expect(changed).toHaveBeenCalledExactlyOnceWith(undefined, { identity: "host", role: "host" });
  });
  expect(ownStarts).not.toHaveBeenCalled();
});

test("notifies subscribers of local and remote membership changes until unsubscribe", async () => {
  const roomId = crypto.randomUUID();
  const host = peer("host");
  const member = peer("member");
  const changed = vi.fn(() => host.room.participants().map(({ identity }) => identity));
  const unsubscribe = host.room.onParticipantsChanged(changed);

  await host.room.join({ roomId });
  expect(changed).toHaveBeenCalledTimes(1);
  await member.room.join({ roomId });
  await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  expect(changed).toHaveLastReturnedWith(["host", "member"]);

  await member.room.leave();
  await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(3));
  expect(changed).toHaveLastReturnedWith(["host"]);
  await host.room.leave();
  expect(changed).toHaveBeenCalledTimes(4);
  expect(changed).toHaveLastReturnedWith([]);

  unsubscribe();
  await host.room.join({ roomId });
  expect(changed).toHaveBeenCalledTimes(4);
});

test("notifies on a role change from room state and detaches the source when leaving", async () => {
  const roomId = crypto.randomUUID();
  let hostIdentity = "host";
  let notifyRoomState: (() => void) | undefined;
  const detachRoomState = vi.fn();
  const subscribe = vi.fn((_roomId: string, listener: () => void) => {
    notifyRoomState = listener;
    return detachRoomState;
  });
  const host = peer("host", () => hostIdentity);
  const member = peer("member", () => hostIdentity, subscribe);

  await host.room.join({ roomId });
  await member.room.join({ roomId });
  await vi.waitFor(() => expect(member.room.participants()).toHaveLength(2));
  expect(subscribe).toHaveBeenCalledExactlyOnceWith(roomId, expect.any(Function));

  const changed = vi.fn(() => member.room.participants());
  member.room.onParticipantsChanged(changed);
  notifyRoomState?.();
  expect(changed).not.toHaveBeenCalled();
  hostIdentity = "member";
  notifyRoomState?.();
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveLastReturnedWith([
    { identity: "member", attributes: { role: "host" } },
    { identity: "host", attributes: { role: "member" } },
  ]);

  const starts = vi.fn();
  const unsubscribe = host.bus.on("START_SHOT", starts);
  const shot = { type: "START_SHOT" as const, payload: { round: 1, delayMs: 500 } };
  await expect(host.bus.send(shot)).rejects.toThrow("Only the host");
  await member.bus.send(shot);
  await vi.waitFor(() =>
    expect(starts).toHaveBeenCalledExactlyOnceWith(shot.payload, {
      identity: "member",
      role: "host",
    }),
  );
  unsubscribe();

  await member.room.leave();
  expect(detachRoomState).toHaveBeenCalledOnce();
  notifyRoomState?.();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(changed).toHaveLastReturnedWith([]);
});

test("rejects START_SHOT from a member and checks the recipient's current host state", async () => {
  const roomId = crypto.randomUUID();
  let hostIdentity = "host";
  const host = peer("host");
  const member = peer("member", () => hostIdentity);
  const starts = vi.fn();
  const changed = vi.fn();
  member.bus.on("START_SHOT", starts);
  member.bus.on("ROOM_CHANGED", changed);
  await host.room.join({ roomId });
  await member.room.join({ roomId });

  const forged = {
    type: "START_SHOT" as const,
    payload: { round: 1, delayMs: 1000, role: "host" },
  };
  await expect(member.bus.send(forged)).rejects.toThrow("Only the host");

  // The old host still has stale room state. The recipient has already seen the transfer.
  hostIdentity = "member";
  await host.bus.send(forged);
  await host.bus.send({ type: "ROOM_CHANGED" });
  await vi.waitFor(() => {
    expect(changed).toHaveBeenCalledExactlyOnceWith(undefined, {
      identity: "host",
      role: "member",
    });
  });
  expect(starts).not.toHaveBeenCalled();
});

test("unsubscribe and switching rooms stop delivery from the previous room", async () => {
  const roomId = crypto.randomUUID();
  const host = peer("host");
  const member = peer("member");
  const unsubscribed = vi.fn();
  const active = vi.fn();
  const unsubscribe = member.bus.on("READY", unsubscribed);
  member.bus.on("READY", active);
  await host.room.join({ roomId });
  await member.room.join({ roomId });

  unsubscribe();
  unsubscribe();
  await host.bus.send({ type: "READY", payload: { ready: true } });
  await vi.waitFor(() => expect(active).toHaveBeenCalledTimes(1));
  expect(unsubscribed).not.toHaveBeenCalled();

  const nextRoomId = crypto.randomUUID();
  await member.room.join({ roomId: nextRoomId });
  await host.bus.send({ type: "READY", payload: { ready: false } });
  await host.room.join({ roomId: nextRoomId });
  await host.bus.send({ type: "READY", payload: { ready: true } });
  await vi.waitFor(() => expect(active).toHaveBeenCalledTimes(2));
  expect(active.mock.calls.map(([payload]) => payload)).toEqual([{ ready: true }, { ready: true }]);
  expect(unsubscribed).not.toHaveBeenCalled();
});

test("publishing and sending require a room and leaving preserves caller-owned tracks", async () => {
  const host = peer("host");
  const stop = vi.fn();
  const track = { stop } as unknown as MediaStreamTrack;

  await expect(host.room.publishTrack(track)).rejects.toThrow("Join a room");
  await expect(host.bus.send({ type: "ROOM_CHANGED" })).rejects.toThrow("Join a room");
  await host.room.join({ roomId: crypto.randomUUID() });
  await expect(host.room.publishTrack(track)).resolves.toBeUndefined();
  await host.room.leave();
  expect(stop).not.toHaveBeenCalled();
  await expect(host.bus.send({ type: "ROOM_CHANGED" })).rejects.toThrow("Join a room");
});

test("switches rooms without exposing a disconnected snapshot and keeps the old room on setup failure", async () => {
  const firstRoom = crypto.randomUUID();
  const secondRoom = crypto.randomUUID();
  const failedRoom = crypto.randomUUID();
  const detach = vi.fn();
  const host = peer(
    "host",
    (roomId) => {
      if (roomId === failedRoom) throw new Error("Unavailable room state");
      return roomId === firstRoom ? "host" : null;
    },
    () => detach,
  );

  await host.room.join({ roomId: firstRoom });
  const changed = vi.fn(() => host.room.participants());
  const unsubscribe = host.room.onParticipantsChanged(changed);
  try {
    await expect(host.room.join({ roomId: failedRoom })).rejects.toThrow("Unavailable room state");
    expect(detach).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
    expect(host.room.participants()).toEqual([{ identity: "host", attributes: { role: "host" } }]);
    await expect(host.bus.send({ type: "ROOM_CHANGED" })).resolves.toBeUndefined();

    await host.room.join({ roomId: secondRoom });
    expect(detach).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveLastReturnedWith([{ identity: "host", attributes: { role: "member" } }]);
  } finally {
    unsubscribe();
  }
});

test("delivers to multiple listeners and drops packets queued for a connection that leaves", async () => {
  const roomId = crypto.randomUUID();
  const host = peer("host");
  const member = peer("member");
  const observer = peer("observer");
  const first = vi.fn();
  const second = vi.fn();
  const observed = vi.fn();
  const unsubscribeFirst = member.bus.on("READY", first);
  const unsubscribeSecond = member.bus.on("READY", second);
  const unsubscribeObserver = observer.bus.on("READY", observed);

  try {
    await Promise.all([
      host.room.join({ roomId }),
      member.room.join({ roomId }),
      observer.room.join({ roomId }),
    ]);
    await host.bus.send({ type: "READY", payload: { ready: true } });
    await vi.waitFor(() => {
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
      expect(observed).toHaveBeenCalledOnce();
    });

    unsubscribeFirst();
    await host.bus.send({ type: "READY", payload: { ready: false } });
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(2));
    expect(first).toHaveBeenCalledOnce();

    const sending = host.bus.send({ type: "READY", payload: { ready: true } });
    await member.room.leave();
    await sending;
    await vi.waitFor(() => expect(observed).toHaveBeenCalledTimes(3));
    expect(second).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribeFirst();
    unsubscribeSecond();
    unsubscribeObserver();
  }
});
