type Props = {
  /** Vimeo video ID — the number after vimeo.com/ in the share URL.
   *  e.g., https://vimeo.com/1050190072 → id="1050190072" */
  id: string;
  /** Optional accessible title for the iframe. Falls back to "Vimeo {id}". */
  title?: string;
};

/**
 * Vimeo — a responsive 16:9 Vimeo player embed. The iframe stays at
 * the article body's full width and scales the video correctly across
 * viewport sizes. Lazy-loaded so a tab/sidebar that hasn't been opened
 * doesn't fetch the player script eagerly.
 */
export function Vimeo({ id, title }: Props) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        background: 'var(--surface)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <iframe
        src={`https://player.vimeo.com/video/${id}`}
        title={title ?? `Vimeo ${id}`}
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
        allowFullScreen
        loading="lazy"
        frameBorder="0"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 0,
        }}
      />
    </div>
  );
}
