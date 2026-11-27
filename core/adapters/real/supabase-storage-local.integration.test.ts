import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, test, vi } from "vitest";
import { createSupabaseStorage } from "./supabase-storage";
import { shotQueue } from "./storage-queue";

const enabled = process.env.LOCAL_SUPABASE_STORAGE_TEST === "1";

describe.skipIf(!enabled)("Supabase local Storage", () => {
  test("uploads a private shot, reads a signed URL and cleans up", async () => {
    const url = process.env.LOCAL_SUPABASE_URL;
    const key = process.env.LOCAL_SUPABASE_PUBLIC_KEY;
    const secret = process.env.LOCAL_SUPABASE_SECRET_KEY;
    if (!url || !key || !secret) throw new Error("Local test configuration is missing");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
      throw new Error("Storage integration test requires local Supabase");
    }
    const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
    const admin = createClient(url, secret, { auth });
    const client = createClient(url, key, { auth });
    const email = `storage-test-${randomUUID()}@example.com`;
    const password = `${randomUUID()}Aa1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const userId = created.data.user?.id;
    if (!userId) throw new Error("Failed to create local test user");
    const roomId = randomUUID();
    const sessionId = randomUUID();
    const path = `sessions/${sessionId}/0/${userId}.jpg`;
    try {
      const room = await admin
        .from("rooms")
        .insert({ id: roomId, host_id: userId, pin: "000000", status: "ended" });
      if (room.error) throw room.error;
      const member = await admin.from("room_members").insert({ room_id: roomId, user_id: userId });
      if (member.error) throw member.error;
      const session = await admin.from("sessions").insert({ id: sessionId, room_id: roomId });
      if (session.error) throw session.error;
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;
      const storage = createSupabaseStorage(client);
      const payload = new Blob(["local-shot-fixture"], { type: "image/jpeg" });
      const result = await storage.upload({ bucket: "media", path, body: payload });
      expect(result).toEqual({ ok: true, data: { bucket: "media", path, status: "uploaded" } });
      const signed = await storage.getUrl({ bucket: "media", path, expiresInSeconds: 60 });
      expect(signed.ok).toBe(true);
      if (!signed.ok) throw new Error("Signed URL unavailable");
      const downloaded = await fetch(signed.data);
      expect(downloaded.ok).toBe(true);
      expect(await downloaded.text()).toBe("local-shot-fixture");
      vi.stubGlobal("indexedDB", new IDBFactory());
      await shotQueue.add({ id: randomUUID(), userId, bucket: "media", path, body: payload });
      expect(await storage.flushPending()).toEqual({ ok: true, data: { uploaded: 1, failed: 0 } });
      expect(await shotQueue.list(userId)).toHaveLength(0);
      await shotQueue.add({
        id: randomUUID(),
        userId,
        bucket: "media",
        path,
        body: new Blob(["different"]),
      });
      expect(await storage.flushPending()).toEqual({ ok: true, data: { uploaded: 0, failed: 1 } });
      expect(await shotQueue.list(userId)).toHaveLength(1);
      storage.dispose();
    } finally {
      vi.unstubAllGlobals();
      const failures: unknown[] = [];
      try {
        const removed = await admin.storage.from("media").remove([path]);
        if (removed.error && removed.error.status !== 404) failures.push(removed.error);
      } catch (error) {
        failures.push(error);
      }
      try {
        const room = await admin.from("rooms").delete().eq("id", roomId);
        if (room.error) failures.push(room.error);
      } catch (error) {
        failures.push(error);
      }
      try {
        const deleted = await admin.auth.admin.deleteUser(userId);
        if (deleted.error) failures.push(deleted.error);
      } catch (error) {
        failures.push(error);
      }
      if (failures.length) throw new AggregateError(failures, "Local test cleanup failed");
    }
  }, 30000);
});
