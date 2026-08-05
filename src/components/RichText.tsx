import { useMemo } from 'react';
import { sanitizeHtml } from '../lib/sanitizeHtml';

interface Props {
  text: string;
  html?: boolean;
  className?: string;
}

/**
 * Card content. HTML cards (Anki exports) are sanitised and rendered so that
 * <b>, <sub>/<sup>, tables and entities like &cap; read as intended; plain
 * cards keep their line breaks as-is.
 */
export default function RichText({ text, html, className }: Props) {
  const clean = useMemo(() => (html ? sanitizeHtml(text) : null), [text, html]);

  if (clean == null) {
    return <div className={`whitespace-pre-wrap ${className ?? ''}`}>{text}</div>;
  }

  return (
    <div
      className={`card-html ${className ?? ''}`}
      // Sanitised above: parsed to a document, allowlisted, all attributes stripped.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
