import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Props = {
  /** Article slug — used by the `/api/edit-mdx` endpoint to find the right MDX file. */
  slug: string;
  children: ReactNode;
};

/** A captured editable text node with metadata needed to save back. */
type NodeCapture = {
  textNode: Text;
  /** Index of this text node within its paragraph (whitespace-only nodes
   *  excluded — must match the backend's text-run indexing). */
  nodeIndex: number;
  /** textContent at the moment edit mode turned on — used as the diff
   *  baseline AND sent to the backend as a sanity check. */
  originalText: string;
};

/**
 * EditMode — wraps an article body so you can toggle inline editing on,
 * make changes directly in the rendered text, and save them back to the
 * source MDX file (via the dev-only /api/edit-mdx endpoint).
 *
 * Toggle: click the floating "Edit mode" button bottom-right, or press
 * Cmd/Ctrl + Shift + E.
 *
 * When ON:
 *   - All <p> elements inside .article-body become contenteditable
 *   - A subtle dashed outline marks each editable paragraph
 *   - The "Save" button appears
 *
 * When you click Save:
 *   - For each paragraph, the changed TEXT NODES (not the whole paragraph)
 *     are POSTed to /api/edit-mdx with their nodeIndex + new content
 *   - The endpoint identifies the matching text run in the source MDX and
 *     replaces only that run's text — inline tags around it (e.g. `<i>`,
 *     `<strong>`, `<InlineLink>`) are preserved
 *   - On success, Vite HMR re-renders the article with the persisted text
 *
 * Limitations (intentional, MVP):
 *   - Only edits <p> text — headings, JSX components, and tables are read-only
 *   - Edits that cross text-node boundaries (e.g. typing across an `<i>` tag's
 *     close) may fail to save: contenteditable behavior at boundaries is
 *     browser-specific and can split/merge nodes unpredictably
 *   - Refuses to save when the same paragraph appears multiple times in source
 *
 * Production builds: the floating controls + endpoint are dev-only, so this
 * component renders nothing in a built site.
 */
export function EditMode({ slug, children }: Props) {
  const [on, setOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  /** Original innerText per editable paragraph — used to find the paragraph
   *  in source when saving. */
  const originalsRef = useRef<Map<HTMLElement, string>>(new Map());
  /** Text-node captures per paragraph — used to compute a diff at the
   *  text-node level so inline tags around each run can be preserved. */
  const nodeMapsRef = useRef<Map<HTMLElement, NodeCapture[]>>(new Map());

  // Capture a paragraph's current DOM state into the diff baselines. Used
  // both during initial toggle-on (capture all paragraphs) AND after a
  // successful save (re-capture so the next edit's diff is computed against
  // the just-saved state, not the stale pre-save baseline). Without the
  // re-capture, a second edit on the same paragraph in the same session
  // would send a `paragraphOldText` that no longer exists in the source on
  // disk, and the save endpoint would reject it as a "paragraph may have
  // changed" mismatch.
  const captureParagraph = (el: HTMLElement) => {
    originalsRef.current.set(el, el.innerText);
    const captures: NodeCapture[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let nodeIndex = 0;
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const text = textNode.textContent ?? '';
      if (!text.trim()) continue;
      captures.push({ textNode, nodeIndex: nodeIndex++, originalText: text });
    }
    nodeMapsRef.current.set(el, captures);
  };

  // Apply / remove contenteditable when toggling. We reach down into the DOM
  // here because the article body is rendered by a foreign MDX component tree
  // that we don't otherwise control — this is the cleanest way to opt every
  // paragraph in without modifying every MDX file.
  useEffect(() => {
    if (!on) {
      const editables = document.querySelectorAll<HTMLElement>(
        '.article-body p[contenteditable="true"]',
      );
      editables.forEach((el) => {
        el.contentEditable = 'false';
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.cursor = '';
      });
      originalsRef.current.clear();
      nodeMapsRef.current.clear();
      return;
    }
    const editables = document.querySelectorAll<HTMLElement>('.article-body p');
    editables.forEach((el) => {
      el.contentEditable = 'true';
      el.style.outline = '1px dashed var(--ink-4)';
      el.style.outlineOffset = '4px';
      el.style.cursor = 'text';
      captureParagraph(el);
    });
  }, [on]);

  // Re-capture every paragraph's baseline from the CURRENT DOM. Used both
  // by the manual ↻ Refresh button AND automatically by the HMR listener
  // below — after Vite re-renders the article body (post-save or after an
  // external edit to the source file), all the previously-captured <p>
  // and Text nodes are detached. Fresh captures point at the live DOM.
  //
  // The `silent` flag suppresses the "Baseline refreshed" toast so the
  // automatic HMR refresh doesn't flash a status message every time a
  // save lands.
  const refreshCaptures = (silent = false) => {
    // Drop entries pointing at elements that are no longer in the
    // document. Without this, handleSave would iterate stale entries and
    // (best case) produce noisy "no change" reports, (worst case) try to
    // POST against detached DOM state.
    for (const el of [...originalsRef.current.keys()]) {
      if (!el.isConnected) {
        originalsRef.current.delete(el);
        nodeMapsRef.current.delete(el);
      }
    }
    const editables = document.querySelectorAll<HTMLElement>('.article-body p');
    editables.forEach((el) => {
      // Newly-rendered paragraphs from HMR aren't contenteditable yet.
      if (el.contentEditable !== 'true') {
        el.contentEditable = 'true';
        el.style.outline = '1px dashed var(--ink-4)';
        el.style.outlineOffset = '4px';
        el.style.cursor = 'text';
      }
      captureParagraph(el);
    });
    if (!silent) {
      setStatus({ kind: 'info', text: 'Baseline refreshed from current DOM' });
      window.setTimeout(() => setStatus(null), 1200);
    }
  };

  // Auto-refresh after Vite HMR re-renders the article body. Without this,
  // a successful save (which writes the file → triggers HMR → React swaps
  // out the rendered <p> elements) leaves originalsRef and nodeMapsRef
  // pointing at detached nodes. The next edit lives in the new DOM, but
  // the diff at save time would walk the OLD detached <p> (whose
  // textContent never changed) and report "No changes" despite the user
  // visibly editing the page. Listening on vite:afterUpdate eliminates
  // that drift class entirely.
  useEffect(() => {
    if (!on) return;
    const hot = import.meta.hot;
    if (!hot) return;
    const onAfterUpdate = () => {
      // Defer one frame so React's commit phase has fully finalized the
      // new DOM before we walk it.
      requestAnimationFrame(() => refreshCaptures(true));
    };
    hot.on('vite:afterUpdate', onAfterUpdate);
    return () => { hot.off('vite:afterUpdate', onAfterUpdate); };
  // refreshCaptures closes over stable refs + setStatus; safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  // Cmd/Ctrl + Shift + E toggles edit mode. Shift avoids conflict with
  // Chrome's address-bar shortcut (Cmd+E) on some keyboards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setOn((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSave = async () => {
    if (originalsRef.current.size === 0) return;
    setSaving(true);
    setStatus(null);
    let saved = 0;
    let unchanged = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const [el, original] of originalsRef.current.entries()) {
      // Skip detached entries — these are leftovers from a prior HMR. The
      // post-update listener will rebuild captures from the live DOM; we
      // shouldn't try to save against orphaned references.
      if (!el.isConnected) continue;

      const captures = nodeMapsRef.current.get(el) ?? [];

      // Re-walk the paragraph's text nodes NOW. We do NOT trust
      // cap.textNode.textContent — contenteditable can split/merge/replace
      // text nodes during typing (especially adjacent to inline tags), and
      // the captured Text reference may be detached from the DOM. The
      // detached node's textContent is frozen at the original value, which
      // would silently report "no change" even when the user has visibly
      // edited the rendered text. Walking the live DOM at save time gives
      // us whatever is actually rendered right now.
      const currentRuns: string[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let liveNode: Text | null;
      while ((liveNode = walker.nextNode() as Text | null)) {
        const text = liveNode.textContent ?? '';
        if (!text.trim()) continue;
        currentRuns.push(text);
      }

      // Run count must match what we captured. If it shifted, something
      // structural changed (a tag was inserted/removed by paste, or a
      // run became whitespace-only and got filtered out). We can't safely
      // map nodeIndex → source run anymore, so bail with a clear message
      // instead of writing to the wrong run.
      if (currentRuns.length !== captures.length) {
        failed++;
        failures.push(
          `paragraph structure shifted (${captures.length} → ${currentRuns.length} runs). Click ↻ Refresh and re-edit.`,
        );
        continue;
      }

      const edits = captures
        .map((cap, i) => ({ cap, current: currentRuns[i] }))
        .filter(({ cap, current }) => current !== cap.originalText)
        .map(({ cap, current }) => ({
          nodeIndex: cap.nodeIndex,
          oldText: cap.originalText,
          newText: current,
        }));

      if (edits.length === 0) {
        unchanged++;
        continue;
      }
      try {
        const res = await fetch('/api/edit-mdx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, paragraphOldText: original, edits }),
        });
        if (res.ok) {
          saved++;
          // Don't re-capture here. After the file write, Vite HMR will
          // re-render the article body — at which point our HMR listener
          // (vite:afterUpdate) refreshes captures from the live DOM. A
          // captureParagraph(el) call here would write into the now-stale
          // element reference and seed the next save with bad data.
        } else {
          failed++;
          const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
          failures.push(`${data.error ?? 'unknown'}${data.hint ? ` — "${data.hint}"` : ''}`);
        }
      } catch (err) {
        failed++;
        failures.push(String(err));
      }
    }

    setSaving(false);
    if (failed > 0) {
      setStatus({
        kind: 'err',
        text: `Saved ${saved}, ${failed} failed${failures[0] ? `: ${failures[0]}` : ''}`,
      });
      // Keep edit mode on so the user can fix
    } else {
      setStatus({
        kind: 'ok',
        text: saved > 0 ? `Saved ${saved}` : 'No changes',
      });
      // Auto-exit on success after a beat — HMR will rerender with new content.
      setTimeout(() => {
        setOn(false);
        setStatus(null);
      }, 1400);
    }
  };

  // Production-strip the controls. import.meta.env.DEV is statically replaced
  // at build time, so this `if` lets the bundler dead-code-eliminate the
  // entire control surface in a `vite build`.
  const isDev = import.meta.env.DEV;

  return (
    <>
      {children}
      {isDev && (
        <FloatingControls
          on={on}
          saving={saving}
          status={status}
          onToggle={() => setOn((v) => !v)}
          onSave={handleSave}
          onRefresh={refreshCaptures}
        />
      )}
    </>
  );
}

function FloatingControls({
  on,
  saving,
  status,
  onToggle,
  onSave,
  onRefresh,
}: {
  on: boolean;
  saving: boolean;
  status: { kind: 'ok' | 'err' | 'info'; text: string } | null;
  onToggle: () => void;
  onSave: () => void;
  onRefresh: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      {status && (
        <span
          style={{
            pointerEvents: 'auto',
            fontFamily: 'var(--sans)',
            fontSize: 12,
            letterSpacing: 0.6,
            padding: '8px 12px',
            background:
              status.kind === 'err'
                ? 'var(--signal, #C13D2F)'
                : status.kind === 'ok'
                ? 'var(--ink)'
                : 'var(--ink-3)',
            color: 'var(--bg)',
            borderRadius: 6,
            maxWidth: 320,
            whiteSpace: 'normal',
            lineHeight: 1.4,
          }}
        >
          {status.text}
        </span>
      )}
      {on && (
        <>
          {/* Refresh — re-captures the diff baseline from the current DOM.
              Use after an external file change (HMR, manual edit) so the
              next Save isn't computed against a stale baseline. Doesn't
              touch any in-flight edits in the textNodes themselves. */}
          <button
            onClick={onRefresh}
            disabled={saving}
            title="Re-capture baseline from current DOM"
            style={{
              pointerEvents: 'auto',
              padding: '8px 12px',
              background: 'var(--bg)',
              color: 'var(--ink-2)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'var(--sans)',
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              pointerEvents: 'auto',
              padding: '8px 14px',
              background: saving ? 'var(--ink-3)' : 'var(--signal, #C13D2F)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'var(--sans)',
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
      <button
        onClick={onToggle}
        title="Cmd/Ctrl + Shift + E"
        style={{
          pointerEvents: 'auto',
          padding: '8px 14px',
          background: on ? 'var(--ink)' : 'var(--bg)',
          color: on ? 'var(--bg)' : 'var(--ink-2)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'var(--sans)',
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          boxShadow: on ? '0 4px 14px rgba(0,0,0,.18)' : '0 2px 8px rgba(0,0,0,.08)',
        }}
      >
        {on ? '✎ Editing' : 'Edit mode'}
      </button>
    </div>
  );
}
