interface Props {
  front: string;
  back: string;
  revealed: boolean;
}

export default function CardFace({ front, back, revealed }: Props) {
  return (
    <div className="flex min-h-[16rem] flex-col justify-center gap-6 rounded-2xl border border-ink-200 bg-white p-10 text-center dark:border-ink-800 dark:bg-ink-900">
      <p className="text-2xl leading-snug font-medium whitespace-pre-wrap">{front}</p>
      {revealed && (
        <>
          <hr className="border-ink-200 dark:border-ink-800" />
          <p className="text-xl leading-snug whitespace-pre-wrap text-ink-800 dark:text-ink-200">
            {back}
          </p>
        </>
      )}
    </div>
  );
}
