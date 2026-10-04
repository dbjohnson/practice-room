import {
  rememberGeneration,
  acknowledgeGeneration,
  type GenerationReceipt,
} from '../storage/generationReceipts';
import type { Piece } from '../domain/types';
import type { SearchResponse, SourceHit, SourcesResponse } from '../domain/sources';

import type { GenerateInput, GenerationModel } from '../domain/generation';
export type { GenerateInput } from '../domain/generation';

export const listGenerationModels = (signal?: AbortSignal) =>
  json<{ models: GenerationModel[] }>('generation/models', { signal });

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
  if (response.redirected && /\/(?:login|auth)(?:\/|$)/.test(new URL(response.url).pathname))
    throw new Error('Your session has ended. Reload to sign in again.');
  if (response.status === 401) throw new Error('Your session has ended. Reload to sign in again.');
  const json = response.headers.get('content-type')?.includes('application/json');
  if (!response.ok) {
    const message = json ? ((await response.json()) as { error?: string }).error : undefined;
    // A static preview has no server behind it and answers every path with a page.
    throw new Error(
      message ??
        ([502, 503, 504, 522, 524].includes(response.status)
          ? `The server connection timed out or was interrupted (HTTP ${response.status}). Please try again.`
          : `The server returned an unexpected response (HTTP ${response.status}). Reload and try again.`),
    );
  }
  return response;
}
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await call(path, init);
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error(
      'The server returned a page instead of data. Reload to restore your session and try again.',
    );
  return (await response.json()) as T;
}

export const listSources = (signal?: AbortSignal) => json<SourcesResponse>('sources', { signal });

export const searchSources = (query: string, signal?: AbortSignal) =>
  json<SearchResponse>(`sources/search?q=${encodeURIComponent(query)}`, { signal });

export async function fetchSourceFile(hit: SourceHit): Promise<ArrayBuffer> {
  const query = `source=${encodeURIComponent(hit.source)}&id=${encodeURIComponent(hit.id)}`;
  return (await call(`sources/file?${query}`)).arrayBuffer();
}

export async function generatePiece(
  input: GenerateInput,
  options: { id?: string; source?: Piece } = {},
): Promise<{ alphaTex: string }> {
  const receipt = {
    id: options.id ?? crypto.randomUUID(),
    input,
    ...(options.source ? { source: options.source } : {}),
  };
  rememberGeneration(receipt);
  return resumeGeneration(receipt);
}

export async function resumeGeneration(receipt: GenerationReceipt): Promise<{ alphaTex: string }> {
  const input = receipt.input;
  const started = await json<{ alphaTex?: string; jobId?: string }>('generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'respond-async',
      'Idempotency-Key': receipt.id,
    },
    body: JSON.stringify(input),
  });
  // A synchronous response remains compatible with older servers.
  if (typeof started.alphaTex === 'string') {
    acknowledgeGeneration(receipt.id);
    return { alphaTex: started.alphaTex };
  }
  if (!started.jobId) throw new Error('The server did not start generation. Reload and try again.');
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    const result = await json<{ alphaTex?: string; pending?: boolean }>(
      `generation/jobs/${encodeURIComponent(started.jobId)}`,
    );
    if (typeof result.alphaTex === 'string') return { alphaTex: result.alphaTex };
    if (!result.pending)
      throw new Error('The server returned an incomplete generation result. Try again.');
  }
  throw new Error('Generation took longer than ten minutes. Try a shorter or simpler request.');
}
