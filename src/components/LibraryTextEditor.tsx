import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

export function LibraryTextEditor({
  value,
  label,
  disabled,
  required = false,
  onSave,
  onOpen,
}: {
  value: string;
  label: string;
  disabled: boolean;
  required?: boolean;
  onSave: (value: string) => boolean;
  onOpen?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const begin = () => {
    setDraft(value);
    setError(false);
    setEditing(true);
  };
  if (!editing)
    return (
      <div className={`library-editable ${required ? 'is-title' : ''}`}>
        <button
          className={required ? 'library-piece-title' : 'library-description'}
          disabled={disabled}
          onClick={onOpen ?? begin}
        >
          {value || 'Add description…'}
        </button>
        <button
          className="icon-button library-edit-trigger"
          aria-label={`Edit ${label.toLowerCase()}`}
          title={`Edit ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={begin}
        >
          <Pencil size={13} />
        </button>
      </div>
    );
  return (
    <form
      className="library-inline-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (required && !draft.trim()) return;
        if (onSave(draft.trim())) setEditing(false);
        else setError(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setEditing(false);
        }
        if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
      }}
    >
      <input
        autoFocus
        aria-label={label}
        value={draft}
        maxLength={required ? 200 : 600}
        required={required}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(false);
        }}
      />
      <button
        className="icon-button"
        aria-label={`Save ${label.toLowerCase()}`}
        disabled={disabled || (required && !draft.trim())}
      >
        <Check size={15} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={`Cancel ${label.toLowerCase()} edit`}
        onClick={() => setEditing(false)}
      >
        <X size={15} />
      </button>
      {error && <span role="alert">Could not save. Please try again.</span>}
    </form>
  );
}
