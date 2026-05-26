type Props = {
  /** Names to render as small tinted-dot chips. Order is preserved. */
  names: string[];
};

/**
 * PeopleRow — a single-row credit line of people: each name preceded by a
 * small dot in the article's tint. Wraps gracefully to multiple lines when
 * the viewport can't hold the whole row.
 *
 * Used inline as the article-author's quiet "with thanks to" — sits as a
 * row of name-chips rather than a comma/semicolon-separated sentence, so
 * the people read as distinct presences rather than a list-of-words.
 */
export function PeopleRow({ names }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px 22px',
        alignItems: 'center',
        margin: '28px 0',
        fontFamily: 'var(--reading)',
        fontSize: 17,
        color: 'var(--ink-2)',
      }}
    >
      {names.map((name) => (
        <span
          key={name}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--article-tint, var(--ink))',
              flexShrink: 0,
            }}
            aria-hidden
          />
          {name}
        </span>
      ))}
    </div>
  );
}
