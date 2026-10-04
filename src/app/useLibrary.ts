import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { model } from '@coderline/alphatab';
import type { JamRecipe, Piece } from '../domain/types';
import type { Exercise } from '../domain/gym';
import { exercisePiece, loadExerciseScore } from '../music/exerciseScore';
import { scoreKey } from '../music/transposeScore';
import { studies } from '../music/catalog';
import { createScore } from '../music/createScore';
import { importBytes, importScore, type ImportedScore } from '../music/importScore';
import { loadScore } from '../music/loadScore';
import {
  loadPieces,
  readScore,
  removeScores,
  storeScore,
  storeScores,
  writeLocal,
} from '../storage/library';

import { prepareRevision } from '../music/scoreRevision';
import { pieceVersions, revisionFamily } from '../domain/revisions';
import { generationReceipts, acknowledgeGeneration } from '../storage/generationReceipts';
import { resumeGeneration } from './sourcesClient';
import { useEditRequests } from './useEditRequests';
import { loadLibraryEdits, applyLibraryEdit, type LibraryEdit } from '../storage/libraryEdits';

export function useLibrary(notify: (message: string) => void, exercises: Exercise[] = []) {
  const editRequests = useEditRequests();
  const selection = useRef(0);
  useEffect(
    () => () => {
      selection.current++;
    },
    [],
  );
  const [edits, setEdits] = useState(loadLibraryEdits);
  const saveEdits = (next: Record<string, LibraryEdit>) => {
    if (!writeLocal('library-edits', next)) {
      notify('Could not save the library change. Browser storage may be full.');
      return false;
    }
    setEdits(next);
    return true;
  };
  const [saved, setSaved] = useState<Piece[]>(loadPieces);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const [piece, setPiece] = useState(() => {
    const first = studies.find((item) => !edits[item.id]?.removed) ?? studies[0];
    return applyLibraryEdit(first, edits);
  });
  const [score, setScore] = useState<model.Score>(() => createScore(piece, piece.recipe!));
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const cancelSelection = useCallback(() => {
    selection.current++;
    setBusy(false);
  }, []);
  const persist = (next: Piece[], requireSave = false) => {
    const stored = writeLocal('library', next);
    if (!stored && requireSave)
      throw new Error('Could not save version history. Browser storage may be full.');
    savedRef.current = next;
    setSaved(next);
    if (!stored) notify('Library changes are available this session, but browser storage is full.');
  };
  const select = useCallback(
    async (next: Piece) => {
      next = applyLibraryEdit(next, edits);
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
          const key = scoreKey(loaded).label;
          if (bpm !== next.bpm || key !== next.key) {
            const corrected = (next = { ...next, bpm, key });
            setSaved((pieces) => {
              const updated = pieces.map((p) => (p.id === corrected.id ? corrected : p));
              writeLocal('library', updated);
              return updated;
            });
          }
        } else loaded = createScore(next, next.recipe!);
        if (request !== selection.current) return false;
        loaded.title = next.title;
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
    [notify, edits],
  );
  const store = async (load: () => Promise<ImportedScore>) => {
    const request = ++selection.current;
    setBusy(true);
    try {
      const result = await load();
      await storeScore(result.piece.id, result.bytes);
      persist([result.piece, ...loadPieces().filter((p) => p.id !== result.piece.id)], true);
      if (request !== selection.current) return true;
      const title = edits[revisionFamily(result.piece)]?.title ?? result.piece.title;
      result.score.title = title;
      setPiece(applyLibraryEdit(result.piece, edits));
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
    persist([newPiece, ...savedRef.current]);
    setPiece(newPiece);
    setScore(createScore(newPiece, recipe));
    setWarnings([]);
    return newPiece;
  };
  const revise = async (
    displayed: model.Score,
    prompt: string,
    modelId: string,
    compose: (requestId: string) => Promise<string>,
  ) => {
    const requestId = editRequests.begin(revisionFamily(piece), prompt, modelId);
    const request = ++selection.current;
    setBusy(true);
    try {
      const alphaTex = await compose(requestId);
      const result = await prepareRevision(
        piece,
        displayed,
        savedRef.current,
        alphaTex,
        prompt,
        modelId,
      );
      const generatedId = result.piece.id;
      result.piece.id = `version-${requestId}`;
      for (const buffer of result.buffers)
        if (buffer.id === generatedId) buffer.id = result.piece.id;
      await storeScores(result.buffers);
      persist(
        [
          result.piece,
          result.original,
          ...loadPieces().filter((p) => p.id !== result.original.id && p.id !== result.piece.id),
        ],
        true,
      );
      acknowledgeGeneration(requestId);
      editRequests.update(requestId, {
        status: 'saved',
        versionId: result.piece.id,
      });
      if (request !== selection.current) {
        notify(
          `Saved version ${result.piece.revision!.number} of ${result.piece.title} in your library.`,
        );
        return true;
      }
      const title = edits[revisionFamily(result.piece)]?.title ?? result.piece.title;
      result.score.title = title;
      setPiece(applyLibraryEdit(result.piece, edits));
      setScore(result.score);
      setWarnings(result.warnings);
      notify(`Saved version ${result.piece.revision!.number}. Earlier versions are kept.`);
      return true;
    } catch (error) {
      editRequests.update(requestId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Could not save this edit.',
      });
      throw error;
    } finally {
      if (request === selection.current) setBusy(false);
    }
  };
  const recoverRef =
    useRef<(receipt: ReturnType<typeof generationReceipts>[number]) => Promise<void>>(null);
  recoverRef.current = async (receipt) => {
    try {
      editRequests.update(receipt.id, { status: 'working', error: undefined });
      const { alphaTex } = await resumeGeneration(receipt);
      const existing = loadPieces();
      if (receipt.source && receipt.input.currentScore) {
        const id = `version-${receipt.id}`;
        if (!existing.some((item) => item.id === id)) {
          const originalScore = loadScore(new TextEncoder().encode(receipt.input.currentScore));
          const result = await prepareRevision(
            receipt.source,
            originalScore,
            existing,
            alphaTex,
            receipt.input.prompt,
            receipt.input.model ?? 'default',
          );
          const generatedId = result.piece.id;
          result.piece.id = id;
          for (const buffer of result.buffers) if (buffer.id === generatedId) buffer.id = id;
          await storeScores(result.buffers);
          persist(
            [
              result.piece,
              result.original,
              ...loadPieces().filter((item) => item.id !== id && item.id !== result.original.id),
            ],
            true,
          );
        }
        editRequests.update(receipt.id, { status: 'saved', versionId: id });
      } else {
        const result = await importBytes(
          'piece.alphatex',
          new TextEncoder().encode(alphaTex).buffer,
          {
            source: 'generated',
            name: 'Written for you',
            id: receipt.input.prompt,
            licence: 'Generated for your practice',
            url: '',
          },
        );
        if (!existing.some((item) => item.id === result.piece.id)) {
          await storeScore(result.piece.id, result.bytes);
          persist([result.piece, ...loadPieces()], true);
        }
      }
      acknowledgeGeneration(receipt.id);
      notify('Recovered a completed generation into your library.');
    } catch (error) {
      editRequests.update(receipt.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Could not recover the generation.',
      });
      // Background recovery failures belong to the saved chat request, not a new toast.
    }
  };
  const recovering = useRef(false);
  useEffect(() => {
    if (recovering.current) return;
    recovering.current = true;
    for (const receipt of generationReceipts()) void recoverRef.current?.(receipt);
    // Repair the old import placeholder without requiring each song to be opened.
    void (async () => {
      const keys = new Map<string, string>();
      for (const item of loadPieces().filter(
        (item) => item.source === 'import' && item.key === 'Imported',
      )) {
        try {
          const bytes = await readScore(item.id);
          if (bytes) keys.set(item.id, scoreKey(loadScore(new Uint8Array(bytes))).label);
        } catch {
          // Leave missing or unreadable files for the existing open-score error handling.
        }
      }
      if (!keys.size) return;
      persist(
        loadPieces().map((item) =>
          item.key === 'Imported' && keys.has(item.id)
            ? { ...item, key: keys.get(item.id)! }
            : item,
        ),
      );
      setPiece((current) =>
        current.key === 'Imported' && keys.has(current.id)
          ? { ...current, key: keys.get(current.id)! }
          : current,
      );
    })();
  }, []);
  const pieces = useMemo(
    () =>
      [...studies, ...saved, ...exercises.map((exercise) => exercisePiece(exercise))]
        .filter((item) => !edits[revisionFamily(item)]?.removed)
        .map((item) => applyLibraryEdit(item, edits)),
    [saved, exercises, edits],
  );
  const rename = (id: string, name: string) => {
    const title = name.trim();
    const target = pieces.find((item) => item.id === id);
    if (!target || !title || title.length > 200) return false;
    const family = revisionFamily(target);
    if (!saveEdits({ ...edits, [family]: { ...edits[family], title } })) return false;
    if (revisionFamily(piece) === family) {
      setPiece((current) => ({ ...current, title }));
      const renamed = model.JsonConverter.jsObjectToScore(
        model.JsonConverter.scoreToJsObject(score),
      );
      renamed.title = title;
      setScore(renamed);
    }
    notify('Song renamed.');
    return true;
  };
  const describe = (id: string, description: string) => {
    const target = pieces.find((item) => item.id === id);
    const subtitle = description.trim();
    if (!target || subtitle.length > 600) return false;
    const family = revisionFamily(target);
    if (!saveEdits({ ...edits, [family]: { ...edits[family], subtitle } })) return false;
    if (revisionFamily(piece) === family) setPiece((current) => ({ ...current, subtitle }));
    return true;
  };
  const remove = async (id: string) => {
    const target = pieces.find((item) => item.id === id);
    if (!target) return;
    const ids = new Set(pieceVersions(pieces, target).map((item) => item.id));
    setBusy(true);
    try {
      if (target.source === 'study') {
        const family = revisionFamily(target);
        if (!saveEdits({ ...edits, [family]: { ...edits[family], removed: true } })) return;
      } else {
        await removeScores([...ids]);
        persist(savedRef.current.filter((item) => !ids.has(item.id)));
      }
      if (ids.has(piece.id)) {
        const next = pieces.find((item) => !ids.has(item.id) && item.source !== 'exercise');
        if (next) await select(next);
      }
      notify('Removed from your library.');
    } catch {
      notify('Could not remove the saved file. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return {
    pieces,
    editRequests: editRequests.requests,
    empty: !pieces.some((item) => item.source !== 'exercise') && piece.source !== 'exercise',
    rename,
    describe,
    piece,
    score,
    busy,
    warnings,
    select,
    cancelSelection,
    upload,
    add,
    saveJam,
    revise,
    remove,
  };
}
