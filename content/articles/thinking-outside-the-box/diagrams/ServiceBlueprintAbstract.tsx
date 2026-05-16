import { useArticle } from '@/routes/ArticleContext';

/**
 * Abstract version of a Service Blueprint — canonical generic structure,
 * not the specific filled-in healthcare example.
 *
 * Rows (top → bottom):
 *   1. Stakeholder action       — what the service-side actor does (frontstage)
 *   2. User action              — what the customer/user does
 *   3. Behind the stage         — invisible / backstage actions
 *   4. AI capability            — where AI augments or performs
 *
 * Subtle horizontal dividers between rows stand in for the canonical
 * "lines" (interaction / visibility / internal interaction). Tint is
 * reserved for the AI row — the structural insight in this article.
 */
export function ServiceBlueprintAbstract() {
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';

  // Layout
  const stages = 7;
  const colW = 110;
  const colStart = 280;          // wider gutter for the long row labels
  const rowH = 84;
  const rowStart = 110;
  const trackEnd = colStart + stages * colW - 20;

  // Per-row presence pattern (1 = present at this stage, 0 = absent).
  // Generic on purpose — communicates "different actors show up at different
  // moments" without naming any specific workflow.
  const patternStakeholder = [1, 1, 1, 0, 1, 1, 1];
  const patternUser        = [1, 1, 0, 1, 1, 0, 1];
  const patternBehind      = [0, 1, 1, 1, 1, 1, 0];
  const patternAI          = [1, 0, 1, 1, 0, 1, 1];

  type Row = {
    label: string;
    pattern: number[];
    /** Visual treatment — tinted (AI) vs neutral. */
    isAI: boolean;
    /** Fill opacity step so the eye can still tell rows apart at a glance. */
    opacity: number;
  };

  const rows: Row[] = [
    { label: 'STAKEHOLDER ACTION', pattern: patternStakeholder, isAI: false, opacity: 0.55 },
    { label: 'USER ACTION',        pattern: patternUser,        isAI: false, opacity: 0.4  },
    { label: 'BEHIND THE STAGE',   pattern: patternBehind,      isAI: false, opacity: 0.55 },
    { label: 'AI CAPABILITY',      pattern: patternAI,          isAI: true,  opacity: 0.85 },
  ];

  return (
    <svg
      viewBox="0 0 1100 560"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-label="Abstract structure of a Service Blueprint: a workflow timeline across the top with four swimlanes — Stakeholder Action, User Action, Behind the Stage, AI Capability — and cells marking where each actor is present in the flow."
    >
      <defs>
        <marker id="sb-arrR" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M2,1 L8,5 L2,9" fill="none" stroke="var(--ink-2)" strokeWidth="1.4" />
        </marker>
      </defs>

      {/* Timeline arrow across the top */}
      <line
        x1={colStart} y1="60" x2={trackEnd} y2="60"
        stroke="var(--ink-2)" strokeWidth="1.2"
        markerEnd="url(#sb-arrR)"
      />
      {/* Timeline ticks (rough quartile marks) */}
      {Array.from({ length: 3 }).map((_, i) => {
        const x = colStart + ((i + 1) * (trackEnd - colStart)) / 4;
        return <line key={`tick-${i}`} x1={x} y1="55" x2={x} y2="65" stroke="var(--ink-2)" strokeWidth="1" />;
      })}
      <text
        x={(colStart + trackEnd) / 2} y="35" textAnchor="middle"
        fontFamily="var(--mono)" fontSize="11" letterSpacing="2"
        fill="var(--ink-2)"
      >
        WORKFLOW · STAGES OVER TIME
      </text>

      {/* Swimlanes */}
      {rows.map((row, rowIdx) => {
        const y = rowStart + rowIdx * rowH;
        const labelColor = row.isAI ? tint : 'var(--ink-2)';

        return (
          <g key={`row-${rowIdx}`}>
            {/* Row label — left of the lane */}
            <text
              x={colStart - 22} y={y + 32}
              textAnchor="end"
              fontFamily="var(--mono)" fontSize="10" letterSpacing="1.6"
              fill={labelColor}
            >
              {row.label}
            </text>

            {/* Lane baseline */}
            <line
              x1={colStart} y1={y + 32} x2={trackEnd} y2={y + 32}
              stroke="var(--ink-3)" strokeOpacity="0.45" strokeWidth="1"
              strokeDasharray="2 4"
            />

            {/* Cells — present stages */}
            {row.pattern.map((present, colIdx) => {
              if (!present) return null;
              const x = colStart + colIdx * colW + 10;
              const cellW = colW - 30;
              const cellH = 22;
              const cy = y + 32 - cellH / 2;
              return (
                <rect
                  key={`cell-${rowIdx}-${colIdx}`}
                  x={x} y={cy}
                  width={cellW} height={cellH}
                  rx={row.isAI ? cellH / 2 : 4}
                  fill={row.isAI ? tint : 'var(--ink-3)'}
                  fillOpacity={row.opacity}
                />
              );
            })}

            {/* Canonical "line of …" divider below this row (skip after the last) */}
            {rowIdx < rows.length - 1 && (
              <line
                x1={colStart - 4} y1={y + rowH - 10}
                x2={trackEnd}    y2={y + rowH - 10}
                stroke="var(--ink-3)" strokeOpacity="0.35" strokeWidth="1"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
