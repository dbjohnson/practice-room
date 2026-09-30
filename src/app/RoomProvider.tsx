import type { ReactNode } from 'react';
import { RoomContext } from './RoomContext';
import { useRoomState } from './useRoomState';
export function RoomProvider({ children }: { children: ReactNode }) {
  const value = useRoomState();
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
