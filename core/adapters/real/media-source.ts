import type { MediaSource } from "@/core/contracts";

export function createWebcamMediaSource(): MediaSource {
  return {
    async getStream(constraints = { video: true, audio: false }) {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Webcam media source requires a browser with getUserMedia");
      }

      return navigator.mediaDevices.getUserMedia(constraints);
    },
  };
}
