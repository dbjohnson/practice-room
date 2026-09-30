import { createContext, useContext } from 'react';
import type { useRoomState } from './useRoomState';
type Room = ReturnType<typeof useRoomState>;
export const RoomContext = createContext<Room | null>(null);
export function useRoom(): Room {
  const room = useContext(RoomContext);
  if (!room) throw new Error('RoomProvider is missing.');
  return room;
}
