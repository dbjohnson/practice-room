import { useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  Drum,
  Guitar,
  Piano,
  Play,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { TempoInput } from '../components/TempoInput';
import { useRoom } from '../app/RoomContext';
import type { Feel, JamRecipe } from '../domain/types';
import { createRecipe, keys, parseJam } from '../music/jam';

export function JamPage() {
  const r = useRoom();
  const [prompt, setPrompt] = useState('shuffle beat ii–V–I in A');
  const [recipe, setRecipe] = useState<JamRecipe>(() => createRecipe());
  const [error, setError] = useState<string | null>(null);
  const update = (values: Partial<JamRecipe>) => {
    const next = { ...recipe, ...values };
    setRecipe(createRecipe(next.key, next.progression, next.feel, next.bpm, next.minor));
    setError(null);
  };
  const generate = () => {
    try {
      setRecipe(parseJam(prompt));
      setError(null);
      r.notify('Your arrangement is ready. Edit it below, then bring in the band.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try a simpler musical description.');
    }
  };
  return (
    <div className="jam-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" />A BAND FOR THE MOMENT
          </div>
          <h1>What do you feel like playing?</h1>
          <p>A simple idea. A few good players. Somewhere to take your music.</p>
        </div>
        <span className="pill">
          <AudioLines size={14} />
          Create a backing track
        </span>
      </div>
      <div className="jam-composer">
        <div className="composer-label">
          <WandSparkles size={18} />
          <span>DESCRIBE YOUR BACKING TRACK</span>
        </div>
        <form
          className="jam-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
        >
          <input
            aria-label="Describe your jam"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="shuffle ii-V-I in A at 90 BPM"
          />
          <button className="button button-dark" type="submit">
            <Sparkles size={16} />
            Arrange it
          </button>
        </form>
        <div className="prompt-suggestions">
          <span>TRY A LITTLE</span>
          {['12-bar blues in E at 100 BPM', 'bossa ii-V-I in D minor', 'straight I-IV-V in G'].map(
            (text) => (
              <button
                key={text}
                onClick={() => {
                  setPrompt(text);
                  try {
                    setRecipe(parseJam(text));
                    setError(null);
                  } catch {
                    /* Presets are validated in tests. */
                  }
                }}
              >
                {text}
                <ArrowRight size={12} />
              </button>
            ),
          )}
        </div>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="jam-workspace">
        <section className="arrangement-card">
          <div className="arrangement-title">
            <div>
              <div className="eyebrow">YOUR ARRANGEMENT</div>
              <h2>
                {recipe.feel === 'shuffle'
                  ? 'A little swing in'
                  : recipe.feel === 'bossa'
                    ? 'An easy bossa in'
                    : 'A steady groove in'}{' '}
                {recipe.key}.
              </h2>
            </div>
            <span className="pill">4/4 · {recipe.chords.reduce((n, c) => n + c.bars, 0)} bars</span>
          </div>
          <p className="arrangement-note">
            {recipe.minor ? 'Minor harmony' : 'Major harmony'} · seventh chords · an editable
            starting point
          </p>
          <div className="chord-cards">
            {recipe.chords.map((chord, i) => (
              <div className="chord-card" key={i} style={{ flexGrow: chord.bars }}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{chord.name}</strong>
                <small>
                  {chord.bars} {chord.bars === 1 ? 'bar' : 'bars'}
                </small>
                <div className="chord-pulses">
                  {Array.from({ length: Math.min(chord.bars, 4) }, (_, index) => (
                    <i key={index} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="arrangement-controls">
            <label>
              Key
              <select
                aria-label="Jam key"
                value={recipe.key}
                onChange={(e) => update({ key: e.target.value })}
              >
                {keys.map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </label>
            <label>
              Harmony
              <select
                aria-label="Jam harmony"
                value={recipe.minor ? 'minor' : 'major'}
                onChange={(e) => update({ minor: e.target.value === 'minor' })}
              >
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
            </label>
            <label>
              Progression
              <select
                aria-label="Jam progression"
                value={recipe.progression}
                onChange={(e) =>
                  update({ progression: e.target.value as JamRecipe['progression'] })
                }
              >
                {['ii-V-I', 'I-IV-V', '12-bar blues'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Tempo
              <TempoInput
                value={recipe.bpm}
                label="Jam tempo"
                onCommit={(bpm) => update({ bpm })}
              />
            </label>
          </div>
          <div className="feel-options">
            <span>THE FEEL</span>
            {(['shuffle', 'straight', 'bossa'] as Feel[]).map((feel) => (
              <button
                key={feel}
                className={recipe.feel === feel ? 'selected' : ''}
                aria-pressed={recipe.feel === feel}
                onClick={() => update({ feel })}
              >
                {feel === 'shuffle'
                  ? 'Shuffle · 2:1'
                  : feel === 'straight'
                    ? 'Straight eighths'
                    : 'Bossa'}
              </button>
            ))}
          </div>
          <div className="jam-launch">
            <span>Saved to your library when you enter the room.</span>
            <button
              className="button button-primary"
              onClick={() => {
                r.library.saveJam(recipe);
                r.setMode('listen');
                r.setPage('practice');
                r.notify('Your band is ready. Press play to listen, or mute a part and join in.');
              }}
            >
              <Play size={15} fill="currentColor" />
              Bring in the band
            </button>
          </div>
        </section>
        <aside className="band-card">
          <div className="eyebrow">MEET YOUR BAND</div>
          <h3>
            Everyone has
            <br />a little part to play.
          </h3>
          {[
            { icon: Guitar, name: 'Lead guitar', part: 'A melody to learn or make your own' },
            { icon: Guitar, name: 'Electric bass', part: 'Roots, fifths and a steady foundation' },
            { icon: Piano, name: 'Warm keys', part: 'Space, color and seventh chords' },
            { icon: Drum, name: 'Studio drums', part: 'A pocket with room for you' },
          ].map(({ icon: Icon, name, part }) => (
            <div className="band-member" key={name}>
              <span>
                <Icon size={21} strokeWidth={1.5} />
              </span>
              <div>
                <strong>{name}</strong>
                <small>{part}</small>
              </div>
            </div>
          ))}
          <p className="band-note">
            Change the balance or mute your part in the practice room. Every part is rendered from
            the arrangement with sampled instruments.
          </p>
        </aside>
      </div>
    </div>
  );
}
