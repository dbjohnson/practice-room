import { storageNamespace } from '../workspace/client';
import { readLocal, writeLocal } from './library';
import type { GymData } from '../domain/gym';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageNamespace('practice-room-gym-v1'), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('gym');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open the gym library on this device.'));
  });
}
export async function readGym(): Promise<unknown> {
  if (typeof indexedDB === 'undefined') return readLocal('gym', null);
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('gym').objectStore('gym').get('data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function writeGym(data: GymData): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    if (!writeLocal('gym', data)) throw new Error('Could not save the gym on this device.');
    return;
  }
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('gym', 'readwrite');
      tx.objectStore('gym').put(data, 'data');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(new Error('Could not save gym changes. Browser storage may be full.'));
    });
  } finally {
    db.close();
  }
}
