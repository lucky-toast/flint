import { useId, useState, type FormEvent } from "react";
import { suggestAssetName, type UploadResult } from "../assets/asset-store";

export type OnUpload = (file: File, name: string) => Promise<UploadResult>;

type Props = { onUpload: OnUpload };

/** The upload form inside Flint's `asset` bubble: pick an image, name it, upload. */
export function AssetUpload({ onUpload }: Props) {
  const id = useId();
  const [file, setFile] = useState<File>();
  const [name, setName] = useState("");
  // The name suggested from the last picked file. It follows each new pick until the seller edits it.
  const [suggested, setSuggested] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [uploaded, setUploaded] = useState<string>();

  if (uploaded) {
    return (
      <p className="asset-upload-done" role="status">
        Uploaded {uploaded} ✓
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !name || busy) return;
    setBusy(true);
    setError(undefined);
    const result = await onUpload(file, name.trim());
    setBusy(false);
    if (result.ok) setUploaded(result.name);
    else setError(result.error);
  };

  return (
    <form className="asset-upload" onSubmit={submit} aria-label="Upload an image">
      <label htmlFor={`${id}-file`}>Image</label>
      <input
        id={`${id}-file`}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          setFile(picked);
          setError(undefined);
          if (picked && name === suggested) {
            const next = suggestAssetName(picked.name);
            setName(next);
            setSuggested(next);
          }
        }}
      />
      <label htmlFor={`${id}-name`}>Image name</label>
      <input
        id={`${id}-name`}
        type="text"
        value={name}
        maxLength={32}
        placeholder="eco_badge"
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" disabled={!file || !name.trim() || busy}>
        Upload
      </button>
      {error && (
        <p className="asset-upload-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
