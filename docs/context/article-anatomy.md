# Article anatomy

Every article is `content/articles/<slug>/index.mdx`. Co-located images and video go in `./images/`.

## Required frontmatter

```yaml
---
slug: <kebab-case>
num: "<two-digit>"        # display number on quadrant map (must be unique across articles)
quality: <single word>    # quadrant tag (e.g. Craft, Restraint, Play)
title: <sentence case>
titleHtml: ...            # optional — for inline <s> strikethroughs etc.
dek: <one short line>     # subtitle under title
date: <Mmm YYYY>
readtime: <integer minutes>
tint: "#<hex>"            # accent color (links, drop-cap, kicker, §-numerals)
surface: "#<hex>"         # neutral surface for sidebars/cards
sections:                 # for sidebar nav + deep-linking
  - { id: <slug>, label: <text> }
---
```

## Body conventions

- Open the file with imports for any components used: `Figure`, `PullQuote`, `Aside`, `Lede`, etc.
- First `<p>` automatically gets italic-serif "lede" treatment via CSS — or use `<Lede>` explicitly
- Section H2s as `<h2 id="<sectionId>">§N · <Label></h2>` — IDs MUST match `sections` frontmatter
- Use `<hr/>` between major sections for visual breath
- Cross-article link: `<a href="#article:<other-slug>">label</a>`
- A paragraph with `className="dropcap"` opts into a 62px drop-cap (otherwise the lede paragraph treatment applies)

## Image vs video

- Drop file in `./images/`, import it, pass to `<Figure src={importedAsset}>`
- `.png`, `.jpg`, `.webp` → renders as `<img>`
- `.mp4`, `.webm`, `.mov` → renders as `<video autoplay muted loop playsinline>`
- For 3-second loops, prefer MP4 (10–20× smaller than GIF)

## ID consistency rule

The `sections:` frontmatter array IS the sidebar nav. Each `id` must match a body H2's `id` attribute. Mismatch → broken deep-link AND broken in-page nav. After restructuring sections, always re-check both ends.
