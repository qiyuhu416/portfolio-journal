# Drafts

One folder per article. Write `body.md` freely — prose plus inline markers — and drop images into the same folder. I'll convert it to `content/articles/<slug>/index.mdx` and move images over when you're ready.

## Folder shape

```
drafts/<slug>/
├─ body.md          # frontmatter + prose + markers
├─ hero.jpg         # drop images here; reference by filename in body.md
├─ diagram-01.png
└─ note-to-self.jpg
```

## Frontmatter (top of body.md)

```yaml
---
slug: <folder name>
title: <shown on the article page>
tag: <skill, e.g. "Visual skills">
dek: <one-line teaser, italic on article page>
date: <e.g. "Apr 2026">
readtime: <minutes as number, e.g. 7>
tint: "#hex"           # accent color
surface: "#hex"        # pale companion
sections:
  - { id: first,  label: "First section" }
  - { id: second, label: "Second section" }
  - { id: third,  label: "Third section" }
---
```

Section `id`s must match the `##` heading anchors below. Keep them lowercase-kebab. `label` is what shows in the right rail while reading.

## Inline markers

Use these anywhere in prose — I'll turn each into the right component.

**Figure** — one image with caption.
```
[FIGURE: hero.jpg — caption: "The first note, dated March 14." — span: text]
```
`span` options: `text` (column width, default), `full` (wider), `bleed` (edge-to-edge). Omit if you want default.

**Pull quote** — a line to pull out in big italic.
```
[PULLQUOTE — attribution: "Note to self, March 14"]
Humanity, in interfaces, is not about imitation. It's about restraint.
```

**Aside** — a colored-box interjection.
```
[ASIDE]
A good interface doesn't try to feel human. It tries not to feel
like a machine pretending to be one.
```

**Gallery** — 2–3 images side by side.
```
[GALLERY]
  [FIGURE: spreadsheet.png — caption: "Three months of 'oh' moments."]
  [FIGURE: transcript.png  — caption: "Every 'oh' got a yellow mark."]
```

## Body headings

```md
## §1 · The pauses {#pauses}

Your paragraph here. Plain markdown — *italic*, **bold**, [links](https://...), lists:
- one
- two

## §2 · Looking for seams {#seams}
...
```

The `{#pauses}` id at the end of a heading matches `sections[].id` in frontmatter — that's how the right-rail scroll tracker finds each section.

## When you're done

Tell me "convert thinking-outside-the-box" and I'll turn the draft into production MDX + move images into place. You can also just paste prose in chat and drag images — I'll file everything for you.
