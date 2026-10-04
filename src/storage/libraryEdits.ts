import { readLocal } from './library';

export interface LibraryEdit {
  title?: string;
  subtitle?: string;
  removed?: boolean;
}
export function loadLibraryEdits(): Record<string, LibraryEdit> {
  const value = readLocal<unknown>('library-edits', {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, edit]) =>
        edit &&
        typeof edit === 'object' &&
        (edit.title === undefined || typeof edit.title === 'string') &&
        (edit.subtitle === undefined || typeof edit.subtitle === 'string') &&
        (edit.removed === undefined || typeof edit.removed === 'boolean'),
    ),
  );
}

export function applyLibraryEdit(
  piece: import('../domain/types').Piece,
  edits: Record<string, LibraryEdit>,
) {
  const edit = edits[piece.revision?.familyId ?? piece.id];
  return {
    ...piece,
    title: edit?.title ?? piece.title,
    subtitle: edit?.subtitle ?? piece.subtitle,
  };
}
