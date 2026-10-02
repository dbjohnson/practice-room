import { useId, useRef, useState } from 'react';
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
export function LibraryRowMenu({
  title,
  builtin,
  onEdit,
  onCopy,
  onDelete,
}: {
  title: string;
  builtin: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const id = useId(),
    popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const action = (fn: () => void) => {
    popover.current?.hidePopover();
    fn();
  };
  return (
    <>
      <button
        className="icon-button"
        aria-label={`Actions for ${title}`}
        popoverTarget={id}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(innerWidth - 188, box.right - 180)),
            top: box.bottom + 144 < innerHeight ? box.bottom + 4 : Math.max(8, box.top - 140),
          });
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        className="gym-row-menu"
        style={position}
        role="group"
        aria-label={`Actions for ${title}`}
      >
        <button onClick={() => action(onEdit)}>
          <Pencil size={15} />
          {builtin ? 'Customize' : 'Edit'}
        </button>
        <button onClick={() => action(onCopy)}>
          <Copy size={15} />
          Duplicate
        </button>
        {!builtin && (
          <button className="danger-text" onClick={() => action(onDelete)}>
            <Trash2 size={15} />
            Delete
          </button>
        )}
      </div>
    </>
  );
}
