// UI hints only; Route Handlers and RLS must enforce permissions independently.
type StripOwnerPermission = {
  userId: string;
  visibility: "private" | "session" | "friends" | "link";
  isFriend: boolean;
};

export type Permission =
  | { action: "create-room" | "upload-asset" | "send-friend-request"; userId: string | null }
  | {
      action: "join-room";
      userId: string | null;
      hasInvite: boolean;
      isLocked: boolean;
      isKicked: boolean;
    }
  | { action: "remove-friend"; userId: string | null; memberIds: readonly string[] }
  | {
      action: "edit-shared-strip";
      userId: string | null;
      isSessionMember: boolean;
      objectLockedByAnother: boolean;
    }
  | {
      action: "view-strip" | "download-strip" | "react-to-strip" | "comment-on-strip";
      userId: string | null;
      owners: readonly StripOwnerPermission[];
      isSessionMember: boolean;
      hasValidatedLink: boolean;
    }
  | {
      action: "manage-room";
      userId: string | null;
      hostId: string | null;
    }
  | { action: "save-personal-strip"; userId: string | null; isSessionMember: boolean }
  | { action: "manage-own-strip"; userId: string | null; isStripOwner: boolean }
  | {
      action: "delete-comment";
      userId: string | null;
      authorId: string | null;
      isStripOwner: boolean;
    }
  | {
      action: "manage-asset";
      userId: string | null;
      ownerId: string | null;
    }
  | {
      action: "use-asset";
      userId: string | null;
      asset: {
        visibility: "public" | "private";
        ownerId: string | null;
        isActiveRoomOrSessionFrame: boolean;
      } | null;
    };

// Membership facts must reflect non-kicked membership for the relevant room or session.
export function can(permission: Permission): boolean {
  const { userId } = permission;
  if (
    permission.action === "view-strip" ||
    permission.action === "download-strip" ||
    permission.action === "react-to-strip" ||
    permission.action === "comment-on-strip"
  ) {
    if (!userId && permission.action !== "view-strip" && permission.action !== "download-strip")
      return false;
    return (
      permission.owners.length > 0 &&
      permission.owners.every(
        (owner) =>
          (!!userId && owner.userId === userId) ||
          (["session", "friends", "link"].includes(owner.visibility) &&
            permission.isSessionMember &&
            !!userId) ||
          ((owner.visibility === "friends" || owner.visibility === "link") &&
            owner.isFriend &&
            !!userId) ||
          (owner.visibility === "link" &&
            permission.hasValidatedLink &&
            (permission.action === "view-strip" || permission.action === "download-strip")),
      )
    );
  }
  if (!userId) return false;

  switch (permission.action) {
    case "create-room":
    case "upload-asset":
    case "send-friend-request":
      return true;
    case "join-room":
      return permission.hasInvite && !permission.isLocked && !permission.isKicked;
    case "remove-friend":
      return permission.memberIds.includes(userId);
    case "edit-shared-strip":
      return permission.isSessionMember && !permission.objectLockedByAnother;
    case "manage-room":
      return permission.hostId === userId;
    case "save-personal-strip":
      return permission.isSessionMember;
    case "manage-own-strip":
      return permission.isStripOwner;
    case "delete-comment":
      return permission.authorId === userId || permission.isStripOwner;
    case "manage-asset":
      return permission.ownerId === userId;
    case "use-asset":
      return (
        permission.asset !== null &&
        (permission.asset.visibility === "public" ||
          permission.asset.ownerId === userId ||
          permission.asset.isActiveRoomOrSessionFrame)
      );
    default:
      return false;
  }
}
