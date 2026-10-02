import { useState, type ReactNode } from 'react';
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
  return (
    <details
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
