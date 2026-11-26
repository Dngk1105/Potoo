import type { MediaSource } from "@/core/contracts";

const SAMPLE_URL = "/mock/booth.mp4";
const PLAYBACK_TIMEOUT_MS = 10_000;

function overconstrained(name: string) {
  return new DOMException(
    `Mock video cannot satisfy the ${name} constraint.`,
    "OverconstrainedError",
  );
}

function videoSetting(
  name: "width" | "height" | "frameRate",
  constraint: number | ConstrainDoubleRange | undefined,
  fallback: number,
  limit: number,
) {
  const {
    min = 1,
    max = limit,
    exact,
    ideal,
  } = typeof constraint === "object" ? constraint : { ideal: constraint };
  const dimension = name !== "frameRate";
  const lower = Math.max(1, dimension ? Math.ceil(min) : min);
  const upper = Math.min(limit, dimension ? Math.floor(max) : max);
  if (!(lower <= upper)) throw overconstrained(name);

  if (exact !== undefined) {
    if (!(exact >= lower && exact <= upper) || (dimension && !Number.isInteger(exact))) {
      throw overconstrained(name);
    }
    return exact;
  }

  const preferred = ideal !== undefined && Number.isFinite(ideal) ? ideal : fallback;
  return Math.min(upper, Math.max(lower, dimension ? Math.round(preferred) : preferred));
}

function getVideoSettings({ audio, video }: MediaStreamConstraints) {
  if (audio || video === false) {
    throw new DOMException("Mock media supports video only.", "NotSupportedError");
  }

  const { width, height, frameRate, ...otherConstraints } = typeof video === "object" ? video : {};
  for (const [name, value] of Object.entries(otherConstraints)) {
    if (
      value &&
      typeof value === "object" &&
      ("exact" in value || "min" in value || "max" in value)
    ) {
      throw overconstrained(name);
    }
  }

  return {
    width: videoSetting("width", width, 640, 1920),
    height: videoSetting("height", height, 360, 1080),
    frameRate: videoSetting("frameRate", frameRate, 24, 30),
  };
}

async function playSample(video: HTMLVideoElement) {
  let rejectPlayback: (cause: Error) => void;
  const playbackFailure = new Promise<never>((_, reject) => {
    rejectPlayback = reject;
  });
  const onError = () => rejectPlayback(new Error(`Failed to load ${SAMPLE_URL}.`));
  video.addEventListener("error", onError);
  const timeout = window.setTimeout(
    () => rejectPlayback(new Error("Timed out waiting for the mock video to play.")),
    PLAYBACK_TIMEOUT_MS,
  );

  try {
    video.src = SAMPLE_URL;
    await Promise.race([video.play(), playbackFailure]);
  } finally {
    window.clearTimeout(timeout);
    video.removeEventListener("error", onError);
  }
}

/** Each getStream call starts an independent video capture owned by its caller. */
export function createMockMediaSource(): MediaSource {
  return {
    async getStream(constraints = {}) {
      if (typeof window === "undefined" || typeof document === "undefined") {
        throw new Error("Mock media requires a browser.");
      }

      const { width, height, frameRate } = getVideoSettings(constraints);
      const canvas = document.createElement("canvas");
      if (typeof canvas.captureStream !== "function") {
        throw new Error("Mock media requires canvas.captureStream().");
      }
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Mock media requires a 2D canvas context.");
      canvas.width = width;
      canvas.height = height;

      const video = document.createElement("video");
      video.loop = true;
      video.muted = true;
      video.playsInline = true;

      let stream: MediaStream | undefined;
      let track: MediaStreamTrack | undefined;
      let drawTimer: number | undefined;
      let released = false;

      function release() {
        if (released) return;
        released = true;
        window.clearInterval(drawTimer);
        track?.removeEventListener("ended", release);
        video.removeEventListener("error", failCapture);
        video.pause();
        video.removeAttribute("src");
        video.load();
        canvas.width = 0;
        canvas.height = 0;
      }

      function failCapture() {
        stream?.getTracks().forEach((item) => item.stop());
        release();
      }

      try {
        await playSample(video);
        if (!video.videoWidth || !video.videoHeight)
          throw new Error("The MP4 has no video frames.");

        const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
        const frameWidth = video.videoWidth * scale;
        const frameHeight = video.videoHeight * scale;
        const drawFrame = () => {
          context.drawImage(
            video,
            (width - frameWidth) / 2,
            (height - frameHeight) / 2,
            frameWidth,
            frameHeight,
          );
        };

        stream = canvas.captureStream(frameRate);
        const [videoTrack] = stream.getVideoTracks();
        if (!videoTrack || videoTrack.readyState !== "live") {
          throw new Error("Canvas capture did not provide a live video track.");
        }
        track = videoTrack;
        drawFrame();
        track.addEventListener("ended", release);
        video.addEventListener("error", failCapture);
        drawTimer = window.setInterval(() => {
          // stop() changes readyState without firing the ended event.
          if (videoTrack.readyState === "ended") {
            release();
          } else if (video.readyState >= video.HAVE_CURRENT_DATA) {
            try {
              drawFrame();
            } catch {
              failCapture();
            }
          }
        }, 1000 / frameRate);

        return stream;
      } catch (cause) {
        failCapture();
        throw new Error(`Could not start mock video from ${SAMPLE_URL}.`, { cause });
      }
    },
  };
}
