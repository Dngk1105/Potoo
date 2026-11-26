import { expect, test, vi } from "vitest";
import type { AdapterConfig } from "@/core/config";
import type { MediaSource } from "@/core/contracts";
import { createAdapterSelector, type RealtimeAdapters } from "./index";

const mockRealtime = { identity: "host", getHostIdentity: () => "host" };

function realFactories() {
  const realtime: RealtimeAdapters = {
    room: {
      join: vi.fn(),
      leave: vi.fn(),
      participants: vi.fn(() => []),
      onParticipantsChanged: vi.fn(() => () => {}),
      publishTrack: vi.fn(),
    },
    bus: { send: vi.fn(), on: vi.fn(() => () => {}) },
  };
  const media: MediaSource = { getStream: vi.fn() };

  return {
    realtime,
    media,
    realRealtime: vi.fn(() => realtime),
    realMedia: vi.fn(() => media),
  };
}

const modes: AdapterConfig[] = [
  { realtime: "real", media: "real" },
  { realtime: "real", media: "mock" },
  { realtime: "mock", media: "real" },
  { realtime: "mock", media: "mock" },
];

test.each(modes)("selects $realtime realtime and $media media independently", async (config) => {
  const real = realFactories();
  const selector = createAdapterSelector(config, {
    mockRealtime,
    realRealtime: real.realRealtime,
    realMedia: real.realMedia,
  });

  expect(real.realRealtime).not.toHaveBeenCalled();
  expect(real.realMedia).not.toHaveBeenCalled();

  const realtime = selector.getRealtime();
  expect(real.realMedia).not.toHaveBeenCalled();
  expect(selector.getRealtime()).toBe(realtime);
  if (config.realtime === "real") {
    expect(realtime).toBe(real.realtime);
    expect(real.realRealtime).toHaveBeenCalledOnce();
  } else {
    await expect(realtime.bus.send({ type: "ROOM_CHANGED" })).rejects.toThrow("Join a room");
    expect(real.realRealtime).not.toHaveBeenCalled();
  }

  const media = selector.getMediaSource();
  expect(selector.getMediaSource()).toBe(media);
  if (config.media === "real") {
    expect(media).toBe(real.media);
    expect(real.realMedia).toHaveBeenCalledOnce();
    expect(real.media.getStream).not.toHaveBeenCalled();
  } else {
    await expect(media.getStream()).rejects.toThrow("Mock media requires a browser");
    expect(real.realMedia).not.toHaveBeenCalled();
  }
});

test("shares a realtime connection within each selector and isolates separate selectors", async () => {
  const config: AdapterConfig = { realtime: "mock", media: "mock" };
  const host = createAdapterSelector(config, { mockRealtime });
  const member = createAdapterSelector(config, {
    mockRealtime: { ...mockRealtime, identity: "member" },
  });
  const roomId = crypto.randomUUID();
  const room = host.getRealtime().room;
  const remote = member.getRealtime();
  const received = vi.fn();
  const unsubscribe = remote.bus.on("START_SHOT", received);

  try {
    await room.join({ roomId });
    expect(remote.room.participants()).toEqual([]);
    await remote.room.join({ roomId });
    await host.getRealtime().bus.send({ type: "START_SHOT", payload: { round: 1, delayMs: 500 } });
    await vi.waitFor(() =>
      expect(received).toHaveBeenCalledExactlyOnceWith(
        { round: 1, delayMs: 500 },
        { identity: "host", role: "host" },
      ),
    );
  } finally {
    unsubscribe();
    await Promise.all([room.leave(), remote.room.leave()]);
  }
});

test("reports missing real factories on demand without blocking the other mock adapter", () => {
  const needsRealtime = createAdapterSelector({ realtime: "real", media: "mock" });
  expect(needsRealtime.getRealtime).toThrow(
    "REALTIME_ADAPTER=real requires a real realtime factory",
  );
  expect(needsRealtime.getMediaSource()).toBeDefined();

  const needsMedia = createAdapterSelector({ realtime: "mock", media: "real" }, { mockRealtime });
  expect(needsMedia.getMediaSource).toThrow("MEDIA_ADAPTER=real requires a real media factory");
  expect(needsMedia.getRealtime()).toBeDefined();
});

test("reports missing mock realtime options only when requested", () => {
  const selector = createAdapterSelector({ realtime: "mock", media: "mock" });
  expect(selector.getRealtime).toThrow("REALTIME_ADAPTER=mock requires mock realtime options");
  expect(selector.getMediaSource()).toBeDefined();
});
