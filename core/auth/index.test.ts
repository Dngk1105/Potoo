import { describe, expect, test } from "vitest";
import { can, type Permission } from "./index";

describe("can", () => {
  test.each<Permission>([
    { action: "create-room", userId: null },
    { action: "upload-asset", userId: null },
    { action: "manage-room", userId: null, hostId: null },
    { action: "save-personal-strip", userId: null, isSessionMember: true },
    { action: "manage-own-strip", userId: null, isStripOwner: true },
    { action: "delete-comment", userId: null, authorId: null, isStripOwner: true },
    { action: "manage-asset", userId: null, ownerId: null },
    {
      action: "use-asset",
      userId: null,
      asset: { visibility: "public", ownerId: null, isActiveRoomOrSessionFrame: true },
    },
  ])("denies signed-out users for $action", (permission) => {
    expect(can(permission)).toBe(false);
  });

  test("allows signed-in users to create rooms and upload assets", () => {
    expect(can({ action: "create-room", userId: "a" })).toBe(true);
    expect(can({ action: "upload-asset", userId: "a" })).toBe(true);
  });

  test("only the host manages the room", () => {
    expect(can({ action: "manage-room", userId: "a", hostId: "a" })).toBe(true);
    expect(can({ action: "manage-room", userId: "a", hostId: "b" })).toBe(false);
    expect(can({ action: "manage-room", userId: "a", hostId: null })).toBe(false);
  });

  test("personal copies require active session membership", () => {
    expect(can({ action: "save-personal-strip", userId: "a", isSessionMember: true })).toBe(true);
    expect(can({ action: "save-personal-strip", userId: "a", isSessionMember: false })).toBe(false);
  });

  test("only a strip owner manages their own strip settings", () => {
    expect(can({ action: "manage-own-strip", userId: "a", isStripOwner: true })).toBe(true);
    expect(can({ action: "manage-own-strip", userId: "a", isStripOwner: false })).toBe(false);
  });

  test("comment deletion requires authorship or strip ownership", () => {
    expect(can({ action: "delete-comment", userId: "a", authorId: "a", isStripOwner: false })).toBe(
      true,
    );
    expect(can({ action: "delete-comment", userId: "a", authorId: "b", isStripOwner: true })).toBe(
      true,
    );
    expect(can({ action: "delete-comment", userId: "a", authorId: "b", isStripOwner: false })).toBe(
      false,
    );
  });

  test("only an asset owner manages the asset", () => {
    expect(can({ action: "manage-asset", userId: "a", ownerId: "a" })).toBe(true);
    expect(can({ action: "manage-asset", userId: "a", ownerId: "b" })).toBe(false);
    expect(can({ action: "manage-asset", userId: "a", ownerId: null })).toBe(false);
  });

  test("asset use requires an existing public, owned, or active room/session frame", () => {
    const asset = {
      visibility: "private" as const,
      ownerId: "b",
      isActiveRoomOrSessionFrame: false,
    };
    expect(can({ action: "use-asset", userId: "a", asset: null })).toBe(false);
    expect(can({ action: "use-asset", userId: "a", asset })).toBe(false);
    expect(
      can({ action: "use-asset", userId: "a", asset: { ...asset, visibility: "public" } }),
    ).toBe(true);
    expect(can({ action: "use-asset", userId: "a", asset: { ...asset, ownerId: "a" } })).toBe(true);
    expect(
      can({
        action: "use-asset",
        userId: "a",
        asset: { ...asset, isActiveRoomOrSessionFrame: true },
      }),
    ).toBe(true);
  });

  test("checks room invitation, lock and kick", () => {
    const input = {
      action: "join-room" as const,
      userId: "a",
      hasInvite: true,
      isLocked: false,
      isKicked: false,
    };
    expect(can(input)).toBe(true);
    expect(can({ ...input, hasInvite: false })).toBe(false);
    expect(can({ ...input, isLocked: true })).toBe(false);
    expect(can({ ...input, isKicked: true })).toBe(false);
  });

  test("requires every owner to allow a strip viewer", () => {
    const owners = [
      { userId: "a", visibility: "session" as const, isFriend: false },
      { userId: "b", visibility: "private" as const, isFriend: false },
    ];
    const input = {
      action: "view-strip" as const,
      userId: "a",
      owners,
      isSessionMember: true,
      hasValidatedLink: false,
    };
    expect(can(input)).toBe(false);
    expect(can({ ...input, owners: [] })).toBe(false);
    expect(can({ ...input, owners: [owners[0], { ...owners[1], visibility: "session" }] })).toBe(
      true,
    );
  });

  test("link access requires every owner to allow it and does not grant write permissions", () => {
    const input = {
      userId: null,
      owners: [{ userId: "a", visibility: "link" as const, isFriend: false }],
      isSessionMember: false,
      hasValidatedLink: true,
    };
    expect(can({ ...input, action: "view-strip" })).toBe(true);
    expect(can({ ...input, action: "download-strip" })).toBe(true);
    expect(can({ ...input, action: "react-to-strip" })).toBe(false);
    expect(can({ ...input, userId: "b", action: "react-to-strip" })).toBe(false);
    expect(can({ ...input, hasValidatedLink: false, action: "view-strip" })).toBe(false);
  });

  test("shared editing and friendship actions require the matching relationship", () => {
    expect(
      can({
        action: "edit-shared-strip",
        userId: "a",
        isSessionMember: true,
        objectLockedByAnother: false,
      }),
    ).toBe(true);
    expect(
      can({
        action: "edit-shared-strip",
        userId: "a",
        isSessionMember: true,
        objectLockedByAnother: true,
      }),
    ).toBe(false);
    expect(can({ action: "remove-friend", userId: "a", memberIds: ["a", "b"] })).toBe(true);
    expect(can({ action: "remove-friend", userId: "c", memberIds: ["a", "b"] })).toBe(false);
  });

  test("denies unknown actions at runtime", () => {
    expect(can({ action: "unknown", userId: "a" } as unknown as Permission)).toBe(false);
  });
});
