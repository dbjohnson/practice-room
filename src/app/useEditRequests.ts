import { useRef, useState } from 'react';
import { readLocal, writeLocal } from '../storage/library';

export interface EditRequest {
  id: string;
  familyId: string;
  prompt: string;
  model: string;
  status: 'working' | 'saved' | 'failed';
  error?: string;
  versionId?: string;
}
export function useEditRequests() {
  const [requests, setRequests] = useState<EditRequest[]>(() => {
    const saved = readLocal<EditRequest[]>('edit-requests', []);
    return Array.isArray(saved)
      ? saved.map((request) =>
          request.status === 'working'
            ? {
                ...request,
                status: 'failed',
                error:
                  'The page reloaded before this edit was saved. Your request is kept for retry.',
              }
            : request,
        )
      : [];
  });
  const current = useRef(requests);
  current.current = requests;
  const save = (next: EditRequest[], required = true) => {
    if (!writeLocal('edit-requests', next) && required)
      throw new Error('Could not save the edit request. Browser storage may be full.');
    current.current = next;
    setRequests(next);
  };
  return {
    requests,
    begin: (familyId: string, prompt: string, model: string) => {
      const id = crypto.randomUUID();
      save([...current.current.slice(-99), { id, familyId, prompt, model, status: 'working' }]);
      return id;
    },
    update: (id: string, update: Partial<EditRequest>) =>
      save(
        current.current.map((request) => (request.id === id ? { ...request, ...update } : request)),
        false,
      ),
  };
}
