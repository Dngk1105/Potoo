export type LiveKitAccessFacts = {
  userId: string | null;
  hostId: string | null;
  isLocked: boolean;
  membership: { kickedAt: string | null } | null;
};

// Caller must obtain these facts from trusted, current room and membership records.
export function resolveLiveKitRole(facts: LiveKitAccessFacts): "host" | "member" | null {
  if (
    !facts.userId ||
    !facts.hostId ||
    facts.isLocked !== false ||
    !facts.membership ||
    facts.membership.kickedAt !== null
  ) {
    return null;
  }

  return facts.userId === facts.hostId ? "host" : "member";
}
