import { useEffect, useRef, useState } from 'react';
import { navigationHash, readNavigation, type NavigationState } from './navigation';
import type { useRoomState } from './useRoomState';

type Room = ReturnType<typeof useRoomState>;
type Destination = { route: NavigationState; loading: boolean };

/** URL-driven navigation and UI-driven history share one guarded transition. */
export function useRoomNavigation(room: Room) {
  const latest = useRef(room);
  latest.current = room;
  const pending = useRef<Destination | null>(null);
  const handledHash = useRef<string | null>(null);
  const [revision, refresh] = useState(0);
  const current = navigationHash({
    song: room.library.piece.id,
    gym: room.gymView,
    section: room.page,
    part: room.track,
    view: room.view,
    zoom: room.zoom,
    transpose: room.transpose,
  });

  useEffect(() => {
    if (room.gymStore && !room.gymStore.ready) return;
    let active = true;
    const restore = () => {
      if (handledHash.current === window.location.hash) return;
      handledHash.current = window.location.hash;
      const r = latest.current;
      const route = readNavigation(window.location.hash);
      const piece =
        r.library.pieces.find((p) => p.id === route.song) ??
        r.library.pieces.find((p) => p.source !== 'exercise');
      if (!piece) {
        route.song = r.library.piece.id;
        if (route.section === 'practice') route.section = 'library';
        pending.current = { route, loading: false };
        refresh((value) => value + 1);
        return;
      }
      if (piece.id !== route.song)
        r.notify(`That song is not in this browser’s library. Opened ${piece.title}.`);
      route.song = piece.id;
      const destination = { route, loading: r.library.piece.id !== piece.id };
      pending.current = destination;
      if (r.player.playing || r.takes.recording || r.takePlayback.active || r.preparingReplay)
        r.halt();
      r.library.cancelSelection();
      if (destination.loading) {
        void r.library.select(piece).then((loaded) => {
          if (!active || pending.current !== destination) return;
          if (!loaded) destination.route.song = latest.current.library.piece.id;
          destination.loading = false;
          refresh((value) => value + 1);
        });
      }
      refresh((value) => value + 1);
    };
    restore();
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      active = false;
      pending.current = null;
      handledHash.current = null;
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
  }, [room.gymStore?.ready]);

  useEffect(() => {
    const destination = pending.current;
    if (destination) {
      if (destination.loading || room.library.piece.id !== destination.route.song) return;
      const route = destination.route;
      if (room.setGymView && room.gymView !== route.gym) room.setGymView(route.gym ?? 'exercises');
      route.part = Math.min(route.part, Math.max(0, room.library.score.tracks.length - 1));
      if (current !== navigationHash(route)) {
        if (room.page !== route.section) room.setPage(route.section);
        if (room.track !== route.part) room.setTrack(route.part);
        if (room.view !== route.view) room.setView(route.view);
        if (room.zoom !== route.zoom) room.setZoom(route.zoom);
        if (room.transpose !== route.transpose && !room.setTranspose(route.transpose)) {
          route.transpose = room.transpose;
          refresh((value) => value + 1);
        }
        return;
      }
      pending.current = null;
      handledHash.current = current;
      window.history.replaceState(window.history.state, '', current);
      return;
    }
    if (room.library.busy || (room.gymStore && !room.gymStore.ready)) return;
    // Coalesce selecting a song, its default part, and the resulting page change.
    const timer = window.setTimeout(() => {
      if (pending.current || current === window.location.hash) return;
      handledHash.current = current;
      window.history.pushState(null, '', current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [current, revision, room.library.busy, room.library.score, room]);
}
