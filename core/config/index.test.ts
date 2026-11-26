import { afterEach, expect, test, vi } from "vitest";
import { readAdapterConfig } from "./index";

// Next.js supplies the server-only marker. Vitest runs these tests in Node.
vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

test.each([
  [undefined, undefined, "real", "real"],
  ["real", "real", "real", "real"],
  ["real", "mock", "real", "mock"],
  ["mock", "real", "mock", "real"],
  ["mock", "mock", "mock", "mock"],
])(
  "reads realtime=%s and media=%s independently",
  (realtime, media, expectedRealtime, expectedMedia) => {
    vi.stubEnv("REALTIME_ADAPTER", realtime);
    vi.stubEnv("MEDIA_ADAPTER", media);

    expect(readAdapterConfig()).toEqual({ realtime: expectedRealtime, media: expectedMedia });
  },
);

test.each(["REALTIME_ADAPTER", "MEDIA_ADAPTER"] as const)(
  "reports invalid %s without echoing its value",
  (name) => {
    vi.stubEnv("REALTIME_ADAPTER", undefined);
    vi.stubEnv("MEDIA_ADAPTER", undefined);
    vi.stubEnv(name, "invalid-value");

    expect(readAdapterConfig).toThrow(`Invalid ${name}. Expected "real" or "mock".`);
  },
);

test("rejects an explicitly empty value", () => {
  vi.stubEnv("REALTIME_ADAPTER", "");
  vi.stubEnv("MEDIA_ADAPTER", undefined);

  expect(readAdapterConfig).toThrow("Invalid REALTIME_ADAPTER");
});
