import { maxEditableScoreLength, validGenerationModel } from '../domain/generation';
import { GenerationJobs, validJobId } from './generationJobs';
import { generationModels } from './openrouter';
import express, { type Response } from 'express';
import type { SearchResponse, SourceHit, SourcesResponse } from '../domain/sources';
import { generateScore, generationReady, GenerationError, type GenerateRequest } from './generate';
import { bitmidi } from './sources/bitmidi';
import { mutopia } from './sources/mutopia';
import { pdmx } from './sources/pdmx';
import type { SourceProvider } from './sources/provider';
import { songsterr } from './sources/songsterr';

export interface ApiOptions {
  providers?: SourceProvider[];
  generate?: typeof generateScore;
  generationReady?: () => boolean;
  /** Generated pieces allowed per day, so a stuck client cannot run up a bill. */
  dailyGenerations?: number;
  generationJobDir?: string;
}

/** Takes turns between sources so one large catalogue does not bury the others. */
const interleave = (lists: SourceHit[][]) =>
  Array.from({ length: Math.max(0, ...lists.map((list) => list.length)) }, (_, index) =>
    lists.flatMap((list) => (index < list.length ? [list[index]] : [])),
  ).flat();

/** The app's own routes. Authentication is the host's job: the gateway in production. */
export function createApi(options: ApiOptions = {}) {
  const providers = options.providers ?? [pdmx(), mutopia, bitmidi, songsterr];
  const generate = options.generate ?? generateScore;
  const ready = options.generationReady ?? generationReady;
  const cache = new Map<string, { at: number; body: SearchResponse }>();
  let generated = { day: '', count: 0 };
  const jobs = new GenerationJobs(options.generationJobDir);
  const api = express();
  api.disable('x-powered-by');
  /** Stops upstream work when the browser gives up on a request. */
  const cancelled = (response: Response) => {
    const abort = new AbortController();
    response.on('close', () => !response.writableEnded && abort.abort());
    return abort.signal;
  };

  api.get('/sources', (_request, response) => {
    const body: SourcesResponse = {
      sources: providers.map(({ id, name, note, ready }) => ({ id, name, note, ready: ready() })),
      generation: ready(),
    };
    response.json(body);
  });

  api.get('/generation/models', async (_request, response) => {
    try {
      response.json({ models: await generationModels() });
    } catch {
      response
        .status(502)
        .json({ error: 'Could not load OpenRouter models. You can still enter a model ID.' });
    }
  });

  api.get('/sources/search', async (request, response) => {
    const query = String(request.query.q ?? '')
      .trim()
      .slice(0, 120);
    if (query.length < 2) {
      response.status(400).json({ error: 'Type at least two characters to search.' });
      return;
    }
    const key = query.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 10 * 60_000) {
      response.json(cached.body);
      return;
    }
    const active = providers.filter((provider) => provider.ready());
    const signal = cancelled(response);
    const settled = await Promise.allSettled(active.map((p) => p.search(query, signal)));
    const body: SearchResponse = {
      hits: interleave(
        settled.map((result) => (result.status === 'fulfilled' ? result.value : [])),
      ),
      failed: active.filter((_, index) => settled[index].status === 'rejected').map((p) => p.name),
    };
    if (!signal.aborted) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), body });
    }
    response.json(body);
  });

  api.get('/sources/file', async (request, response) => {
    const provider = providers.find((p) => p.id === request.query.source);
    if (!provider?.file || !provider.ready() || typeof request.query.id !== 'string') {
      response.status(404).json({ error: 'That source cannot be loaded here.' });
      return;
    }
    try {
      const file = await provider.file(request.query.id, cancelled(response));
      response.type('application/octet-stream').send(Buffer.from(file.bytes));
    } catch {
      response.status(502).json({ error: `${provider.name} could not provide that file.` });
    }
  });

  api.post('/generate', express.json({ limit: '512kb' }), async (request, response) => {
    const body = request.body as Partial<GenerateRequest> | undefined;
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!ready()) {
      response.status(503).json({ error: 'AI generation is not set up on this server yet.' });
      return;
    }
    if (
      prompt.length < 3 ||
      prompt.length > 600 ||
      !['guitar', 'bass'].includes(body?.instrument ?? '') ||
      !['beginner', 'intermediate', 'advanced'].includes(body?.level ?? '')
    ) {
      response.status(400).json({ error: 'Describe what you want to practise in a sentence.' });
      return;
    }
    if (body?.model !== undefined && !validGenerationModel(body.model)) {
      response
        .status(400)
        .json({ error: 'Choose an OpenRouter model using its provider/model ID.' });
      return;
    }
    if (
      (body?.instrumentation !== undefined &&
        (typeof body.instrumentation !== 'string' || body.instrumentation.length > 600)) ||
      (body?.currentScore !== undefined &&
        (typeof body.currentScore !== 'string' ||
          !body.currentScore.trim() ||
          body.currentScore.length > maxEditableScoreLength)) ||
      (body?.history !== undefined &&
        (!Array.isArray(body.history) ||
          body.history.length > 6 ||
          body.history.some((turn) => typeof turn !== 'string' || turn.length > 600)))
    ) {
      response
        .status(400)
        .json({ error: 'The instrumentation or score edit is too large or invalid.' });
      return;
    }
    const requestedId = request.get('Idempotency-Key');
    if (requestedId && !validJobId(requestedId)) {
      response.status(400).json({ error: 'Invalid generation request ID.' });
      return;
    }
    if (request.get('Prefer') === 'respond-async' && requestedId && (await jobs.get(requestedId))) {
      response.setHeader('Cache-Control', 'private, no-store');
      response.status(202).json({ jobId: requestedId });
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    if (generated.day !== day) generated = { day, count: 0 };
    if (generated.count >= (options.dailyGenerations ?? 40)) {
      response.status(429).json({ error: 'Today’s generation limit is reached. Try tomorrow.' });
      return;
    }
    generated.count++;
    try {
      const input: GenerateRequest = {
        prompt,
        instrument: body!.instrument!,
        level: body!.level!,
        ...(body?.instrumentation !== undefined
          ? { instrumentation: body.instrumentation.trim() }
          : {}),
        ...(body?.currentScore !== undefined ? { currentScore: body.currentScore } : {}),
        ...(body?.history !== undefined ? { history: body.history } : {}),
        ...(body?.model ? { model: body.model } : {}),
      };
      response.setHeader('Cache-Control', 'private, no-store');
      if (request.get('Prefer') === 'respond-async') {
        response.status(202).json({ jobId: await jobs.start(input, generate, requestedId) });
      } else response.json(await generate(input));
    } catch (error) {
      const known = error instanceof GenerationError ? error : new GenerationError('Try again.');
      response.status(known.status).json({ error: known.message });
    }
  });

  api.get('/generation/jobs/:id', async (request, response) => {
    response.setHeader('Cache-Control', 'private, no-store');
    const job = await jobs.get(request.params.id);
    if (!job)
      response.status(404).json({
        error: 'This generation could not be found. Please submit it again.',
      });
    else if (job.error) response.status(job.error.status).json({ error: job.error.message });
    else if (job.result) response.json(job.result);
    else response.status(202).json({ pending: true });
  });

  api.use((_request, response) => {
    response.status(404).json({ error: 'Unknown API route.' });
  });
  return api;
}

export default createApi;
