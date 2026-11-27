import { afterEach, expect, expectTypeOf, test, vi } from "vitest";
import type { MediaSource } from "@/core/contracts";
import { createWebcamMediaSource } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("can be constructed on the server but rejects capture without browser APIs", async () => {
  expectTypeOf(createWebcamMediaSource).returns.toEqualTypeOf<MediaSource>();
  vi.stubGlobal("navigator", undefined);
  await expect(createWebcamMediaSource().getStream()).rejects.toThrow("requires a browser");
});

test("requests video only by default and returns the original stream", async () => {
  const stream = {} as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

  await expect(createWebcamMediaSource().getStream()).resolves.toBe(stream);
  expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ video: true, audio: false });
});

test("forwards constraints and capture errors without modification", async () => {
  const error = new Error("Permission denied");
  const getUserMedia = vi.fn().mockRejectedValue(error);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const constraints = { video: { width: 1280 }, audio: true };

  await expect(createWebcamMediaSource().getStream(constraints)).rejects.toBe(error);
  expect(getUserMedia).toHaveBeenCalledExactlyOnceWith(constraints);
});
