export type PendingShot = {
  id: string;
  userId: string;
  bucket: string;
  path: string;
  body: Blob;
};

const databaseName = "potoo-storage-queue";
const storeName = "shots";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(storeName, { keyPath: "id" });
      store.createIndex("userId", "userId");
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("IndexedDB is blocked"));
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = operation(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () =>
        reject(tx.error ?? request.error ?? new Error("IndexedDB transaction aborted"));
      tx.onerror = () =>
        reject(tx.error ?? request.error ?? new Error("IndexedDB transaction failed"));
    });
  } finally {
    db.close();
  }
}

export const shotQueue = {
  async add(shot: PendingShot): Promise<void> {
    await transaction("readwrite", (store) => store.add(shot));
  },
  list(userId: string): Promise<PendingShot[]> {
    return transaction("readonly", (store) => store.index("userId").getAll(userId));
  },
  async remove(id: string): Promise<void> {
    await transaction("readwrite", (store) => store.delete(id));
  },
};
