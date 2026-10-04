import type { Piece } from './types';

export interface PieceRevision {
  familyId: string;
  number: number;
  createdAt: string;
  parentId?: string;
  prompt?: string;
  model?: string;
}
export const revisionFamily = (piece: Piece) => piece.revision?.familyId ?? piece.id;
export const pieceVersions = (pieces: Piece[], piece: Piece) =>
  pieces
    .filter((item) => revisionFamily(item) === revisionFamily(piece))
    .sort((a, b) => (a.revision?.number ?? 1) - (b.revision?.number ?? 1));

/** The library shows one row per piece; every saved version remains addressable. */
export function latestVersions(pieces: Piece[]): Piece[] {
  const latest = new Map<string, Piece>();
  for (const piece of pieces) {
    const family = revisionFamily(piece);
    const previous = latest.get(family);
    if (!previous || (piece.revision?.number ?? 1) > (previous.revision?.number ?? 1))
      latest.set(family, piece);
  }
  return [...latest.values()];
}

/** Follow the selected branch, not unrelated edits made from another version. */
export function editHistory(pieces: Piece[], current: Piece): string[] {
  const history: string[] = [];
  const visited = new Set<string>();
  let piece: Piece | undefined = current;
  while (piece && history.length < 6 && !visited.has(piece.id)) {
    visited.add(piece.id);
    if (piece.revision?.prompt) history.unshift(piece.revision.prompt);
    piece = pieces.find((item) => item.id === piece?.revision?.parentId);
  }
  return history;
}
