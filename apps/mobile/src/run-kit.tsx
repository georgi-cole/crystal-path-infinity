import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AdventureIcon } from './expedition-art';
import './run-kit.css';

export function RunKitButton({
  warning,
  disabled,
  open,
  onClick,
}: {
  warning: boolean;
  disabled: boolean;
  open: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (open) returnFocus.current = true;
    else if (returnFocus.current && !disabled) {
      ref.current?.focus({ preventScroll: true });
      returnFocus.current = false;
    }
  }, [open, disabled]);
  return (
    <button
      ref={ref}
      type="button"
      className="cpi-hud-control cpi-kit-toggle"
      data-warning={warning}
      aria-label={warning ? 'Open gear and supplies, check your gear' : 'Open gear and supplies'}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
    >
      <AdventureIcon name="pack" />
      <span>Kit</span>
      {warning && <i aria-hidden="true">!</i>}
    </button>
  );
}

export function RunKitDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="cpi-run-kit"
      aria-labelledby="cpi-kit-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      <header>
        <span className="cpi-kit-emblem">
          <AdventureIcon name="pack" />
        </span>
        <div>
          <h2 id="cpi-kit-title">Gear &amp; supplies</h2>
          <small>Paused while you choose</small>
        </div>
        <button type="button" className="cpi-kit-close" aria-label="Close kit" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
      <button type="button" className="cpi-kit-return" onClick={onClose}>
        Back to the crossing <span aria-hidden="true">›</span>
      </button>
    </dialog>
  );
}
