import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * TriggerDemo — one trigger, one demo. Replays a dialogue script (typing,
 * AI highlights, AI chips) on a single rAF clock; alongside it, a mechanism
 * panel exposes the implicit timing logic (tick counter, countdown bar,
 * focus indicator) so the reader sees WHY the AI fired at that exact
 * moment.
 *
 * Layout: kicker + title + description on top, then a 2-column grid —
 * typing field on the left (~70% wide), mechanism panel on the right
 * (~30%). A short "How it works" paragraph closes the cell.
 *
 * Each instance has its own elapsed clock + IntersectionObserver gate
 * (paused when offscreen). Three on a page run on independent loops with
 * coprime totals, so the rhythms desync naturally.
 */

// ─── Dialogue DSL ──────────────────────────────────────────────────────
// A demo is an ordered list of steps. The engine walks them sequentially,
// summing durations to compute when each step starts. Per frame, given
// `elapsed`, the engine emits a snapshot { typed, highlight, chip } that
// the renderer consumes.
export type DialogueStep =
  // User types `text` over `cps` chars/sec (default 30).
  | { kind: 'type'; text: string; cps?: number }
  // Hold the current state for `ms` milliseconds.
  | { kind: 'pause'; ms: number }
  // Highlight the LAST occurrence of `pattern` in the typed buffer.
  // Persists until replaced by another `highlight` or wiped by `clear`.
  | { kind: 'highlight'; pattern: string; ms: number }
  // Show the AI suggestion chip. Persists until replaced or cleared.
  | { kind: 'chip'; text: string; ms: number }
  // Clear the typed buffer (and any active highlight/chip).
  | { kind: 'clear'; ms: number }
  // Move the cursor to a different field — used by the ON LEAVE demo to
  // visualize the blur event that fires the AI. `toField: 'B'` makes the
  // cursor jump out of the main typing area into a secondary field
  // rendered below; `toField: 'A'` brings it back. Field A is always the
  // main typing buffer; Field B is just a focus receptacle (intentionally
  // empty — it's the act of leaving that matters).
  | { kind: 'focus'; toField: 'A' | 'B'; ms: number };

export type MechanismConfig =
  // Polling — fires every `intervalMs`. Mechanism panel shows a pulse
  // indicator + a rolling log of ticks; ticks during an active highlight
  // get a coral arrow indicating "this one fired the AI."
  | { kind: 'tick'; intervalMs: number }
  // Debouncing — a countdown that resets on every `type` step. Mechanism
  // panel shows a fill bar + a "silent for X.Xs" readout.
  | { kind: 'countdown'; thresholdMs: number }
  // Field-blur — mechanism panel shows two filled/empty squares for
  // Field A / Field B focus state. (Cell 3, not yet wired.)
  | { kind: 'focus' };

// Technical readout — what the mechanism actually costs to operate. Sits
// next to the rhythm panel inside the expanded drawer. All fields are
// strings (pre-formatted) so the MDX is the source of truth and one can
// pass "60", "$0.012/min", "~$10.80" without unit ambiguity.
export type Economics = {
  callsPerMin: string;
  tokensPerCall: string;
  costPerCall: string;
  costPerMin: string;
  costPerUserMonth: string;
  /** Footnote under the cost-per-month row, e.g. "at 30 min/day writing". */
  costPerUserMonthNote?: string;
};

type Props = {
  /** Two-letter mode id used for the inner stagger offset (so three demos
   *  on one page don't start typing on the same frame). */
  mode: 'tick' | 'pause' | 'leave';
  /** Mono kicker above the title (e.g. "TICK · 1S"). */
  kicker: string;
  /** Trigger name. Bold serif. */
  title: string;
  /** One-line voice. Quiet ink-2 serif. */
  description: string;
  /** Dialogue script — drives the typing field. */
  dialogue: DialogueStep[];
  /** Mechanism panel config. */
  mechanism: MechanismConfig;
  /** Optional economics readout — shown inside the expanded "Behind the
   *  scenes" drawer next to the rhythm panel. The collapsed drawer's
   *  second line shows callsPerMin · costPerMin · costPerUserMonth as the
   *  cost summary. */
  economics?: Economics;
};

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutBack(t: number) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

function stepDuration(s: DialogueStep): number {
  switch (s.kind) {
    case 'type': return Math.ceil((s.text.length / (s.cps ?? 30)) * 1000);
    case 'pause': return s.ms;
    case 'highlight': return s.ms;
    case 'chip': return s.ms;
    case 'clear': return s.ms;
    case 'focus': return s.ms;
  }
}

type Snapshot = {
  typed: string;
  /** Active highlight — persists from the moment its `highlight` step starts
   *  until either a subsequent `highlight` step replaces it OR a `clear`
   *  step wipes the slate. No fade-out: AI annotations stay readable for
   *  as long as they're relevant. */
  highlight: { startIdx: number; endIdx: number; opacity: number } | null;
  /** Active chip — same persist semantics as highlight. `attachAtIdx` is
   *  captured at the moment the chip step starts: it's the position in
   *  `typed` where the chip should render INLINE. If a highlight is active
   *  when the chip starts, attachAtIdx = highlight.endIdx (chip floats
   *  right next to the highlight). Otherwise attachAtIdx = typed.length
   *  (chip floats at end-of-text). */
  chip: { text: string; attachAtIdx: number; opacity: number; translateY: number } | null;
  /** Elapsed-since-last-keystroke, used by the countdown mechanism. */
  silenceMs: number;
  /** When the most-recent active highlight FIRED — for the tick mechanism's
   *  "← fired" marker. */
  highlightFireMs: number | null;
  /** Which field has the cursor right now. 'A' is the main typing buffer
   *  (matches `typed`); 'B' is a secondary placeholder field, used by the
   *  ON LEAVE demo to visualize the blur event. Snaps to source until
   *  midway through a focus transition, then to destination. */
  cursorField: 'A' | 'B';
  /** Continuous cursor position: 0 = fully at Field A, 1 = fully at Field B.
   *  Lerps over a focus step's duration so the renderer can animate a
   *  "ghost cursor" traveling between the two fields. */
  cursorPos: number;
  /** True if the dialogue ever moves cursor to field B — drives whether
   *  Field B is rendered at all. Computed from the dialogue itself (not
   *  per-frame), but exposed via snapshot for renderer convenience. */
  hasFieldB: boolean;
};

function snapshotAt(dialogue: DialogueStep[], elapsed: number): Snapshot {
  let typed = '';
  let highlight: Snapshot['highlight'] = null;
  let chip: Snapshot['chip'] = null;
  let lastKeystrokeMs = 0;
  let highlightFireMs: number | null = null;
  let cursorField: 'A' | 'B' = 'A';
  let cursorPos = 0; // 0 = at A, 1 = at B
  // Pre-scan for any focus steps targeting B — drives whether Field B is
  // rendered at all (otherwise tick/pause demos get an empty Field B that
  // shouldn't exist).
  const hasFieldB = dialogue.some((s) => s.kind === 'focus' && s.toField === 'B');

  let cursor = 0;
  for (const step of dialogue) {
    const stepStart = cursor;
    const dur = stepDuration(step);
    const stepEnd = cursor + dur;

    // If this step hasn't started yet, we're done walking forward.
    if (elapsed < stepStart) break;

    const local = Math.min(elapsed - stepStart, dur);

    switch (step.kind) {
      case 'type': {
        if (elapsed < stepEnd) {
          const typedChars = Math.floor(step.text.length * (local / dur));
          typed += step.text.slice(0, typedChars);
          lastKeystrokeMs = elapsed;
        } else {
          typed += step.text;
          lastKeystrokeMs = stepEnd;
        }
        break;
      }
      case 'pause':
        // No state change; silence keeps growing past lastKeystrokeMs.
        break;
      case 'clear':
        typed = '';
        highlight = null;
        chip = null;
        break;
      case 'highlight': {
        // Highlight is SET when its step starts and PERSISTS through later
        // steps until replaced or cleared. Fade-in over 200ms; no fade-out.
        const idx = typed.lastIndexOf(step.pattern);
        if (idx >= 0) {
          const FADE_IN = 200;
          // If we're past the step's start, the highlight is on. Fade-in
          // anim only runs during the first 200ms of step time.
          const fadeIn = clamp((elapsed - stepStart) / FADE_IN, 0, 1);
          highlight = {
            startIdx: idx,
            endIdx: idx + step.pattern.length,
            opacity: fadeIn * 0.55,
          };
          highlightFireMs = stepStart;
        }
        break;
      }
      case 'chip': {
        // Chip is SET when its step starts and PERSISTS through later steps
        // until replaced or cleared. attachAtIdx captured at step start.
        // Slide-in over 280ms; no fade-out.
        const SLIDE_IN = 280;
        const slide = clamp((elapsed - stepStart) / SLIDE_IN, 0, 1);
        const attachAtIdx = highlight ? highlight.endIdx : typed.length;
        chip = {
          text: step.text,
          attachAtIdx,
          opacity: easeOutBack(slide),
          translateY: lerp(8, 0, easeOutBack(slide)),
        };
        break;
      }
      case 'focus': {
        // Cursor TRAVELS to the new field over the step's duration. cursorPos
        // lerps from current → target (0 if A, 1 if B); the renderer uses this
        // to animate a "ghost cursor" flying between the two fields. The
        // semantic cursorField flips at the midpoint so the inline cursor in
        // each field hides/appears at the right moment.
        const targetPos = step.toField === 'B' ? 1 : 0;
        const fromPos = cursorPos;
        if (elapsed < stepEnd) {
          const t = clamp((elapsed - stepStart) / dur, 0, 1);
          // easeInOut feel — cursor accelerates out of source, decelerates into target.
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          cursorPos = fromPos + (targetPos - fromPos) * eased;
          cursorField = t >= 0.5 ? step.toField : (fromPos < 0.5 ? 'A' : 'B');
        } else {
          cursorPos = targetPos;
          cursorField = step.toField;
        }
        break;
      }
    }

    cursor = stepEnd;
  }

  return {
    typed,
    highlight,
    chip,
    silenceMs: Math.max(0, elapsed - lastKeystrokeMs),
    highlightFireMs,
    cursorField,
    cursorPos,
    hasFieldB,
  };
}

function totalDuration(dialogue: DialogueStep[]): number {
  return dialogue.reduce((sum, s) => sum + stepDuration(s), 0);
}

export function TriggerDemo({ mode, kicker, title, description, dialogue, mechanism, economics }: Props) {
  const total = totalDuration(dialogue);
  const startOffset = useRef(mode === 'tick' ? 0 : mode === 'pause' ? 600 : 1200);

  const [elapsed, setElapsed] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(true);

  // IntersectionObserver gate — pause the rAF loop when offscreen so
  // three demos don't all chew CPU on a long article.
  useEffect(() => {
    if (!containerRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting; },
      { rootMargin: '100px' },
    );
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now - startOffset.current;
      if (visibleRef.current && total > 0) {
        setElapsed((now - start) % total);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  const snap = snapshotAt(dialogue, elapsed);

  return (
    <div
      ref={containerRef}
      data-trigger-demo
      style={{
        padding: '20px 0 6px',
        borderTop: '1px solid var(--line)',
      }}
    >
      {/* Kicker — section identifier, stays at top so the tab and the cell
          agree on which trigger you're looking at. */}
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1.6,
        textTransform: 'uppercase', color: 'var(--article-tint, var(--ink-3))',
        marginBottom: 14,
      }}>
        {kicker}
      </div>

      {/* Trigger title + description — context for what the demo enacts. */}
      <div style={{
        marginBottom: 14,
        fontFamily: 'var(--reading)', fontSize: 18, lineHeight: 1.4,
        color: 'var(--ink)',
      }}>
        <b style={{ fontWeight: 600 }}>{title}</b>
        <span style={{ color: 'var(--ink-2)', fontWeight: 400 }}> — {description}</span>
      </div>

      {/* The animation — the experience the trigger creates. */}
      <TypingField snap={snap} />

      {/* Behind-the-scenes drawer — collapsed by default. The header reads
          "Behind the scenes" + a teaser line of cost numbers. Expanded view
          shows the rhythm panel (live) on the left + economics table
          (static) on the right. */}
      <MechanismDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
        mechanism={mechanism}
        elapsed={elapsed}
        snap={snap}
        economics={economics}
      />
    </div>
  );
}

// ─── Behind-the-scenes drawer (collapse + economics) ──────────────────
function MechanismDrawer({
  open, onToggle, mechanism, elapsed, snap, economics,
}: {
  open: boolean;
  onToggle: () => void;
  mechanism: MechanismConfig;
  elapsed: number;
  snap: Snapshot;
  economics: Economics | undefined;
}) {
  // Economics summary — second line of the collapsed drawer.
  const summary = economics
    ? `${economics.callsPerMin} calls/min · ${economics.costPerMin} · ${economics.costPerUserMonth}/user/mo`
    : mechanism.kind === 'tick' ? `polls every ${mechanism.intervalMs / 1000}s`
    : mechanism.kind === 'countdown' ? `fires after ${mechanism.thresholdMs / 1000}s of silence`
    : `fires on field blur`;

  const baseBg = open
    ? 'color-mix(in srgb, var(--article-tint, var(--ink-3)) 10%, transparent)'
    : 'color-mix(in srgb, var(--article-tint, var(--ink-3)) 5%, transparent)';

  return (
    <div style={{ marginTop: 22 }}>
      {/* Header card — two rows:
            row 1: "Behind the scenes" + chevron
            row 2: economics summary (calls/min · cost/min · cost/user/mo)
          The whole card is one click target. */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          appearance: 'none',
          width: '100%',
          padding: '12px 16px',
          display: 'block',
          cursor: 'pointer',
          textAlign: 'left',
          background: baseBg,
          border: '1px solid color-mix(in srgb, var(--article-tint, var(--ink-3)) 22%, transparent)',
          borderRadius: 8,
          transition: 'background .18s ease, border-color .18s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'color-mix(in srgb, var(--article-tint, var(--ink-3)) 14%, transparent)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = baseBg;
        }}
      >
        {/* Row 1: "Behind the scenes" + chevron */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{
            letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 10,
            color: 'var(--article-tint, var(--ink-3))',
            fontWeight: 600,
            fontFamily: 'var(--mono)',
            flexGrow: 1,
          }}>
            Behind the scenes
          </span>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18, height: 18,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform .25s cubic-bezier(.2,.7,.2,1)',
              color: 'var(--article-tint, var(--ink-3))',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
              <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        {/* Row 2: cost summary (mono, ink-3) */}
        <div style={{
          marginTop: 6,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: 0.6,
          color: 'var(--ink-3)',
        }}>
          {summary}
        </div>
      </button>

      {/* Slot — uses max-height + opacity for a smooth open/close. The slot
          is generously sized so the rhythm panel + economics table + the
          inline how-it-works prose all fit; bump if either grows. */}
      <div
        style={{
          maxHeight: open ? 560 : 0,
          opacity: open ? 1 : 0,
          overflow: 'hidden',
          transition: open
            ? 'max-height .32s cubic-bezier(.2,.7,.2,1), opacity .22s ease-out .08s'
            : 'max-height .2s ease-in, opacity .12s ease-in',
        }}
      >
        <div style={{ paddingTop: 14, paddingBottom: 14 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: economics ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
            gap: 32,
            alignItems: 'start',
          }}>
            <MechanismPanel mechanism={mechanism} elapsed={elapsed} snap={snap} />
            {economics && <EconomicsTable economics={economics} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function EconomicsTable({ economics }: { economics: Economics }) {
  const rows: [string, string, string?][] = [
    ['API calls / min', economics.callsPerMin],
    ['Tokens / call', economics.tokensPerCall],
    ['Cost / call', economics.costPerCall],
    ['Cost / min', economics.costPerMin],
    ['Cost / user / mo', economics.costPerUserMonth, economics.costPerUserMonthNote],
  ];
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6,
      color: 'var(--ink-3)',
    }}>
      <div style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 10, marginBottom: 8 }}>
        economics
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
        {rows.map(([label, value, note], i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            paddingTop: 4,
            paddingBottom: 4,
            borderBottom: i < rows.length - 1 ? '1px dashed color-mix(in srgb, var(--line) 60%, transparent)' : 'none',
          }}>
            <div>
              <div>{label}</div>
              {note && (
                <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>
                  {note}
                </div>
              )}
            </div>
            <div style={{ color: 'var(--ink-2)', fontWeight: 500, textAlign: 'right' }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Typing field ──────────────────────────────────────────────────────
function TypingField({ snap }: { snap: Snapshot }) {
  // Field A lives INSIDE a white-bg card (the "typing window"). Field B
  // (when present, ON LEAVE only) lives OUTSIDE the card — sitting on the
  // Sidebar surface — so the cursor jumping to it is literally moving
  // outside the typing window. A ghost cursor animates between the two
  // field anchors during a focus transition.
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldACursorRef = useRef<HTMLSpanElement>(null);
  const fieldBCursorRef = useRef<HTMLSpanElement>(null);
  const [posA, setPosA] = useState<{ x: number; y: number } | null>(null);
  const [posB, setPosB] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const cRect = containerRef.current.getBoundingClientRect();
    if (fieldACursorRef.current) {
      const r = fieldACursorRef.current.getBoundingClientRect();
      setPosA({ x: r.left - cRect.left, y: r.top - cRect.top });
    }
    if (fieldBCursorRef.current) {
      const r = fieldBCursorRef.current.getBoundingClientRect();
      setPosB({ x: r.left - cRect.left, y: r.top - cRect.top });
    }
  }, [snap.typed, snap.hasFieldB, snap.cursorPos]);

  // Ghost cursor visible only mid-transition (cursorPos in (0, 1)).
  const inFlight = snap.hasFieldB && snap.cursorPos > 0.001 && snap.cursorPos < 0.999;
  const ghostX = posA && posB ? lerp(posA.x, posB.x, snap.cursorPos) : 0;
  const ghostY = posA && posB ? lerp(posA.y, posB.y, snap.cursorPos) : 0;

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{
        background: 'var(--bg)',
        borderRadius: 8,
        padding: '20px 22px 18px',
        border: '1px solid color-mix(in srgb, var(--ink-4) 30%, transparent)',
      }}>
        <FieldA snap={snap} cursorRef={fieldACursorRef} hideCursor={inFlight} />
      </div>
      {snap.hasFieldB && (
        <div style={{ marginTop: 14 }}>
          <FieldB snap={snap} cursorRef={fieldBCursorRef} hideCursor={inFlight} />
        </div>
      )}
      {/* Ghost cursor — animates between fields during a focus transition.
          Linear path from A's end-of-text to B's start; the ease is
          handled in cursorPos itself, so visual motion stays smooth. */}
      {inFlight && posA && posB && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: ghostX,
            top: ghostY,
            width: 2,
            height: '1em',
            background: 'var(--ink)',
            pointerEvents: 'none',
            zIndex: 5,
            // Leave a soft trail so the motion reads as a journey.
            boxShadow: '0 0 4px color-mix(in srgb, var(--article-tint, var(--ink-3)) 50%, transparent)',
          }}
        />
      )}
    </div>
  );
}

function FieldA({ snap, cursorRef, hideCursor }: { snap: Snapshot; cursorRef?: React.RefObject<HTMLSpanElement>; hideCursor?: boolean }) {
  // Render the typed buffer with the highlight wash inline, and the chip as
  // a FLOATING annotation positioned BELOW the line via `position: absolute`
  // inside an anchor span. The text flows naturally — the chip never pushes
  // following text out of place. The cursor is hidden when focus is on
  // Field B (the user "left" Field A) OR when a focus transition is in flight
  // (the ghost cursor on the parent takes over the visual).
  const { typed, highlight: hl, chip, cursorField } = snap;
  const attachIdx = chip ? chip.attachAtIdx : -1;

  type Seg = { kind: 'plain' | 'hl' | 'anchor'; text?: string };
  const segs: Seg[] = [];
  let pos = 0;
  // Highlight comes before anchor in render order (typical case).
  if (hl && (attachIdx < 0 || hl.startIdx < attachIdx)) {
    if (hl.startIdx > pos) segs.push({ kind: 'plain', text: typed.slice(pos, hl.startIdx) });
    segs.push({ kind: 'hl', text: typed.slice(hl.startIdx, hl.endIdx) });
    pos = hl.endIdx;
  }
  if (chip) {
    if (attachIdx > pos) segs.push({ kind: 'plain', text: typed.slice(pos, attachIdx) });
    segs.push({ kind: 'anchor' });
    pos = attachIdx;
  }
  // Highlight could (rarely) come AFTER the chip's anchor.
  if (hl && attachIdx >= 0 && hl.startIdx >= attachIdx) {
    if (hl.startIdx > pos) segs.push({ kind: 'plain', text: typed.slice(pos, hl.startIdx) });
    segs.push({ kind: 'hl', text: typed.slice(hl.startIdx, hl.endIdx) });
    pos = hl.endIdx;
  }
  if (pos < typed.length) segs.push({ kind: 'plain', text: typed.slice(pos) });
  if (segs.length === 0) segs.push({ kind: 'plain', text: typed });

  const cursorBlink = snap.silenceMs < 100 ? 1 : Math.floor((snap.silenceMs / 500) % 2);

  return (
    <div style={{
      position: 'relative',
      fontFamily: 'var(--mono)',
      fontSize: 15,
      // Generous line-height so the floating chip on a wrapped line has
      // breathing room and doesn't crowd the line above or below it.
      lineHeight: 2.4,
      // Bottom padding so a chip below the LAST line still has space to
      // float into. (32px ≈ chip height + gap.)
      paddingBottom: 32,
      color: 'var(--ink)',
      minHeight: 110,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {segs.map((s, i) => {
        if (s.kind === 'plain') return <span key={i}>{s.text}</span>;
        if (s.kind === 'hl') {
          return (
            <span
              key={i}
              style={{
                background: hl
                  ? `color-mix(in srgb, var(--article-tint, #C18A3D) ${hl.opacity * 100}%, transparent)`
                  : 'transparent',
                borderRadius: 2,
                padding: '0 0.05em',
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }}
            >
              {s.text}
            </span>
          );
        }
        // Anchor span — zero-width, position: relative. The chip is its
        // absolutely-positioned child, floating ABOVE the line.
        return (
          <span
            key={i}
            style={{
              position: 'relative',
              display: 'inline',
            }}
          >
            {chip && (
              <span
                style={{
                  position: 'absolute',
                  // Float below the line — `top: 100%` puts the chip's
                  // top edge at the anchor's bottom edge.
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  // Higher than text so it draws ON TOP if it overlaps.
                  zIndex: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px 4px 8px',
                  // Tinted-wash background so the chip reads as a small AI
                  // annotation card sitting on the bg-colored typing area.
                  background: 'color-mix(in srgb, var(--article-tint, var(--ink-3)) 8%, var(--bg))',
                  borderLeft: '2px solid var(--article-tint, var(--ink-3))',
                  borderRadius: '0 4px 4px 0',
                  boxShadow: '0 2px 6px rgba(20,19,15,0.06)',
                  fontFamily: 'var(--reading)',
                  fontStyle: 'italic',
                  fontSize: 13,
                  lineHeight: 1.4,
                  color: 'var(--ink-2)',
                  opacity: chip.opacity,
                  transform: `translateY(${chip.translateY}px)`,
                  transition: 'opacity .2s ease',
                }}
              >
                <span style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: 'var(--article-tint, var(--ink-3))',
                  fontStyle: 'normal',
                  flexShrink: 0,
                }}>AI</span>
                <span>{chip.text}</span>
              </span>
            )}
          </span>
        );
      })}
      {/* Inline cursor — anchor for ghost-cursor measurement. Always
          rendered (so its position is measurable), but invisible when
          cursorField !== 'A' OR a focus transition is in flight. */}
      <span
        ref={cursorRef}
        style={{
          display: 'inline-block',
          width: 2,
          height: '1em',
          background: 'currentColor',
          verticalAlign: '-0.15em',
          marginLeft: 1,
          opacity: (cursorField === 'A' && !hideCursor) ? cursorBlink : 0,
        }}
      />
    </div>
  );
}

// Field B — a small empty receptacle used only by the ON LEAVE demo. Its
// purpose is to make the blur event visible: the cursor jumps from Field A
// to here, and that's the moment the AI fires its analysis on Field A's
// content. Intentionally empty (no typing happens here in the dialogue) —
// it's the act of leaving Field A that matters.
function FieldB({ snap, cursorRef, hideCursor }: { snap: Snapshot; cursorRef?: React.RefObject<HTMLSpanElement>; hideCursor?: boolean }) {
  const isFocused = snap.cursorField === 'B';
  const cursorBlink = snap.silenceMs < 100 ? 1 : Math.floor((snap.silenceMs / 500) % 2);
  return (
    <div style={{
      padding: '12px 14px',
      minHeight: 36,
      borderRadius: 6,
      border: '1px dashed var(--ink-4)',
      borderColor: isFocused ? 'var(--article-tint, var(--ink-3))' : 'var(--ink-4)',
      background: isFocused ? 'color-mix(in srgb, var(--article-tint, var(--ink-3)) 5%, transparent)' : 'transparent',
      transition: 'border-color .25s ease, background .25s ease',
      display: 'flex',
      alignItems: 'center',
      fontFamily: 'var(--mono)',
      fontSize: 13,
      color: 'var(--ink-3)',
    }}>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.4,
        textTransform: 'uppercase', color: 'var(--ink-4)',
        marginRight: 10,
      }}>
        Note
      </span>
      <span
        ref={cursorRef}
        style={{
          display: 'inline-block',
          width: 2,
          height: '1em',
          background: 'var(--ink-2)',
          verticalAlign: '-0.15em',
          opacity: (isFocused && !hideCursor) ? cursorBlink : 0,
        }}
      />
    </div>
  );
}

// ─── Mechanism panel ───────────────────────────────────────────────────
function MechanismPanel({
  mechanism, elapsed, snap,
}: {
  mechanism: MechanismConfig;
  elapsed: number;
  snap: Snapshot;
}) {
  if (mechanism.kind === 'tick') return <TickPanel intervalMs={mechanism.intervalMs} elapsed={elapsed} snap={snap} />;
  if (mechanism.kind === 'countdown') return <CountdownPanel thresholdMs={mechanism.thresholdMs} silenceMs={snap.silenceMs} />;
  return <FocusPanelPlaceholder />;
}

function TickPanel({ intervalMs, elapsed, snap }: { intervalMs: number; elapsed: number; snap: Snapshot }) {
  // Show the last N ticks. Each tick is at time = i * intervalMs.
  // The ticks visible are the most recent ones <= elapsed.
  const N = 7;
  const completedTicks = Math.floor(elapsed / intervalMs);
  const ticks: number[] = [];
  for (let i = Math.max(0, completedTicks - N + 1); i <= completedTicks; i++) {
    ticks.push(i);
  }
  // The "fired" tick is the most recent tick <= snap.highlightFireMs (if any).
  const firedTick = snap.highlightFireMs !== null
    ? Math.floor(snap.highlightFireMs / intervalMs)
    : null;
  // Pulse the indicator if we're within 250ms of a tick boundary.
  const sinceTick = elapsed % intervalMs;
  const pulseT = sinceTick < 250 ? 1 - sinceTick / 250 : 0;
  const fmtTime = (i: number) => {
    const seconds = (i * intervalMs) / 1000;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6,
      color: 'var(--ink-3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 10 }}>tick</span>
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--article-tint, var(--ink-3))',
            transform: `scale(${1 + pulseT * 0.6})`,
            opacity: 0.4 + pulseT * 0.6,
          }}
        />
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
        {ticks.map((i) => {
          const isFired = i === firedTick;
          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: isFired ? 'var(--article-tint, var(--ink-2))' : 'var(--ink-3)',
              fontWeight: isFired ? 500 : 400,
              opacity: 1 - (completedTicks - i) * 0.12,
            }}>
              <span style={{ minWidth: 32 }}>{fmtTime(i)}</span>
              <span>┃</span>
              <span>check</span>
              {isFired && <span style={{ marginLeft: 4 }}>← fired</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CountdownPanel({ thresholdMs, silenceMs }: { thresholdMs: number; silenceMs: number }) {
  // Bar fills L→R as silence grows past the threshold; pulses when full.
  const fill = clamp(silenceMs / thresholdMs, 0, 1);
  const fired = silenceMs >= thresholdMs;
  const seconds = (silenceMs / 1000).toFixed(1);
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6,
      color: 'var(--ink-3)',
    }}>
      <div style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 10, marginBottom: 8 }}>
        countdown
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <div style={{
          height: 6, borderRadius: 3,
          background: 'color-mix(in srgb, var(--ink-4) 30%, transparent)',
          overflow: 'hidden',
          marginBottom: 8,
        }}>
          <div style={{
            width: `${fill * 100}%`,
            height: '100%',
            background: fired
              ? 'var(--article-tint, var(--ink-3))'
              : 'color-mix(in srgb, var(--article-tint, var(--ink-3)) 50%, transparent)',
            transition: 'background .15s',
          }} />
        </div>
        <div>silent for {seconds}s</div>
        {fired && (
          <div style={{ color: 'var(--article-tint, var(--ink-3))', marginTop: 4 }}>← fired</div>
        )}
      </div>
    </div>
  );
}

function FocusPanelPlaceholder() {
  return (
    <div style={{
      fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)',
    }}>
      <div style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 10, marginBottom: 8 }}>
        focus
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        (mechanism panel coming next)
      </div>
    </div>
  );
}
