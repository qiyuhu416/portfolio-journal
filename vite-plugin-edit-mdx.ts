import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

type Options = {
  /** Filesystem root for article MDX files, relative to vite.config.ts.
   *  Default 'content/articles' — each article lives at `<root>/<slug>/index.mdx`. */
  contentRoot?: string;
};

type Edit = {
  /** Index of the text run within the paragraph (0-based, whitespace-only
   *  runs excluded — must match what the frontend's TreeWalker captures). */
  nodeIndex: number;
  /** What that text run was before the edit. Optional but used as a sanity
   *  check — if the source's run at that index doesn't match, the save
   *  fails with a clear error rather than silently writing to the wrong run. */
  oldText?: string;
  /** New content for that run. Inline tags around it are preserved. */
  newText: string;
};

/**
 * Dev-only Vite plugin that exposes a single endpoint:
 *
 *   POST /api/edit-mdx
 *   {
 *     slug: string,
 *     paragraphOldText: string,        // innerText of the original paragraph
 *     edits: Array<{ nodeIndex, oldText?, newText }>,
 *   }
 *
 * Pairs with `<EditMode>` in the frontend. Each `edits[i]` describes one
 * changed text run (a contiguous run of source text between MDX/JSX tags).
 * Inline tags around / between the text runs are PRESERVED — only the run's
 * text content is replaced. This lets you edit a paragraph that contains
 * `<i>`, `<strong>`, `<InlineLink>`, etc., without losing the formatting.
 *
 * Algorithm:
 *   1. Find the target paragraph in the source MDX file by tag-stripping
 *      `paragraphOldText` and the source, then looking up its byte range.
 *   2. Within the paragraph's byte range, walk the source identifying
 *      "text runs" — spans of source between tags. Filter whitespace-only
 *      runs (those don't surface as editable text nodes in the DOM).
 *   3. For each edit, splice the corresponding text run with `newText`.
 *      Apply edits in reverse `nodeIndex` order so earlier run positions
 *      stay valid.
 *
 * Only mounted in `serve` mode — production builds never expose this.
 */
export function editMdxPlugin(opts: Options = {}): Plugin {
  const contentRoot = opts.contentRoot ?? 'content/articles';

  return {
    name: 'edit-mdx',
    apply: 'serve',
    configureServer(server) {
      const root = path.resolve(server.config.root, contentRoot);

      server.middlewares.use('/api/edit-mdx', async (req, res, next) => {
        if (req.method !== 'POST') return next();

        let body = '';
        for await (const chunk of req) body += chunk;

        const send = (status: number, payload: object) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };

        try {
          const { slug, paragraphOldText, edits } = JSON.parse(body) as {
            slug?: string;
            paragraphOldText?: string;
            edits?: Edit[];
          };

          if (!slug || typeof paragraphOldText !== 'string' || !Array.isArray(edits)) {
            return send(400, {
              error: 'missing slug, paragraphOldText, or edits',
            });
          }
          if (edits.length === 0) {
            return send(200, { ok: true, mode: 'noop', editsApplied: 0 });
          }

          // Sanity guard — slug must not escape contentRoot
          const filePath = path.join(root, slug, 'index.mdx');
          if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) {
            return send(404, { error: `article not found: ${slug}` });
          }

          const source = fs.readFileSync(filePath, 'utf-8');

          // ─── Step 1: locate the paragraph in source ────────────────────
          // The frontend captured `paragraphOldText` as the paragraph's
          // rendered innerText (no tags, collapsed whitespace). To match
          // that against the source MDX (which has tags + raw whitespace),
          // we strip tags and normalize, find the index in normalized
          // source, then walk the source character-by-character to recover
          // the corresponding byte range.
          const normalizeChar = (c: string): string => {
            if (c === '\u201C' || c === '\u201D') return '"';
            if (c === '\u2018' || c === '\u2019') return "'";
            return c;
          };
          const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');
          const normalize = (s: string) =>
            Array.from(stripTags(s)).map(normalizeChar).join('').replace(/\s+/g, ' ').trim();

          const sourceNorm = normalize(source);
          const oldNorm = normalize(paragraphOldText);
          const normIdx = sourceNorm.indexOf(oldNorm);

          if (normIdx < 0) {
            console.error('[edit-mdx] paragraph not found in source. slug:', slug);
            console.error('[edit-mdx] paragraphOldText:', JSON.stringify(paragraphOldText));
            return send(404, {
              error: 'paragraph not found in source',
              hint: paragraphOldText.slice(0, 120),
            });
          }

          // Walker: advance a normalized cursor through the source, skipping
          // tag chars (so the cursor stays aligned with stripped-source).
          // When the cursor reaches normIdx, the current byte position is
          // the start of the paragraph's content; when the cursor reaches
          // normIdx + oldNorm.length, the byte position is the end.
          let normCursor = 0;
          let paraStart = -1;
          let paraEnd = -1;
          let inWS = false;
          let inTag = false;
          for (let i = 0; i < source.length; i++) {
            const c = source[i];
            if (!inTag && c === '<') {
              inTag = true;
              // Do NOT reset inWS here. Tags are transparent to the
              // whitespace-run state: `text \n<p>\n more` should count as
              // a single WS run between "text" and "more", because
              // normalize() collapses all whitespace (including across
              // tags) into one space. Resetting inWS on tag-entry would
              // make the walker count two WS runs, and the normCursor
              // would drift ahead of the normalized index — causing
              // paraStart to land in an earlier paragraph.
              continue;
            }
            if (inTag) {
              if (c === '>') inTag = false;
              continue;
            }
            const isWS = /\s/.test(c);
            if (paraStart < 0 && normCursor === normIdx) paraStart = i;
            if (paraStart >= 0 && paraEnd < 0 && normCursor === normIdx + oldNorm.length) {
              paraEnd = i;
              break;
            }
            if (isWS) {
              if (!inWS) {
                normCursor++;
                inWS = true;
              }
            } else {
              normCursor++;
              inWS = false;
            }
          }
          if (paraEnd < 0) paraEnd = source.length;
          if (paraStart < 0) {
            return send(500, { error: 'paragraph normalized match found but byte mapping failed' });
          }

          // ─── Step 2: find text runs within the paragraph's byte range ──
          // A text run is a span of source between tags. Whitespace-only
          // runs are filtered out (they don't render as editable text
          // nodes in the DOM, so frontend nodeIndex skips them — we mirror
          // that here). Run indices in this array correspond 1:1 with
          // text-node indices in the rendered DOM.
          const paragraphSource = source.slice(paraStart, paraEnd);
          const runs: Array<{ start: number; end: number; text: string }> = [];
          {
            let runStart = -1;
            let inTagP = false;
            for (let i = 0; i < paragraphSource.length; i++) {
              const c = paragraphSource[i];
              if (!inTagP && c === '<') {
                if (runStart >= 0) {
                  const text = paragraphSource.slice(runStart, i);
                  if (text.trim()) runs.push({ start: runStart, end: i, text });
                  runStart = -1;
                }
                inTagP = true;
                continue;
              }
              if (inTagP) {
                if (c === '>') inTagP = false;
                continue;
              }
              if (runStart < 0) runStart = i;
            }
            if (runStart >= 0) {
              const text = paragraphSource.slice(runStart, paragraphSource.length);
              if (text.trim()) runs.push({ start: runStart, end: paragraphSource.length, text });
            }
          }

          // ─── Step 3: validate + apply edits in reverse order ──────────
          for (const edit of edits) {
            if (
              typeof edit.nodeIndex !== 'number' ||
              edit.nodeIndex < 0 ||
              edit.nodeIndex >= runs.length
            ) {
              return send(409, {
                error: `text run at nodeIndex ${edit.nodeIndex} not found (paragraph has ${runs.length} runs)`,
              });
            }
            if (typeof edit.newText !== 'string') {
              return send(400, { error: `edit at nodeIndex ${edit.nodeIndex} missing newText` });
            }
            // Optional sanity check: oldText (if provided) should match the
            // run's normalized content. Catches stale-state edits.
            if (typeof edit.oldText === 'string') {
              const runNorm = normalize(runs[edit.nodeIndex].text);
              const editOldNorm = normalize(edit.oldText);
              if (runNorm !== editOldNorm) {
                return send(409, {
                  error: `text run mismatch at nodeIndex ${edit.nodeIndex} — paragraph may have changed`,
                  hint: `expected "${edit.oldText.slice(0, 60)}", source has "${runs[edit.nodeIndex].text.slice(0, 60)}"`,
                });
              }
            }
          }

          // Apply highest-index edits first so lower-index byte positions
          // remain valid for the next iteration.
          const sortedEdits = [...edits].sort((a, b) => b.nodeIndex - a.nodeIndex);
          let modifiedParagraph = paragraphSource;
          for (const edit of sortedEdits) {
            const run = runs[edit.nodeIndex];
            modifiedParagraph =
              modifiedParagraph.slice(0, run.start) +
              edit.newText +
              modifiedParagraph.slice(run.end);
          }

          const updated = source.slice(0, paraStart) + modifiedParagraph + source.slice(paraEnd);
          fs.writeFileSync(filePath, updated, 'utf-8');
          return send(200, { ok: true, mode: 'per-node', editsApplied: edits.length });
        } catch (err) {
          return send(500, { error: String(err) });
        }
      });
    },
  };
}
