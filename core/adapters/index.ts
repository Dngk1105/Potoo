export { createAdapterSelector, type AdapterFactories, type RealtimeAdapters } from "./selector";
export { createMockMediaSource, createMockRealtime, type MockRealtimeOptions } from "./mock";
export {
  createRealRealtime,
  createWebcamMediaSource,
  createSupabaseAuth,
  createSupabaseBrowserAuthClient,
  createSupabaseServerAuthClient,
  exchangeSupabaseOAuthCode,
  createSupabaseStorage,
  createStartShotHttp,
  type RealRealtimeOptions,
} from "./real";
