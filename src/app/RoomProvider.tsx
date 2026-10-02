import type { ReactNode } from 'react';
import { RoomContext } from './RoomContext';
import { useRoomNavigation } from './useRoomNavigation';
import { useRoomState } from './useRoomState';
export function RoomProvider({ children }: { children: ReactNode }) {
  const value = useRoomState();
  useRoomNavigation(value);
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
