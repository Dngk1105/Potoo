import { afterEach, expect, test, vi } from "vitest";
import { createMockRealtime, type MockRealtimeOptions } from "../index";

const peers: ReturnType<typeof createMockRealtime>[] = [];

function peer(
  identity: string,
  getHostIdentity: MockRealtimeOptions["getHostIdentity"] = () => "host",
) {
  const adapter = createMockRealtime({ identity, getHostIdentity });
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
