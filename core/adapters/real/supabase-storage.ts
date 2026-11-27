import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  StorageError,
  StoragePort,
  StorageResult,
  StorageUploadInput,
  StorageUploadResult,
} from "@/core/contracts";
import { shotQueue, type PendingShot } from "./storage-queue";

function storageError(error: unknown): StorageError {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = typeof error.message === "string" ? error.message : "Storage request failed";
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return { message, ...(code ? { code } : {}) };
  }
  return { message: "Storage request failed" };
}

async function attempt<T>(operation: () => Promise<StorageResult<T>>): Promise<StorageResult<T>> {
  try {
    return await operation();
  } catch (error) {
    return { ok: false, error: storageError(error) };
  }
}

function isShot(path: string, userId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 4 &&
    parts[0] === "sessions" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[1]) &&
    /^(0|[1-9]\d*)$/.test(parts[2]) &&
    Number(parts[2]) <= 2147483647 &&
    parts[3] === `${userId}.jpg`
  );
}

export function createSupabaseStorage(client: SupabaseClient): StoragePort {
  async function session() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function requireSameUser(userId: string) {
    const current = await session();
    if (!current || current.user.id !== userId) throw new Error("Storage session changed");
    return current;
  }

  async function uploadShot(input: StorageUploadInput, userId: string) {
    const current = await requireSameUser(userId);
    return client.storage.from(input.bucket).upload(input.path, input.body, {
      ...(input.body.type ? { contentType: input.body.type } : {}),
      headers: { Authorization: `Bearer ${current.access_token}` },
    });
  }

  async function matchesRemote(shot: PendingShot): Promise<boolean> {
    const current = await requireSameUser(shot.userId);
    const bucket = client.storage.from(shot.bucket);
    bucket.setHeader("Authorization", `Bearer ${current.access_token}`);
    const { data, error } = await bucket.download(shot.path, undefined, {
      cache: "no-store",
    });
    await requireSameUser(shot.userId);
    if (error || !data || data.size !== shot.body.size) return false;
    const [a, b] = await Promise.all([data.arrayBuffer(), shot.body.arrayBuffer()]);
    const left = new Uint8Array(a);
    const right = new Uint8Array(b);
    return left.every((byte, i) => byte === right[i]);
  }

  let activeFlush: Promise<StorageResult<{ uploaded: number; failed: number }>> | undefined;
  let disposed = false;
  let unsubscribe = () => {};
  let online = () => {};
  const port: StoragePort = {
    upload: (input) =>
      attempt<StorageUploadResult>(async () => {
        const shotCandidate = input.path.startsWith("sessions/");
        const current = shotCandidate ? await session() : null;
        if (
          shotCandidate &&
          (input.bucket !== "media" || !current || !isShot(input.path, current.user.id))
        ) {
          return { ok: false, error: { message: "Shot path does not belong to the current user" } };
        }
        let failure: unknown;
        try {
          const result = current
            ? await uploadShot(input, current.user.id)
            : await client.storage.from(input.bucket).upload(input.path, input.body, {
                ...(input.body.type ? { contentType: input.body.type } : {}),
              });
          if (current) await requireSameUser(current.user.id);
          if (!result.error) {
            return {
              ok: true,
              data: { bucket: input.bucket, path: input.path, status: "uploaded" },
            };
          }
          failure = result.error;
        } catch (error) {
          failure = error;
        }
        if (!current) return { ok: false, error: storageError(failure) };
        await requireSameUser(current.user.id);
        try {
          await shotQueue.add({
            id: crypto.randomUUID(),
            userId: current.user.id,
            bucket: input.bucket,
            path: input.path,
            body: input.body,
          });
        } catch (error) {
          return {
            ok: false,
            error: {
              message: `IndexedDB queue failed: ${storageError(error).message}`,
              code: "QUEUE_FAILED",
            },
          };
        }
        await requireSameUser(current.user.id);
        return { ok: true, data: { bucket: input.bucket, path: input.path, status: "queued" } };
      }),
    flushPending: () => {
      if (activeFlush) return activeFlush.then(() => port.flushPending());
      const running = attempt(async () => {
        const current = await session();
        if (!current) return { ok: false, error: { message: "Authentication required" } };
        const shots = await shotQueue.list(current.user.id);
        await requireSameUser(current.user.id);
        let uploaded = 0;
        let failed = 0;
        for (const shot of shots) {
          await requireSameUser(current.user.id);
          let success = false;
          try {
            if (
              shot.bucket === "media" &&
              shot.userId === current.user.id &&
              isShot(shot.path, current.user.id)
            ) {
              const result = await uploadShot(shot, current.user.id);
              await requireSameUser(current.user.id);
              if (!result.error) success = true;
              else if (
                result.error.statusCode === "409" ||
                result.error.status === 409 ||
                result.error.message === "The resource already exists"
              ) {
                success = await matchesRemote(shot);
              }
            }
          } catch {
            success = false;
          }
          await requireSameUser(current.user.id);
          if (success) {
            try {
              await shotQueue.remove(shot.id);
              uploaded++;
            } catch {
              failed++;
            }
          } else failed++;
        }
        await requireSameUser(current.user.id);
        return { ok: true, data: { uploaded, failed } };
      });
      activeFlush = running;
      void running.then(() => {
        if (activeFlush === running) activeFlush = undefined;
      });
      return running;
    },
    dispose: () => {
      disposed = true;
      unsubscribe();
      if (typeof window !== "undefined") window.removeEventListener("online", online);
    },
    getUrl: (input) =>
      attempt(async () => {
        const { data, error } = await client.storage
          .from(input.bucket)
          .createSignedUrl(input.path, input.expiresInSeconds);
        if (error) return { ok: false, error: storageError(error) };
        if (!data || typeof data.signedUrl !== "string" || !data.signedUrl) {
          return { ok: false, error: { message: "Storage returned an invalid signed URL" } };
        }
        return { ok: true, data: data.signedUrl };
      }),
    remove: (object) =>
      attempt(async () => {
        const { error } = await client.storage.from(object.bucket).remove([object.path]);
        if (error) return { ok: false, error: storageError(error) };
        return { ok: true, data: undefined };
      }),
  };
  if (typeof window !== "undefined") {
    const schedule = () => {
      setTimeout(() => {
        if (!disposed) void port.flushPending();
      }, 0);
    };
    online = schedule;
    window.addEventListener("online", online);
    const subscription = client.auth.onAuthStateChange(schedule).data.subscription;
    unsubscribe = () => subscription.unsubscribe();
    schedule();
  }
  return port;
}
