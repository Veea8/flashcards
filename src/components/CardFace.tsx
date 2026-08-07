import RichText from './RichText';

interface Props {
  front: string;
  back: string;
  html?: boolean;
  tags?: string[];
  revealed: boolean;
}

export default function CardFace({ front, back, html, tags, revealed }: Props) {
  return (
    <div className="flex min-h-52 flex-col justify-center gap-4 rounded-2xl border border-ink-200 bg-surface p-5 text-center sm:min-h-64 sm:gap-6 sm:p-10 dark:border-ink-800 dark:bg-ink-900">
      <RichText
        text={front}
        html={html}
        className="text-xl leading-snug font-medium sm:text-2xl"
      />
      {revealed && (
        <>
          <hr className="border-ink-200 dark:border-ink-800" />
          <RichText
            text={back}
            html={html}
            className="text-base leading-snug text-ink-800 sm:text-xl dark:text-ink-200"
          />
          {tags && tags.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-1.5">
              {tags.map((t) => (
                <li
                  key={t}
                  className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs text-ink-600 dark:bg-ink-950 dark:text-ink-400"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
