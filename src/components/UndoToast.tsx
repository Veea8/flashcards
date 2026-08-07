import { useEffect } from 'react';

interface Props {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** ms before the toast auto-dismisses. */
  timeout?: number;
}

export default function UndoToast({ message, onUndo, onDismiss, timeout = 8000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, timeout);
    return () => clearTimeout(t);
  }, [onDismiss, timeout]);

  return (
    <div
      role="status"
      // Sits above the pinned rating bar on phones so it never covers it.
      className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl bg-ink-900 px-4 py-3 text-sm text-ink-50 shadow-lg sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:mx-0 sm:-translate-x-1/2 sm:justify-start sm:px-5 dark:bg-ink-100 dark:text-ink-900"
    >
      <span className="min-w-0 truncate">{message}</span>
      <button
        onClick={onUndo}
        className="shrink-0 font-medium text-sky-400 hover:underline dark:text-sky-700"
      >
        Undo<span className="keyboard-only"> (Z)</span>
      </button>
    </div>
  );
}
