"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";
import { IconButton } from "./ui";

/**
 * Lightweight selection/confirmation surface built on <dialog> (native focus trap, Escape to
 * close, inert background). Slides up on phones, centres on larger screens.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sheet-title"
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/60 open:[animation:sheet-in_220ms_var(--ease-out-soft)] sm:m-auto sm:max-w-md"
    >
      <div className="rounded-t-xl bg-surface-elevated px-5 pb-[calc(1.25rem+var(--safe-bottom))] pt-3 sm:rounded-xl sm:pb-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="sheet-title" className="text-section font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-1 text-support text-fg-secondary">{description}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <IconClose />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
