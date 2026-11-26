import "server-only";

type AdapterMode = "real" | "mock";

export type AdapterConfig = Readonly<{
  realtime: AdapterMode;
  media: AdapterMode;
}>;

function readMode(name: string, value: string | undefined): AdapterMode {
  if (value === undefined) return "real";
  if (value === "real" || value === "mock") return value;
  throw new Error(`Invalid ${name}. Expected "real" or "mock".`);
}

/** Read on the server and pass the resulting config to client consumers. */
export function readAdapterConfig(): AdapterConfig {
  return {
    realtime: readMode("REALTIME_ADAPTER", process.env.REALTIME_ADAPTER),
    media: readMode("MEDIA_ADAPTER", process.env.MEDIA_ADAPTER),
  };
}
