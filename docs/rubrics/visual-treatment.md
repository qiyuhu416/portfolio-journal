# Rubric: visual treatment

Apply when adding figures, video, motion, or other visual elements to an article.

## Checks

- [ ] **Asset path co-located.** Image/video lives in `content/articles/<slug>/images/`, imported relatively into the MDX file.
- [ ] **Correct format for the job.**
  - 3-second loop = MP4 (~200–500 KB) over GIF (3–10 MB)
  - Static image = PNG / WebP
  - Transparent video = WebM (VP9 with alpha) — MP4 doesn't carry alpha
- [ ] **Figure span chosen intentionally.** Default is `text` (matches body width). `wide` / `bleed` only when content earns the room.
- [ ] **Caption present.** Mono 11px uppercase via the Figure component's built-in styling. The caption names what the figure shows or adds context — not a redundant restatement of the prior paragraph.
- [ ] **Alt text written for screen readers.** Describes the visual, not the file. ("After Effects word animation made on Caltrain" beats "caltrain-word.mp4".)
- [ ] **Motion respects `prefers-reduced-motion`.** Any keyframe animation has a `@media (prefers-reduced-motion: reduce) { animation: none }` opt-out.
- [ ] **Inline SVG doodles use article tint.** `color: var(--article-tint, currentColor)` so they pick up the article's accent.
- [ ] **Drive / external links resolved.** No `<iframe src="https://drive.google.com/...">` in production. Download the asset and import it.

## Failure signals

- Animated GIF when MP4 would be 10× smaller and sharper
- Caption that just says "Image of X" — captions should add context, not duplicate the visual
- Tinted block of color outside the reserved-token list (links, §, kicker, dropcap)
- Motion that runs constantly with no reduce-motion fallback
- Hardcoded asset paths instead of imports (breaks Vite hashing)

## Pass signal

Figures earn their space. Motion respects the reader's settings. The visual treatment serves the prose, not the other way around.
