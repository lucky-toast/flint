import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  /** Escape or the dialog's own cancel. */
  onCancel: () => void;
  children: ReactNode;
};

/** A modal dialog (native <dialog>, so focus stays inside), named by its heading. Render it to open it. */
export function Modal({ title, onCancel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
