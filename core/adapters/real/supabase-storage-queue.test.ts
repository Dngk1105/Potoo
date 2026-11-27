import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSupabaseStorage } from "./supabase-storage";
import { shotQueue, type PendingShot } from "./storage-queue";

vi.mock("./storage-queue", () => ({ shotQueue: { add: vi.fn(), list: vi.fn(), remove: vi.fn() } }));

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const path = `sessions/${sessionId}/0/${userA}.jpg`;
let records: PendingShot[];
let user: string | null;

function setup() {
  const upload = vi.fn().mockResolvedValue({ error: { message: "offline" } });
  const download = vi.fn();
  const setHeader = vi.fn();
  const getSession = vi.fn(async () => ({
    data: { session: user ? { user: { id: user }, access_token: `token-${user}` } : null },
    error: null,
  }));
  const unsubscribe = vi.fn();
  const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe } } }));
  const client = {
    auth: { getSession, onAuthStateChange },
    storage: { from: () => ({ upload, download, setHeader }) },
  } as unknown as SupabaseClient;
  return { client, upload, download, getSession, unsubscribe, setHeader };
}

beforeEach(() => {
  records = [];
  user = userA;
  vi.resetAllMocks();
  vi.mocked(shotQueue.add).mockImplementation(async (shot) => {
    records.push(shot);
  });
  vi.mocked(shotQueue.list).mockImplementation(async (id) =>
    records.filter((shot) => shot.userId === id),
  );
  vi.mocked(shotQueue.remove).mockImplementation(async (id) => {
    records = records.filter((shot) => shot.id !== id);
  });
});

describe("shot queue orchestration", () => {
  test("retries on startup and online, then removes listeners on dispose", async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    vi.stubGlobal("window", events);
    try {
      const { client, unsubscribe } = setup();
      const adapter = createSupabaseStorage(client);
      await vi.runAllTimersAsync();
      expect(shotQueue.list).toHaveBeenCalledTimes(1);
      events.dispatchEvent(new Event("online"));
      await vi.runAllTimersAsync();
      expect(shotQueue.list).toHaveBeenCalledTimes(2);
      adapter.dispose();
      events.dispatchEvent(new Event("online"));
      await vi.runAllTimersAsync();
      expect(shotQueue.list).toHaveBeenCalledTimes(2);
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  test("queues a shot and a new adapter retries it for the same user", async () => {
    const { client, upload } = setup();
    const body = new Blob(["shot"], { type: "image/jpeg" });
    expect(
      await createSupabaseStorage(client).upload({ bucket: "media", path, body }),
    ).toMatchObject({ ok: true, data: { status: "queued" } });
    expect(records).toHaveLength(1);
    upload.mockResolvedValueOnce({ error: null });
    expect(await createSupabaseStorage(client).flushPending()).toEqual({
      ok: true,
      data: { uploaded: 1, failed: 0 },
    });
    expect(records).toHaveLength(0);
    expect(upload).toHaveBeenLastCalledWith(path, body, {
      contentType: "image/jpeg",
      headers: { Authorization: `Bearer token-${userA}` },
    });
  });

  test("does not retry another user's shot", async () => {
    const { client, upload } = setup();
    await createSupabaseStorage(client).upload({ bucket: "media", path, body: new Blob(["a"]) });
    user = userB;
    expect(await createSupabaseStorage(client).flushPending()).toEqual({
      ok: true,
      data: { uploaded: 0, failed: 0 },
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
  });

  test.each([true, false])(
    "compares a duplicate before removing the blob, matches=%s",
    async (matches) => {
      const { client, upload, download, setHeader } = setup();
      await createSupabaseStorage(client).upload({
        bucket: "media",
        path,
        body: new Blob(["same"]),
      });
      upload.mockResolvedValueOnce({ error: { statusCode: "409", message: "duplicate" } });
      download.mockResolvedValueOnce({ data: new Blob([matches ? "same" : "else"]), error: null });
      expect(await createSupabaseStorage(client).flushPending()).toEqual({
        ok: true,
        data: { uploaded: matches ? 1 : 0, failed: matches ? 0 : 1 },
      });
      expect(records).toHaveLength(matches ? 0 : 1);
      expect(setHeader).toHaveBeenCalledWith("Authorization", `Bearer token-${userA}`);
    },
  );

  test("reports queue failures and rejects another user's path", async () => {
    const { client } = setup();
    vi.mocked(shotQueue.add).mockRejectedValueOnce(new Error("quota"));
    expect(
      await createSupabaseStorage(client).upload({ bucket: "media", path, body: new Blob() }),
    ).toMatchObject({ ok: false, error: { code: "QUEUE_FAILED" } });
    user = userB;
    expect(
      await createSupabaseStorage(client).upload({ bucket: "media", path, body: new Blob() }),
    ).toMatchObject({ ok: false });
  });

  test("keeps the blob when duplicate verification cannot download", async () => {
    const { client, upload, download } = setup();
    await createSupabaseStorage(client).upload({ bucket: "media", path, body: new Blob(["a"]) });
    upload.mockResolvedValueOnce({ error: { statusCode: "409", message: "duplicate" } });
    download.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    expect(await createSupabaseStorage(client).flushPending()).toEqual({
      ok: true,
      data: { uploaded: 0, failed: 1 },
    });
    expect(records).toHaveLength(1);
  });

  test("does not delete a queued shot after a session switch during upload", async () => {
    const { client, upload } = setup();
    await createSupabaseStorage(client).upload({ bucket: "media", path, body: new Blob(["a"]) });
    upload.mockImplementationOnce(async () => {
      user = userB;
      return { error: null };
    });
    expect(await createSupabaseStorage(client).flushPending()).toMatchObject({ ok: false });
    expect(records).toHaveLength(1);
  });
});
