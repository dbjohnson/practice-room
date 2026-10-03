import type { SearchResponse, SourceHit, SourcesResponse } from '../domain/sources';

export interface GenerateInput {
  prompt: string;
  instrument: 'guitar' | 'bass';
  level: 'beginner' | 'intermediate' | 'advanced';
}

/** Resolved against the page so a dev build under /dev/build/<id>/ reaches its own server. */
const endpoint = (path: string) => new URL(`api/${path}`, document.baseURI);

async function call(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(endpoint(path), { credentials: 'same-origin', ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Could not reach the Practice Room server. Check your connection.', {
      cause: error,
    });
  }
  if (response.status === 401) throw new Error('Your session has ended. Reload to sign in again.');
  const json = response.headers.get('content-type')?.includes('application/json');
  if (!response.ok) {
    const message = json ? ((await response.json()) as { error?: string }).error : undefined;
    // A static preview has no server behind it and answers every path with a page.
    throw new Error(message ?? 'Finding and creating music needs the Practice Room server.');
  }
  return response;
}
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await call(path, init);
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Finding and creating music needs the Practice Room server.');
  return (await response.json()) as T;
}

export const listSources = (signal?: AbortSignal) => json<SourcesResponse>('sources', { signal });

export const searchSources = (query: string, signal?: AbortSignal) =>
  json<SearchResponse>(`sources/search?q=${encodeURIComponent(query)}`, { signal });

export async function fetchSourceFile(hit: SourceHit): Promise<ArrayBuffer> {
  const query = `source=${encodeURIComponent(hit.source)}&id=${encodeURIComponent(hit.id)}`;
  return (await call(`sources/file?${query}`)).arrayBuffer();
}

export const generatePiece = (input: GenerateInput) =>
  json<{ alphaTex: string }>('generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
