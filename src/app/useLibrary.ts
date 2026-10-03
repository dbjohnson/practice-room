import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { model } from '@coderline/alphatab';
import type { JamRecipe, Piece } from '../domain/types';
import type { Exercise } from '../domain/gym';
import { exercisePiece, loadExerciseScore } from '../music/exerciseScore';
import { scoreKey } from '../music/transposeScore';
import { studies } from '../music/catalog';
import { createScore } from '../music/createScore';
import { importBytes, importScore, type ImportedScore } from '../music/importScore';
import { loadScore } from '../music/loadScore';
import { loadPieces, readScore, removeScore, storeScore, writeLocal } from '../storage/library';

export function useLibrary(notify: (message: string) => void, exercises: Exercise[] = []) {
  const selection = useRef(0);
  useEffect(
    () => () => {
      selection.current++;
    },
    [],
  );
  const [saved, setSaved] = useState<Piece[]>(loadPieces);
  const [piece, setPiece] = useState(studies[0]);
  const [score, setScore] = useState<model.Score>(() =>
    createScore(studies[0], studies[0].recipe!),
  );
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const cancelSelection = useCallback(() => {
    selection.current++;
    setBusy(false);
  }, []);
  const persist = (next: Piece[]) => {
    setSaved(next);
    if (!writeLocal('library', next))
      notify('Library changes are available this session, but browser storage is full.');
  };
  const select = useCallback(
    async (next: Piece) => {
      const request = ++selection.current;
      setBusy(true);
      try {
        let loaded: model.Score;
        let exerciseWarnings: string[] = [];
        if (next.source === 'exercise' && next.exercise) {
          const result = await loadExerciseScore(next.exercise, next.gymSet);
          loaded = result.score;
          exerciseWarnings = result.warnings;
          next = { ...next, bars: loaded.masterBars.length, key: scoreKey(loaded).label };
        } else if (next.source === 'import') {
          const buffer = await readScore(next.id);
          if (request !== selection.current) return false;
          if (!buffer) throw new Error('The saved file is missing. Import it again to restore it.');
          loaded = loadScore(new Uint8Array(buffer));
          // A piece saved before a tempo fix keeps its old figure; the score is the authority.
          const bpm = Math.round(loaded.tempo) || next.bpm;
          if (bpm !== next.bpm) {
            const corrected = (next = { ...next, bpm });
            setSaved((pieces) => {
              const updated = pieces.map((p) => (p.id === corrected.id ? corrected : p));
              writeLocal('library', updated);
              return updated;
            });
          }
        } else loaded = createScore(next, next.recipe!);
        if (request !== selection.current) return false;
        setPiece(next);
        setScore(loaded);
        setWarnings(
          loaded.backingTrack
            ? ['Embedded recording detected. Playing generated instruments in this prototype.']
            : exerciseWarnings,
        );
        return true;
      } catch (error) {
        if (request === selection.current)
          notify(error instanceof Error ? error.message : 'Could not open this piece.');
        return false;
      } finally {
        if (request === selection.current) setBusy(false);
      }
    },
    [notify],
  );
  const store = async (load: () => Promise<ImportedScore>) => {
    const request = ++selection.current;
    setBusy(true);
    try {
      const result = await load();
      await storeScore(result.piece.id, result.bytes);
      persist([result.piece, ...saved.filter((p) => p.id !== result.piece.id)]);
      if (request !== selection.current) return false;
      setPiece(result.piece);
      setScore(result.score);
      setWarnings(result.warnings);
      notify(`${result.piece.title} is ready. Choose the part you want to play.`);
      return true;
    } catch (error) {
      if (request === selection.current)
        notify(error instanceof Error ? error.message : 'Could not import this file.');
      return false;
    } finally {
      if (request === selection.current) setBusy(false);
    }
  };
  const upload = (file: File) => store(() => importScore(file));
  /** Adds a piece found in a catalogue or written by the AI, fetched by `bytes`. */
  const add = (
    filename: string,
    bytes: () => Promise<ArrayBuffer>,
    origin: Parameters<typeof importBytes>[2],
  ) => store(async () => importBytes(filename, await bytes(), origin));
  const saveJam = (recipe: JamRecipe): Piece => {
    cancelSelection();
    const newPiece: Piece = {
      id: crypto.randomUUID(),
      title: `${recipe.feel === 'shuffle' ? 'Shuffle' : recipe.feel === 'bossa' ? 'Bossa' : 'Straight'} in ${recipe.key}`,
      subtitle: recipe.chords.map((c) => c.name).join(' · '),
      source: 'jam',
      bpm: recipe.bpm,
      bars: recipe.chords.reduce((n, c) => n + c.bars, 0),
      key: `${recipe.key} ${recipe.minor ? 'minor' : 'major'}`,
      tags: [recipe.progression, recipe.feel],
      color: 'terracotta',
      recipe,
    };
    persist([newPiece, ...saved]);
    setPiece(newPiece);
    setScore(createScore(newPiece, recipe));
    setWarnings([]);
    return newPiece;
  };
  const remove = async (id: string) => {
    try {
      await removeScore(id);
      persist(saved.filter((p) => p.id !== id));
      if (id === piece.id) await select(studies[0]);
      notify('Removed from your library.');
    } catch {
      notify('Could not remove the saved file. Please try again.');
    }
  };
  const pieces = useMemo(
    () => [...studies, ...saved, ...exercises.map((exercise) => exercisePiece(exercise))],
    [saved, exercises],
  );
  return {
    pieces,
    piece,
    score,
    busy,
    warnings,
    select,
    cancelSelection,
    upload,
    add,
    saveJam,
    remove,
  };
}
