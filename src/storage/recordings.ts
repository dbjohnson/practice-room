import type { RecordingData } from '../audio/recording';
import { storageNamespace } from '../workspace/client';

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageNamespace('practice-room-recordings'), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('audio');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Recording storage is unavailable.'));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('audio', mode);
      const request = action(tx.objectStore('audio'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(new Error('Could not save or read the recording.'));
    });
  } finally {
    db.close();
  }
}
export const storeRecording = (id: string, data: RecordingData) =>
  transaction('readwrite', (store) => store.put(data, id));
export const readRecording = (id: string): Promise<RecordingData | undefined> =>
  transaction('readonly', (store) => store.get(id));
export const clearRecordings = () => transaction('readwrite', (store) => store.clear());
