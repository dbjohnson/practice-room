import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, link, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { defaultGenerationModel, type GenerateInput } from '../domain/generation';
import { GenerationError } from './openrouter';

export interface GenerationJob {
  started: number;
  input: GenerateInput;
  result?: { alphaTex: string };
  error?: { message: string; status: number };
}
export const validJobId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
export const generationDirectory = () =>
  resolve(
    process.env.PRACTICE_ROOM_DATA ||
      resolve(process.env.XDG_DATA_HOME || resolve(homedir(), '.local/share'), 'practice-room'),
    'generations',
  );

/** Acceptance and completion are persisted independently of the requesting browser. */
export class GenerationJobs {
  private active = new Set<string>();
  constructor(private directory = generationDirectory()) {}
  private async save(id: string, job: GenerationJob, claim = false) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = resolve(this.directory, `${id}.json`);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
    if (claim) {
      try {
        await link(temporary, file);
      } finally {
        await unlink(temporary);
      }
    } else await rename(temporary, file);
  }
  async start(
    input: GenerateInput,
    generate: (input: GenerateInput) => Promise<{ alphaTex: string }>,
    id: string = randomUUID(),
  ) {
    if (!validJobId(id)) throw new GenerationError('Invalid generation request ID.', 400);
    if (await this.get(id)) return id;
    if (this.active.size >= 20)
      throw new GenerationError('Too many active generations. Try again shortly.', 503);
    const job: GenerationJob = { started: Date.now(), input };
    try {
      await this.save(id, job, true);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return id;
      throw error;
    }
    this.active.add(id);
    const details = {
      id,
      model: input.model ?? defaultGenerationModel,
      editing: !!input.currentScore,
    };
    console.info('[generation]', JSON.stringify({ ...details, status: 'started' }));
    void (async () => {
      try {
        const result = await generate(input);
        await this.save(id, { ...job, result });
      } catch (error) {
        const known =
          error instanceof GenerationError
            ? error
            : new GenerationError('Could not finish or save this generation. Try again.');
        job.error = { message: known.message, status: known.status };
        try {
          await this.save(id, job);
        } catch {
          console.error('[generation] Could not persist failure', id);
        }
      } finally {
        this.active.delete(id);
        console.info(
          '[generation]',
          JSON.stringify({
            ...details,
            status: job.error ? 'failed' : 'saved',
            seconds: Math.round((Date.now() - job.started) / 1000),
            ...(job.error ? { error: job.error.message } : {}),
          }),
        );
      }
    })();
    return id;
  }
  async get(id: string): Promise<GenerationJob | undefined> {
    if (!validJobId(id)) return undefined;
    try {
      const job = JSON.parse(
        await readFile(resolve(this.directory, `${id}.json`), 'utf8'),
      ) as GenerationJob;
      if (!job.result && !job.error && Date.now() - job.started > 10 * 60_000)
        return {
          ...job,
          error: {
            message:
              'Generation was interrupted or took too long. Your request is retained; submit it again to retry.',
            status: 504,
          },
        };
      return job;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
}
