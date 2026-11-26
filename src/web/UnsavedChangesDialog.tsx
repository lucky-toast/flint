import { useEffect } from "react";
import { Modal } from "./Modal";

type Props = { onDiscard: () => void; onKeepEditing: () => void };

/** Asks before leaving the editor with changes that haven't been saved. */
export function UnsavedChangesDialog({ onDiscard, onKeepEditing }: Props) {
  return (
    <Modal title="Unsaved changes" onCancel={onKeepEditing}>
      <p>Your working slip has changes you haven't saved. Leave and discard them?</p>
      <div className="modal-actions">
        <button type="button" onClick={onKeepEditing}>
          Keep editing
        </button>
        <button type="button" className="danger" onClick={onDiscard}>
          Discard changes
        </button>
      </div>
    </Modal>
  );
}

/** While `active`, closing or reloading the tab asks the browser to confirm. */
export function useWarnBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
