# Component vocabulary

Components imported into MDX articles. All in `src/components/`.

## Editorial primitives

| Component | Use | Rendered as |
|---|---|---|
| `<Lede>` | Optional explicit lede paragraph | Larger italic serif |
| `<PullQuote attribution="...">` | Climax line / quoted speech | Centered italic, no surface, left-bordered |
| `<Aside>` | Editorial side comment | Italic, indented, smaller, ink-3 |
| `<MicroHeading>` | Punchy beat within a section | Source Serif 600, 21px |
| `<Sidebar>` | Structured set-apart content | Surface card with mono kicker |

## Figures

| Component | Use |
|---|---|
| `<Figure fig="01" src={asset} alt="..." caption="...">` | Single image or video |
| `<Figure fig="01" placeholder alt="..." caption="...">` | Empty placeholder while content is forthcoming |
| `<TabbedFigure>` | Multiple variants of the same figure (tabs) |
| `<Collage>` | Multi-image composition |
| `<Carousel>` | Horizontally-scrollable image series |

## Layout & nav

| Component | Use |
|---|---|
| `<InlineTOC>` | Inline table-of-contents in article body |
| `<QuadrantMap>` | Landing-page article scatter (used in `Home.tsx`) |
| `<ExternalLink href="...">` | Outbound link with appropriate styling |

## Import discipline

Only import components actually used in the file. The MDX compiler will error on unused imports.

## Don'ts

- Don't introduce new editorial primitives without checking the `JournalArticle.css` comment block — it enumerates the 3–5 voice limit (Title / Dek / PullQuote / H2 / H3 / Sidebar / MicroHeading / Body / Aside / Emphasis / Meta).
- Don't put body-level emphasis in `<PullQuote>`. Pull quotes mark a climax. Eight pull quotes = no climax.
- Don't use `<strong>` as a faux heading. Bold is inline emphasis only.
- Don't put italics inside a `<Lede>` or first `<p>` — italic-on-italic in the lede styling toggles back to roman, so the emphasis disappears.
