import type { ComponentType } from "react";

export type Unsubscribe = () => void;

export type AuthUser = {
  id: string;
  email: string | null;
};

export type SignInInput =
  { method: "email"; email: string; password: string } | { method: "google"; redirectTo?: string };

export type SignInResult =
  { status: "signed-in"; user: AuthUser } | { status: "redirect"; url: string };

export type SignUpInput = { email: string; password: string; redirectTo?: string };

export type SignUpResult =
  { status: "confirmation-required" } | { status: "signed-in"; user: AuthUser };

export type AuthChangeListener = (user: AuthUser | null) => void;

export interface AuthPort {
  /** Returns null when signed out. Authentication errors reject the promise. */
  currentUser(): Promise<AuthUser | null>;
  /** Register an email; a session may require email confirmation first. */
  signUp(input: SignUpInput): Promise<SignUpResult>;
  /** The caller navigates to the returned URL to continue Google sign-in. */
  signIn(input: SignInInput): Promise<SignInResult>;
  signOut(): Promise<void>;
  onChange(listener: AuthChangeListener): Unsubscribe;
}

export type StorageObject = {
  bucket: string;
  path: string;
};

export type StorageUploadInput = StorageObject & { body: Blob };

export type StorageUrlInput = StorageObject & { expiresInSeconds: number };

export type StorageError = { message: string; code?: string };

export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: StorageError };
export type StorageUploadResult = StorageObject & { status: "uploaded" | "queued" };
export type StorageFlushResult = { uploaded: number; failed: number };

export interface StoragePort {
  /** Queued means the shot is durable locally, not uploaded. */
  upload(input: StorageUploadInput): Promise<StorageResult<StorageUploadResult>>;
  /** Retry the current user's pending shots. */
  flushPending(): Promise<StorageResult<StorageFlushResult>>;
  /** Stop automatic retries and release browser listeners. */
  dispose(): void;
  /** Return a signed URL for the object. */
  getUrl(input: StorageUrlInput): Promise<StorageResult<string>>;
  remove(object: StorageObject): Promise<StorageResult<void>>;
}

export type ParticipantRole = "host" | "member";

export type RoomJoinInput = { roomId: string };

export type RoomParticipant = {
  readonly identity: string;
  readonly attributes: Readonly<Record<string, string | undefined> & { role: ParticipantRole }>;
};

export type RemoteMediaTrack = {
  readonly participantIdentity: string;
  readonly trackId: string;
  readonly track: MediaStreamTrack;
  /** Attach through the adapter so adaptive streaming can observe the element. */
  attach(element: HTMLMediaElement): void;
  /** Detach a previously attached element without stopping the remote track. */
  detach(element: HTMLMediaElement): void;
};

export interface RoomPort {
  /** The real adapter obtains connection credentials for this room from the server. */
  join(input: RoomJoinInput): Promise<void>;
  leave(): Promise<void>;
  /** A snapshot of the participants currently in the room, including the local participant. */
  participants(): readonly RoomParticipant[];
  /** Subscribe to membership or attribute changes. Read the new snapshot with participants(). */
  onParticipantsChanged(listener: () => void): Unsubscribe;
  /** Snapshot of subscribed remote tracks; the adapter owns their lifecycle. */
  remoteTracks(): readonly RemoteMediaTrack[];
  /** Subscribe to remote track changes, then read the latest snapshot. */
  onRemoteTracksChanged(listener: () => void): Unsubscribe;
  /** The caller retains ownership of the track and stops it when finished. */
  publishTrack(track: MediaStreamTrack): Promise<void>;
}

export type RoomEventPayloads = {
  START_SHOT: { sessionId: string; requestId: string; round: number; delayMs: number };
  READY: { ready: boolean };
  SHOT_UPLOADED: { round: number };
  ROOM_CHANGED: undefined;
};

export type RoomEventName = keyof RoomEventPayloads;

export type RoomEvent = {
  [Name in RoomEventName]: RoomEventPayloads[Name] extends undefined
    ? { type: Name; payload?: never }
    : { type: Name; payload: RoomEventPayloads[Name] };
}[RoomEventName];

export type RoomEventSender = {
  readonly identity: RoomParticipant["identity"];
  readonly role: ParticipantRole;
};

export type RoomEventListener<Name extends RoomEventName> = (
  payload: RoomEventPayloads[Name],
  sender: RoomEventSender,
) => void;

export interface RoomBus {
  /** Send the event to the current room using reliable delivery. */
  send(event: RoomEvent): Promise<void>;
  /**
   * The real adapter obtains START_SHOT payload and sender from server verification
   * and claim. Other events use the transport participant. The mock uses its room state.
   * The caller retains requestId across START_SHOT retries.
   */
  on<Name extends RoomEventName>(type: Name, listener: RoomEventListener<Name>): Unsubscribe;
}

export interface MediaSource {
  /**
   * Defaults to video only. The caller owns the returned stream and stops all its
   * tracks when finished. The adapter must release capture resources after use.
   */
  getStream(constraints?: MediaStreamConstraints): Promise<MediaStream>;
}

export type EffectFrame = ImageData;

export type EffectParams = Readonly<Record<string, boolean | number | string>>;

export interface Effect {
  readonly params: EffectParams;
  init(): void | Promise<void>;
  process(frame: EffectFrame): EffectFrame | Promise<EffectFrame>;
  dispose(): void;
}

export type StudioToolContext = {
  readonly stripId: string;
  readonly frame: FrameManifest;
};

export type StudioToolPanelProps<Context extends StudioToolContext = StudioToolContext> = {
  context: Context;
};

export interface StudioTool<Context extends StudioToolContext = StudioToolContext> {
  activate(context: Context): void;
  deactivate(): void;
  readonly panel: ComponentType<StudioToolPanelProps<Context>>;
}

export type FrameSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

export type FrameManifest = {
  version: 1;
  width: number;
  height: number;
  /** Storage path of the PNG drawn over the slots. */
  overlay: string;
  slots: FrameSlot[];
};
