import { useState } from "react";
import type { Shop, Template } from "../../core";
import { liquidFileName } from "../templates/saved-templates";
import { SaveDialog } from "../templates/SaveDialog";

type Props = {
  shop: Shop;
  template: Template;
  /** The working slip's source: what gets saved and downloaded. */
  source: string;
  /** Saving waits while Flint is replying. */
  disabled: boolean;
  onSaved: (template: Template) => void;
};

/** Downloads text as a file through a temporary link. */
function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Prints the working slip from its preview frame, whose document sets the paper's @page size. */
function printWorkingSlip() {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Working slip"]');
  frame?.contentWindow?.print();
}

/** Save, download and print for the working slip. */
export function SlipActions({ shop, template, source, disabled, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="slip-actions">
      <button type="button" onClick={() => setSaving(true)} disabled={disabled}>
        Save…
      </button>
      <button type="button" onClick={() => downloadText(liquidFileName(template.name), source)}>
        Download
      </button>
      <button type="button" onClick={printWorkingSlip}>
        Print
      </button>
      {saving && (
        <SaveDialog
          shop={shop}
          template={template}
          source={source}
          onCancel={() => setSaving(false)}
          onSaved={(saved) => {
            setSaving(false);
            onSaved(saved);
          }}
        />
      )}
    </div>
  );
}
