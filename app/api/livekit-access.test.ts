import { describe, expect, it } from "vitest";

import { resolveLiveKitRole, type LiveKitAccessFacts } from "./livekit-access";

const facts: LiveKitAccessFacts = {
  userId: "user-1",
  hostId: "user-1",
  isLocked: false,
  membership: { kickedAt: null },
};

describe("resolveLiveKitRole", () => {
  it("derives role from the host ID", () => {
    expect(resolveLiveKitRole(facts)).toBe("host");
    expect(resolveLiveKitRole({ ...facts, hostId: "user-2" })).toBe("member");
  });

  it("rejects locked rooms, including for the host", () => {
    expect(resolveLiveKitRole({ ...facts, isLocked: true })).toBeNull();
  });

  it("rejects kicked and missing members", () => {
    expect(resolveLiveKitRole({ ...facts, membership: { kickedAt: "2026-01-01" } })).toBeNull();
    expect(resolveLiveKitRole({ ...facts, membership: null })).toBeNull();
  });

  it("rejects missing identities and incomplete facts", () => {
    expect(resolveLiveKitRole({ ...facts, userId: null })).toBeNull();
    expect(resolveLiveKitRole({ ...facts, hostId: null })).toBeNull();
    expect(resolveLiveKitRole({ ...facts, isLocked: undefined as never })).toBeNull();
    expect(resolveLiveKitRole({ ...facts, membership: {} as never })).toBeNull();
  });
});
