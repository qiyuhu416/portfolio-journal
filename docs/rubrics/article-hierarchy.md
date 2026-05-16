# Rubric: article hierarchy

Apply when adding, restructuring, or styling article body content.

## The 3–5 voice limit

The article-body CSS in `src/routes/JournalArticle.css` enforces a hierarchy contract. Read the top comment block before changing styling. The contract names every level (Title / Dek / PullQuote / H2 / H3 / Sidebar / MicroHeading / Body / Aside / Emphasis / Meta) and what each is for.

## Checks

- [ ] **Section IDs match frontmatter.** Every body H2 `id` appears in `sections:` frontmatter. Sidebar nav and deep-links work.
- [ ] **Section count is intentional.** A 3-section article is tight. A 5-section article needs a real reason. Don't split sections to avoid editing.
- [ ] **No pull-quote inflation.** PullQuote marks a climax. If the article has more than 3, demote some to bold inline or regular paragraphs.
- [ ] **Lede vs body distinguished.** First `<p>` gets italic-serif lede styling automatically. Don't put `<em>` inside a lede paragraph (italics on italics disappear).
- [ ] **Tint reserved.** `--article-tint` is for links, §-numerals, sidebar kicker, drop-cap. NOT for headings, body, or backgrounds.
- [ ] **Mono uppercase reserved.** Mono uppercase = meta only (captions, kickers, "Fig. 02"). NEVER body.
- [ ] **No faux-heading via `<strong>`.** Bold is inline emphasis only.
- [ ] **Section breaks visible.** Use `<hr/>` between H2 sections for breathing room.

## Failure signals

- Sidebar nav points to nonexistent IDs → dead deep-link
- Tinted body text → page reads "tinted-throughout" instead of "ink-with-accent"
- Five+ pull quotes → none of them feel like a climax
- Bold strings used as section headers → no scannable hierarchy
- The article needs a TOC component because the section labels can't carry the structure → restructure first, don't add UI to compensate

## Pass signal

A reader scanning the page can locate the section structure in 3 seconds. Pull quotes feel like moments. Captions whisper.
