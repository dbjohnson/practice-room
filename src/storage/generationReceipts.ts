import type { GenerateInput } from '../domain/generation';
import type { Piece } from '../domain/types';
import { readLocal, writeLocal } from './library';

export interface GenerationReceipt {
  id: string;
  input: GenerateInput;
  source?: Piece;
}
export const generationReceipts = (): GenerationReceipt[] => {
  const saved = readLocal<GenerationReceipt[]>('pending-generations', []);
  return Array.isArray(saved)
    ? saved.filter((item) => typeof item?.id === 'string' && item.input?.prompt)
    : [];
};
export function rememberGeneration(receipt: GenerationReceipt) {
  if (
    !writeLocal('pending-generations', [
      ...generationReceipts().filter((item) => item.id !== receipt.id),
      receipt,
    ])
  )
    throw new Error(
      'Could not save the generation receipt. Free some browser storage before submitting.',
    );
}
export function acknowledgeGeneration(id: string) {
  writeLocal(
    'pending-generations',
    generationReceipts().filter((item) => item.id !== id),
  );
}
