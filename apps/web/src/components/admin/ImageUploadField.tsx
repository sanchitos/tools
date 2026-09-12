import { useRef, useState } from 'react';
import { ApiError } from '../../lib/api.js';
import { Button } from '../ui/Button.js';
import { ImageWithFallback } from '../ui/ImageWithFallback.js';
import { Loader } from '../ui/Loader.js';

interface Props {
  label: string;
  url: string | null;
  /** Uploads the file and returns the new URL (the server persists it). */
  onUpload: (file: File) => Promise<string | null>;
  hint?: string;
}

/**
 * Single-image upload + preview + replace, for the one-image-per-row cases
 * (hero, tile, location, brand logo). Product images keep their own multi-image
 * manager. The server replaces the old storage object on success, so this never
 * accumulates files.
 */
export function ImageUploadField({ label, url, onUpload, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      setPreview(await onUpload(file));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ''; // allow re-picking the same file
    }
  };

  return (
    <div>
      <span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      <div className="flex items-center gap-4">
        <div className="h-20 w-32 shrink-0 overflow-hidden rounded border border-border">
          {busy ? (
            <Loader className="h-full" />
          ) : (
            <ImageWithFallback src={preview} alt="" className="h-full w-full" imgClassName="object-contain" />
          )}
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {preview ? 'Replace image' : 'Upload image'}
          </Button>
          {hint && <p className="mt-1 text-label-sm text-ink-muted">{hint}</p>}
          {error && <p className="mt-1 text-label-sm text-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
