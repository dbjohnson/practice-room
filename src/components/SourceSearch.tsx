import { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react';
import { fetchSourceFile, searchSources } from '../app/sourcesClient';
import type { SearchResponse, SourceHit, SourceInfo } from '../domain/sources';
import { ScorePreview } from './ScorePreview';

const extension = { musicxml: 'mxl', midi: 'mid', link: '' };

export function SourceSearch({
  sources,
  busy,
  shown = true,
  onAdd,
  onPreview,
}: {
  sources: SourceInfo[];
  busy: boolean;
  /** False while the search stays mounted behind another section; a preview must not keep playing there. */
  shown?: boolean;
  /** Called as a preview opens, so whatever else is sounding can stop. */
  onPreview?: () => void;
  onAdd: (
    hit: SourceHit,
    name: string,
    filename: string,
    bytes: () => Promise<ArrayBuffer>,
  ) => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [state, setState] = useState<'idle' | 'searching' | string>('idle');
  const [adding, setAdding] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  // A previewed file is kept so adding it does not ask the source for it again.
  const files = useRef(new Map<string, Promise<ArrayBuffer>>());
  const fileOf = (key: string, hit: SourceHit) => {
    let file = files.current.get(key);
    if (!file) {
      files.current.set(key, (file = fetchSourceFile(hit)));
      file.catch(() => files.current.delete(key));
    }
    return file;
  };
  useEffect(() => () => request.current?.abort(), []);
  const search = async () => {
    request.current?.abort();
    const abort = (request.current = new AbortController());
    setState('searching');
    try {
      const found = await searchSources(query.trim(), abort.signal);
      files.current.clear();
      setPreviewing(null);
      setResult(found);
      setState('idle');
    } catch (error) {
      if (abort.signal.aborted) return;
      setState(error instanceof Error ? error.message : 'Search failed.');
    }
  };
  const nameOf = (id: string) => sources.find((source) => source.id === id)?.name ?? id;
  return (
    <>
      <form
        className="find-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) void search();
        }}
      >
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search music catalogues"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A title, composer or style…"
          />
        </label>
        <button className="button button-dark" disabled={query.trim().length < 2}>
          {state === 'searching' ? <LoaderCircle size={16} className="spin" /> : 'Search'}
        </button>
      </form>
      {state !== 'idle' && state !== 'searching' && (
        <div className="notice notice-error" role="alert">
          {state}
        </div>
      )}
      {result && !!result.failed.length && (
        <p className="muted-copy">No answer from {result.failed.join(', ')}. Showing the rest.</p>
      )}
      {result && !result.hits.length && state === 'idle' && (
        <p className="body-copy">Nothing matched. Try fewer words, or a composer’s name.</p>
      )}
      <ul className="find-results">
        {result?.hits.map((hit) => {
          const key = `${hit.source}:${hit.id}`;
          const filename = `${hit.title}.${extension[hit.format]}`;
          return (
            <li key={key}>
              <div className="find-hit">
                <div>
                  <strong>{hit.title}</strong>
                  <span>{[hit.artist, hit.detail].filter(Boolean).join(' · ')}</span>
                  <small className={hit.open ? 'licence-open' : ''}>
                    {hit.open ? <ShieldCheck size={12} /> : <ShieldQuestion size={12} />}
                    {nameOf(hit.source)} · {hit.licence}
                  </small>
                </div>
                {hit.format === 'link' ? (
                  <a
                    className="button button-quiet"
                    href={hit.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> Open
                  </a>
                ) : (
                  <>
                    <button
                      className="button button-quiet"
                      aria-expanded={previewing === key}
                      aria-label={`${previewing === key ? 'Close the preview of' : 'Preview'} ${hit.title}`}
                      onClick={() => {
                        if (previewing !== key) onPreview?.();
                        setPreviewing(previewing === key ? null : key);
                      }}
                    >
                      {previewing === key ? <EyeOff size={14} /> : <Eye size={14} />}{' '}
                      {previewing === key ? 'Close' : 'Preview'}
                    </button>
                    <button
                      className="button button-quiet"
                      disabled={busy || !!adding}
                      aria-label={`Add ${hit.title} to your library`}
                      onClick={() => {
                        setAdding(key);
                        onAdd(hit, nameOf(hit.source), filename, () =>
                          fileOf(key, hit).finally(() => setAdding(null)),
                        );
                      }}
                    >
                      {adding === key ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Plus size={14} />
                      )}{' '}
                      Add
                    </button>
                  </>
                )}
              </div>
              {previewing === key && shown && (
                <ScorePreview filename={filename} load={() => fileOf(key, hit)} />
              )}
            </li>
          );
        })}
      </ul>
      {!result && (
        <ul className="find-sources">
          {sources.map((source) => (
            <li key={source.id} className={source.ready ? '' : 'is-off'}>
              <strong>{source.name}</strong>
              {source.ready ? source.note : 'Not installed on this server yet.'}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
