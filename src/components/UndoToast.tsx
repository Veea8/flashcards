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
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-ink-900 px-5 py-3 text-sm text-ink-50 shadow-lg dark:bg-ink-100 dark:text-ink-900"
    >
      <span>{message}</span>
      <button onClick={onUndo} className="font-medium text-sky-400 hover:underline dark:text-sky-700">
        Undo (Z)
      </button>
    </div>
  );
}
