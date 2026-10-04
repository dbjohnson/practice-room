import { summarize } from '../audio/assessment';
import type { Piece, Take } from '../domain/types';
import { storageNamespace } from '../workspace/client';

const DB_NAME = 'practice-room-v1';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(storageNamespace(DB_NAME), 1);
    request.onupgradeneeded = () => request.result.createObjectStore('scores');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Browser storage is unavailable. Your file has not been saved.'));
  });
}
export async function storeScore(id: string, buffer: ArrayBuffer): Promise<void> {
  return storeScores([{ id, buffer }]);
}
export async function storeScores(scores: { id: string; buffer: ArrayBuffer }[]): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('scores', 'readwrite');
      for (const { id, buffer } of scores) tx.objectStore('scores').put(buffer, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error('Could not save this score. Browser storage may be full.'));
      tx.onabort = () => reject(new Error('Saving the score was interrupted.'));
    });
  } finally {
    db.close();
  }
}
export async function readScore(id: string): Promise<ArrayBuffer | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('scores').objectStore('scores').get(id);
      request.onsuccess = () => resolve(request.result as ArrayBuffer | undefined);
      request.onerror = () =>
        reject(new Error('Could not reopen the saved file. Try importing it again.'));
    });
  } finally {
    db.close();
  }
}
export async function removeScore(id: string): Promise<void> {
  return removeScores([id]);
}
export async function removeScores(ids: string[]): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('scores', 'readwrite');
      for (const id of ids) tx.objectStore('scores').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`${storageNamespace('practice-room')}:${key}`);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(`${storageNamespace('practice-room')}:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function loadPieces(): Piece[] {
  const pieces = readLocal<unknown>('library', []);
  return Array.isArray(pieces)
    ? pieces.filter(
        (p): p is Piece =>
          !!p &&
          typeof p.id === 'string' &&
          typeof p.title === 'string' &&
          ['jam', 'import'].includes(p.source) &&
          Number.isFinite(p.bpm) &&
          p.bars > 0 &&
          (p.source !== 'jam' || Array.isArray(p.recipe?.chords)),
      )
    : [];
}
export function loadTakes(): Take[] {
  const takes = readLocal<unknown>('takes', []);
  return Array.isArray(takes)
    ? takes
        .filter(
          (t): t is Take =>
            !!t &&
            typeof t.id === 'string' &&
            typeof t.pieceId === 'string' &&
            Array.isArray(t.notes) &&
            ['mono-v1', 'mono-v2', 'mono-v3', 'midi-v1'].includes(t.rubric) &&
            !!t.range,
        )
        .slice(0, 200)
        .map((take) => {
          const scores = summarize(take.notes);
          return {
            ...take,
            timingScore: scores.timingScore,
            timingCoverage: scores.timingCoverage,
            overallScore: scores.overallScore,
          };
        })
    : [];
}
