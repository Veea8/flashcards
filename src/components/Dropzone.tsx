import { useRef, useState } from 'react';

interface Props {
  onFile: (filename: string, text: string) => void;
  compact?: boolean;
}

/** Drag-and-drop or click-to-browse for a single .txt file. */
export default function Dropzone({ onFile, compact }: Props) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function accept(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|tsv|csv|md)$/i.test(file.name)) {
      setError(`"${file.name}" isn't a text file. Use .txt, .tsv, .csv or .md.`);
      return;
    }
    setError(null);
    onFile(file.name, await file.text());
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void accept(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={[
          'cursor-pointer rounded-2xl border-2 border-dashed text-center transition',
          compact ? 'p-5 sm:p-6' : 'p-8 sm:p-14',
          over
            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
            : 'border-ink-200 hover:border-ink-400 dark:border-ink-800 dark:hover:border-ink-600',
        ].join(' ')}
      >
        <p className={compact ? 'text-sm font-medium' : 'font-medium sm:text-lg'}>
          {/* "Drop" means nothing on a phone — there is nothing to drag. */}
          <span className="hidden sm:inline">Drop a .txt file here</span>
          <span className="sm:hidden">Choose a .txt file</span>
        </p>
        <p className="mt-1 text-xs text-ink-600 sm:text-sm dark:text-ink-400">
          <span className="hidden sm:inline">or click to browse · </span>one card per line,{' '}
          <code>front → back</code>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.tsv,.csv,.md,text/plain"
          className="hidden"
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
