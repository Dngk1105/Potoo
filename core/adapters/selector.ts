import type { AdapterConfig } from "@/core/config";
import type { MediaSource, RoomBus, RoomPort } from "@/core/contracts";
import { createMockMediaSource, createMockRealtime, type MockRealtimeOptions } from "./mock";

export type RealtimeAdapters = Readonly<{ room: RoomPort; bus: RoomBus }>;

export type AdapterFactories = {
  mockRealtime?: MockRealtimeOptions;
  realRealtime?: () => RealtimeAdapters;
  realMedia?: () => MediaSource;
};

/** Create one selector per consumer scope and reuse its adapters for that scope's lifetime. */
export function createAdapterSelector(config: AdapterConfig, factories: AdapterFactories = {}) {
  let realtime: RealtimeAdapters | undefined;
  let mediaSource: MediaSource | undefined;

  return {
    getRealtime(): RealtimeAdapters {
      if (realtime) return realtime;

      if (config.realtime === "mock") {
        if (!factories.mockRealtime) {
          throw new Error("REALTIME_ADAPTER=mock requires mock realtime options.");
        }
        realtime = createMockRealtime(factories.mockRealtime);
      } else {
        if (!factories.realRealtime) {
          throw new Error("REALTIME_ADAPTER=real requires a real realtime factory.");
        }
        realtime = factories.realRealtime();
      }

      return realtime;
    },
    getMediaSource(): MediaSource {
      if (mediaSource) return mediaSource;

      if (config.media === "mock") {
        mediaSource = createMockMediaSource();
      } else {
        if (!factories.realMedia) {
          throw new Error("MEDIA_ADAPTER=real requires a real media factory.");
        }
        mediaSource = factories.realMedia();
      }

      return mediaSource;
    },
  };
}
