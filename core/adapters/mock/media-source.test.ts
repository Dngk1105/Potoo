import { afterEach, expect, expectTypeOf, test, vi } from "vitest";
import type { MediaSource } from "@/core/contracts";
import { createMockMediaSource } from "../index";

class TestVideo extends EventTarget {
  src = "";
  loop = false;
  muted = false;
  playsInline = false;
  videoWidth = 640;
  videoHeight = 360;
  readyState = 2;
  HAVE_CURRENT_DATA = 2;
  play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn(() => (this.src = ""));
}

class TestTrack extends EventTarget {
  readyState: MediaStreamTrackState = "live";
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
}

function mockBrowser() {
  vi.useFakeTimers();

  function newSource() {
    const track = new TestTrack();
    const video = new TestVideo();
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      captureStream: vi.fn<() => typeof stream>().mockReturnValue(stream),
    };
    return { track, video, stream, canvas, drawImage };
  }

  let source = newSource();
  const sources = [source];
  let firstCanvas = true;
  const createElement = vi.fn((tag: string) => {
    if (tag === "video") return source.video;
    if (!firstCanvas) {
      source = newSource();
      sources.push(source);
    }
    firstCanvas = false;
    return source.canvas;
  });
  const getUserMedia = vi.fn();
  vi.stubGlobal("document", { createElement });
  vi.stubGlobal("window", { setInterval, clearInterval, setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { sources, createElement, getUserMedia, first: sources[0] };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("exports a MediaSource that can be imported and constructed during SSR", async () => {
  expectTypeOf(createMockMediaSource).returns.toEqualTypeOf<MediaSource>();
  expect(typeof document).toBe("undefined");
  const adapter = createMockMediaSource();
  await expect(adapter.getStream()).rejects.toThrow("requires a browser");
});

test("plays the bundled MP4 on a loop and returns its video stream without device access", async () => {
  const { first, createElement, getUserMedia } = mockBrowser();
  const adapter = createMockMediaSource();
  expect(createElement).not.toHaveBeenCalled();

  const stream = await adapter.getStream();
  expect(stream).toBe(first.stream);
  expect(stream.getVideoTracks()).toEqual([first.track]);
  expect(first.video).toMatchObject({
    src: "/mock/booth.mp4",
    loop: true,
    muted: true,
    playsInline: true,
  });
  expect(first.video.play).toHaveBeenCalledOnce();
  expect(first.canvas).toMatchObject({ width: 640, height: 360 });
  expect(first.canvas.captureStream).toHaveBeenCalledExactlyOnceWith(24);
  expect(first.drawImage).toHaveBeenCalledExactlyOnceWith(first.video, 0, 0, 640, 360);
  vi.advanceTimersByTime(50);
  expect(first.drawImage).toHaveBeenCalledTimes(2);
  expect(getUserMedia).not.toHaveBeenCalled();
  stream.getVideoTracks()[0].stop();
  vi.advanceTimersByTime(50);
  expect(vi.getTimerCount()).toBe(0);
});

test("accepts output size and frame rate constraints and preserves the MP4 aspect ratio", async () => {
  const { first } = mockBrowser();
  const stream = await createMockMediaSource().getStream({
    audio: false,
    video: {
      width: { exact: 320 },
      height: { ideal: 300, max: 240 },
      frameRate: 12,
      facingMode: "user",
    },
  });

  expect(first.canvas).toMatchObject({ width: 320, height: 240 });
  expect(first.canvas.captureStream).toHaveBeenCalledExactlyOnceWith(12);
  expect(first.drawImage).toHaveBeenCalledExactlyOnceWith(first.video, 0, 30, 320, 180);
  stream.getVideoTracks()[0].stop();
  vi.advanceTimersByTime(100);
  expect(vi.getTimerCount()).toBe(0);
});

test("rejects unsupported required constraints before creating capture resources", async () => {
  const { createElement, getUserMedia } = mockBrowser();
  const adapter = createMockMediaSource();

  await expect(adapter.getStream({ audio: true })).rejects.toMatchObject({
    name: "NotSupportedError",
  });
  await expect(adapter.getStream({ video: false })).rejects.toMatchObject({
    name: "NotSupportedError",
  });
  await expect(adapter.getStream({ video: { width: { exact: 3840 } } })).rejects.toMatchObject({
    name: "OverconstrainedError",
  });
  await expect(
    adapter.getStream({ video: { deviceId: { exact: "camera" } } }),
  ).rejects.toMatchObject({ name: "OverconstrainedError" });
  expect(createElement).not.toHaveBeenCalled();
  expect(getUserMedia).not.toHaveBeenCalled();
});

test("reports an unavailable capture API before starting playback", async () => {
  const { first, createElement } = mockBrowser();
  Reflect.deleteProperty(first.canvas, "captureStream");
  await expect(createMockMediaSource().getStream()).rejects.toThrow("canvas.captureStream");
  expect(createElement).toHaveBeenCalledExactlyOnceWith("canvas");
  expect(first.video.play).not.toHaveBeenCalled();
});

test("isolates concurrent calls and can restart after a caller stops its track", async () => {
  const { first, sources } = mockBrowser();
  const adapter = createMockMediaSource();
  const [stream, second] = await Promise.all([adapter.getStream(), adapter.getStream()]);
  expect(stream).not.toBe(second);
  expect(vi.getTimerCount()).toBe(2);

  stream.getTracks().forEach((track) => track.stop());
  vi.advanceTimersByTime(50);
  expect(first.track.stop).toHaveBeenCalledOnce();
  expect(first.video.pause).toHaveBeenCalledOnce();
  expect(first.video.removeAttribute).toHaveBeenCalledExactlyOnceWith("src");
  expect(first.video.load).toHaveBeenCalledOnce();
  expect(first.canvas).toMatchObject({ width: 0, height: 0 });
  expect(vi.getTimerCount()).toBe(1);
  expect(second.getVideoTracks()[0].readyState).toBe("live");

  const third = await adapter.getStream();
  expect(third).toBe(sources[2].stream);
  expect(third.getVideoTracks()[0].readyState).toBe("live");
  [...second.getTracks(), ...third.getTracks()].forEach((track) => track.stop());
  vi.advanceTimersByTime(50);
  expect(vi.getTimerCount()).toBe(0);
});

test("releases resources immediately when playback fails after capture starts", async () => {
  const { first } = mockBrowser();
  await createMockMediaSource().getStream();
  first.video.dispatchEvent(new Event("error"));
  expect(first.track.stop).toHaveBeenCalledOnce();
  expect(first.video.src).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

test("cleans up when loading the MP4 emits an error", async () => {
  const { first } = mockBrowser();
  first.video.play.mockImplementation(() => {
    first.video.dispatchEvent(new Event("error"));
    return new Promise(() => {});
  });
  await expect(createMockMediaSource().getStream()).rejects.toMatchObject({
    message: "Could not start mock video from /mock/booth.mp4.",
    cause: { message: "Failed to load /mock/booth.mp4." },
  });
  expect(first.canvas.captureStream).not.toHaveBeenCalled();
  expect(first.video.src).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

test("cleans up a rejected play request", async () => {
  const { first } = mockBrowser();
  first.video.play.mockRejectedValue(new DOMException("Playback denied", "NotAllowedError"));
  await expect(createMockMediaSource().getStream()).rejects.toMatchObject({
    cause: { name: "NotAllowedError" },
  });
  expect(first.video.pause).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("times out and releases a stalled video load", async () => {
  const { first } = mockBrowser();
  first.video.play.mockImplementation(() => new Promise(() => {}));
  const stalled = createMockMediaSource().getStream();
  const rejection = expect(stalled).rejects.toMatchObject({
    cause: { message: "Timed out waiting for the mock video to play." },
  });
  await vi.advanceTimersByTimeAsync(10_000);
  await rejection;
  expect(first.video.src).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

test("stops a partially initialized track if the first canvas draw throws", async () => {
  const { first } = mockBrowser();
  first.drawImage.mockImplementationOnce(() => {
    throw new Error("Canvas write failed");
  });
  await expect(createMockMediaSource().getStream()).rejects.toMatchObject({
    cause: { message: "Canvas write failed" },
  });
  expect(first.track.stop).toHaveBeenCalledOnce();
  expect(first.video.src).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

test("releases capture when drawing fails after the stream is returned", async () => {
  const { first } = mockBrowser();
  await createMockMediaSource().getStream();
  first.drawImage.mockImplementationOnce(() => {
    throw new Error("Canvas write failed during capture");
  });

  vi.advanceTimersByTime(50);
  expect(first.track.readyState).toBe("ended");
  expect(first.video.src).toBe("");
  expect(first.canvas).toMatchObject({ width: 0, height: 0 });
  expect(vi.getTimerCount()).toBe(0);
});
