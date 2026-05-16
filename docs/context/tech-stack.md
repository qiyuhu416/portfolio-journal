# Tech stack

## Build & framework

- **Vite 5** + **React 18** + **TypeScript 5**
- **MDX 3** via `@mdx-js/rollup` with `remark-frontmatter` + `remark-mdx-frontmatter`
- No state-management library, no router library, no UI framework
- Hash-based routing implemented inline in `src/App.tsx`

## Routing

`#<route>` where route is one of:

- `home` (default)
- `article:<slug>` — opens article overlay on top of home
- `article:<slug>:<sectionId>` — deep-links into a section
- `signals`, `loops` — other top-level routes

Hash changes drive `setRoute`. Cross-article links use `<a href="#article:<slug>">`.

## Asset pipeline

Standard Vite asset imports:

- Images: `import x from './images/x.png'` → returns hashed URL string
- Video: `.mp4`, `.webm`, `.mov` work the same way
- The `Figure` component auto-detects video src by extension and renders `<video autoplay muted loop playsinline>` instead of `<img>`

## Scripts

```bash
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build
npm run typecheck  # tsc -b --noEmit
npm run preview    # Vite preview
```

## Path aliases

- `@/` → `src/`
- `@content/` → `content/`

## Fonts

Loaded from Google Fonts:

- **Fraunces** — display serif (titles, H2s)
- **Source Serif 4** — reading serif (body, lede, pull quotes, asides)
- **Inter** — sans (rare; some UI chrome)
- **JetBrains Mono** — mono (meta only: captions, kickers, "Fig. 02")
