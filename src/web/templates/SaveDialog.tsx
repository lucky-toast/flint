import { useState, type FormEvent } from "react";
import type { Shop, Template } from "../../core";
import { Modal } from "../Modal";
import { suggestedName } from "./saved-templates";
import { overwrite, saveAsNew, useSavedTemplates } from "./useSavedTemplates";

type Props = {
  shop: Shop;
  /** The template being edited: names the suggestion, and is the default overwrite target when it's the seller's own. */
  template: Template;
  source: string;
  onSaved: (template: Template) => void;
  onCancel: () => void;
};

/** Save as new (the default, with a suggested name) or overwrite one of the seller's own templates. */
export function SaveDialog({ shop, template, source, onSaved, onCancel }: Props) {
  const own = useSavedTemplates(shop);
  const [mode, setMode] = useState<"new" | "overwrite">("new");
  const [name, setName] = useState(() => suggestedName(template.name, own));
  const [targetId, setTargetId] = useState(() => (own.some((t) => t.id === template.id) ? template.id : own[0]?.id));
  const [error, setError] = useState<string>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "new") {
        const trimmed = name.trim();
        if (!trimmed) return setError("Give the template a name.");
        onSaved(saveAsNew(shop, { name: trimmed, paper: template.paper, source }));
      } else if (targetId) {
        onSaved(overwrite(shop, targetId, source));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal title="Save template" onCancel={onCancel}>
      <form className="save-form" onSubmit={submit}>
        <label className="save-option">
          <input type="radio" name="save-mode" checked={mode === "new"} onChange={() => setMode("new")} />
          Save as new
        </label>
        <label className="save-field">
          Name
          <input
            type="text"
            value={name}
            maxLength={80}
            disabled={mode !== "new"}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {/* Only the seller's own templates can be overwritten; built-ins are never listed. */}
        {own.length > 0 && (
          <>
            <label className="save-option">
              <input
                type="radio"
                name="save-mode"
                checked={mode === "overwrite"}
                onChange={() => setMode("overwrite")}
              />
              Overwrite
            </label>
            <label className="save-field">
              Template to overwrite
              <select value={targetId} disabled={mode !== "overwrite"} onChange={(e) => setTargetId(e.target.value)}>
                {own.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {error && (
          <p className="save-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
