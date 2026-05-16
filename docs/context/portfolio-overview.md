# Portfolio overview

A long-form personal portfolio for **Kelly Qiyu Hu** (qiyu) — designer, AI prototyper at Apple. Currently in active iteration (May 2026).

## What it is

Not a typical case-study deck. The site is itself a designed object — a quadrant-map landing page that scatters articles across two axes, with each article opening as an overlay on top of the map. Articles are essays + work in MDX, mixing prose, embedded figures (images / video), pull quotes, asides, and editorial typography.

## What it isn't

- Not a CMS-backed blog. Articles are MDX files committed to the repo.
- Not a static-site-generator template. Custom Vite + React app with hash routing.
- Not a portfolio "showcase" in the conventional sense. The writing carries as much weight as the work shown.

## Audience

Other designers, hiring teams (Apple, AI/design startups), occasional reader who lands from a link. Reads on desktop and mobile.

## Current state (May 2026)

11 articles in `content/articles/`, in varying states of polish. Active editing happens article-by-article, often paired with cross-cutting design system tweaks in `JournalArticle.css`.

## Where things live

- `src/` — App, routes, components
- `content/articles/<slug>/index.mdx` — each article + its co-located `images/` folder
- `content/quadrants.json` — landing-page article positions
- `public/projects/` — shared image assets

## Operating principle

Edit conservatively. Kelly's writing has a specific voice; preserve it (see `voice-and-style.md`). Visual decisions are governed by the article-body hierarchy in `JournalArticle.css` — read the comment block at the top of that file before changing styling.
