import { useEffect, useState } from 'react';
import { clampTempo } from '../time/timeline';

export function TempoInput({
  value,
  onCommit,
  label,
  disabled = false,
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      min={30}
      max={240}
      step={1}
      aria-label={label}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim() ? clampTempo(Number(draft)) : value;
        setDraft(String(next));
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
