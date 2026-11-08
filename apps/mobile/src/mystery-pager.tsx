export function MysteryPager({
  className,
  label,
  previous,
  next,
  position,
  announcement,
  onChange,
}: {
  className: string;
  label: string;
  previous: string;
  next: string;
  position: string;
  announcement?: string;
  onChange: (offset: number) => void;
}) {
  return (
    <div className={className} role="group" aria-label={label}>
      <button type="button" aria-label={previous} onClick={() => onChange(-1)}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m10 3-5 5 5 5" />
        </svg>
      </button>
      <span role="status" aria-atomic="true">
        {announcement && <span className="visually-hidden">{announcement} </span>}
        {position}
      </span>
      <button type="button" aria-label={next} onClick={() => onChange(1)}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m6 3 5 5-5 5" />
        </svg>
      </button>
    </div>
  );
}
