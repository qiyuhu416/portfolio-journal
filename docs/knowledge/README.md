# docs/knowledge/

Accumulated lessons from working on this portfolio across sessions. The point of this folder is **continuity** — so future sessions don't re-litigate decisions you've already made.

## Two kinds of knowledge

- **Lessons** (`lessons/`) — specific decisions, voice notes, design calls, constraints learned. Append-only. Each file timestamped.
- **(Future)** Decisions / ADRs (`../decisions/`) — for architectural choices if they become worth formalizing.

## How to capture

Run `/hd:maintain capture` after a session that produced a meaningful decision. The skill walks you through writing it as a lesson and proposing whether it deserves promotion to AGENTS.md or a rule.

## What's worth capturing

- A judgment call you made twice → starting to be a rule
- A voice or style preference confirmed in practice (e.g., "preserve doubled words like 'unless unless'")
- A constraint discovered (e.g., "italic-on-italic in `<Lede>` doesn't render — split the paragraph")
- A workflow that worked (e.g., "MP4 export from AE: H.264, 3–6 Mbps, drop in `images/`")
- A structural call (e.g., "this article is anchored on the Apple workshop, not the codebase story")

## What's NOT worth capturing

- One-off task results
- Ephemeral session state
- Things already documented elsewhere (`AGENTS.md`, `docs/context/`, code comments)
- Feature ideas (those go in a notes/issues system, not knowledge)

## Format suggestion

```markdown
---
date: 2026-05-15
topic: <one phrase>
status: captured | promoted | superseded
---

## Lesson

<what you learned, in your own words>

## Why it matters

<the cost or benefit that made this stick — often a past incident>

## How to apply

<when does this rule kick in>
```

## Promotion path

A lesson that proves itself across multiple sessions becomes a candidate for promotion:

- To `AGENTS.md` if it's an always-loaded behavior
- To a rubric if it's a check
- To `docs/context/<layer>.md` if it's domain knowledge

`/hd:maintain` proposes the promotion; you accept or defer.
