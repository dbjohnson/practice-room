import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronUp, type LucideIcon } from 'lucide-react';

/** Closed tools do not rebuild their meters and controls on every playback update. */
export function PracticeTool({
  label,
  Icon,
  children,
}: {
  label: string;
  Icon: LucideIcon;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  // The panel floats over the score like a menu, so it dismisses like one.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (details.current) details.current.open = false;
    };
    const outside = (event: PointerEvent) => {
      if (!details.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      // A dialog or menu opened from the panel takes Escape first.
      if (event.key !== 'Escape' || document.querySelector('dialog[open], [popover]:popover-open'))
        return;
      const focused = details.current?.contains(document.activeElement);
      close();
      if (focused) details.current?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <details
      ref={details}
      name="practice-tools"
      className="practice-tool"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Icon size={16} />
        {label}
        <ChevronUp size={14} />
      </summary>
      {open && <div className="tool-content">{children}</div>}
    </details>
  );
}
