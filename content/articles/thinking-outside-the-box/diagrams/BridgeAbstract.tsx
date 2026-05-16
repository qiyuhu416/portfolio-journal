import { useArticle } from '@/routes/ArticleContext';

/**
 * Abstract version of the Analysis–Synthesis Bridge (Hugh Dubberly).
 * Mirrors the canonical reference: the 2x2 grid (Researching/Prototyping
 * × Interpret/Describe), four labeled nodes, and the diagonal flow
 * (distilled to → suggest → manifest as). No project-specific content.
 */
export function BridgeAbstract() {
  const article = useArticle();
  const tint = article?.tint ?? 'var(--ink-3)';

  // Layout (viewBox 1100 × 700)
  const left = 220;
  const right = 1040;
  const top = 80;
  const bottom = 600;
  const midX = (left + right) / 2;       // 630
  const midY = (top + bottom) / 2;       // 340

  const colCurrentX = (left + midX) / 2; // 425
  const colFutureX  = (midX + right) / 2; // 835
  const rowAbstractY = (top + midY) / 2;  // 210
  const rowConcreteY = (midY + bottom) / 2; // 470

  const r = 72;

  return (
    <svg
      viewBox="0 0 1100 700"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-label="Abstract version of the Analysis–Synthesis Bridge: a 2x2 grid (Researching/Prototyping by Interpret/Describe) with four nodes — Model of what is, Model of what could be, What is, What could be — connected by a diagonal flow: distilled to, suggest, manifest as."
    >
      <defs>
        <marker id="ba-arr" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M2,1 L8,5 L2,9" fill="none" stroke={tint} strokeWidth="1.6" />
        </marker>
      </defs>

      {/* Grid frame */}
      <rect x={left} y={top} width={right - left} height={bottom - top}
            fill="none" stroke="var(--ink-3)" strokeOpacity="0.4" strokeWidth="1" />
      <line x1={midX} y1={top} x2={midX} y2={bottom}
            stroke="var(--ink-3)" strokeOpacity="0.4" strokeWidth="1" />
      <line x1={left} y1={midY} x2={right} y2={midY}
            stroke="var(--ink-3)" strokeOpacity="0.4" strokeWidth="1" />

      {/* Top column headers */}
      <text x={colCurrentX} y={top - 25} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="22" fontWeight="500"
            fill="var(--ink)">Researching</text>
      <text x={colFutureX} y={top - 25} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="22" fontWeight="500"
            fill="var(--ink)">Prototyping</text>

      {/* Inside-cell row headers (top-left of each row's first cell) */}
      <text x={left + 18} y={top + 32}
            fontFamily="var(--reading)" fontSize="17"
            fill="var(--ink-2)">Abstract</text>
      <text x={left + 18} y={midY + 32}
            fontFamily="var(--reading)" fontSize="17"
            fill="var(--ink-2)">Concrete</text>

      {/* Left-side row labels (outside grid) */}
      <text x={left - 30} y={rowAbstractY + 7} textAnchor="end"
            fontFamily="var(--reading)" fontSize="22" fontWeight="500"
            fill="var(--ink)">Interpret</text>
      <text x={left - 30} y={rowConcreteY + 7} textAnchor="end"
            fontFamily="var(--reading)" fontSize="22" fontWeight="500"
            fill="var(--ink)">Describe</text>

      {/* Bottom column footers */}
      <text x={colCurrentX} y={bottom + 36} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="17"
            fill="var(--ink-2)">Existing – Implicit</text>
      <text x={colCurrentX} y={bottom + 58} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="15" fontStyle="italic"
            fill="var(--ink-2)">(Current)</text>
      <text x={colFutureX} y={bottom + 36} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="17"
            fill="var(--ink-2)">Preferred – Explicit</text>
      <text x={colFutureX} y={bottom + 58} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="15" fontStyle="italic"
            fill="var(--ink-2)">(Future)</text>

      {/* Four labeled nodes */}
      {/* Top-left: Model of what "is" */}
      <circle cx={colCurrentX} cy={rowAbstractY} r={r}
              fill="#fff" stroke={tint} strokeWidth="1.6" />
      <text x={colCurrentX} y={rowAbstractY} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="18" fontWeight="500" fill="var(--ink)">
        <tspan x={colCurrentX} dy="-0.3em">Model of</tspan>
        <tspan x={colCurrentX} dy="1.25em">what “is”</tspan>
      </text>

      {/* Top-right: Model of what "could be" */}
      <circle cx={colFutureX} cy={rowAbstractY} r={r}
              fill="#fff" stroke={tint} strokeWidth="1.6" />
      <text x={colFutureX} y={rowAbstractY} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="18" fontWeight="500" fill="var(--ink)">
        <tspan x={colFutureX} dy="-0.9em">Model of</tspan>
        <tspan x={colFutureX} dy="1.25em">what</tspan>
        <tspan x={colFutureX} dy="1.25em">“could be”</tspan>
      </text>

      {/* Bottom-left: What "is" */}
      <circle cx={colCurrentX} cy={rowConcreteY} r={r}
              fill="#fff" stroke={tint} strokeWidth="1.6" />
      <text x={colCurrentX} y={rowConcreteY + 5} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="18" fontWeight="500" fill="var(--ink)">
        What “is”
      </text>

      {/* Bottom-right: What "could be" */}
      <circle cx={colFutureX} cy={rowConcreteY} r={r}
              fill="#fff" stroke={tint} strokeWidth="1.6" />
      <text x={colFutureX} y={rowConcreteY} textAnchor="middle"
            fontFamily="var(--reading)" fontSize="18" fontWeight="500" fill="var(--ink)">
        <tspan x={colFutureX} dy="-0.3em">What</tspan>
        <tspan x={colFutureX} dy="1.25em">“could be”</tspan>
      </text>

      {/* Diagonal flow arrows */}
      {/* "distilled to" — bottom-left → top-left, going up */}
      <line
        x1={colCurrentX} y1={rowConcreteY - r - 6}
        x2={colCurrentX} y2={rowAbstractY + r + 6}
        stroke={tint} strokeWidth="1.6"
        markerEnd="url(#ba-arr)"
      />
      <text
        x={colCurrentX - 14}
        y={(rowAbstractY + rowConcreteY) / 2}
        textAnchor="middle"
        fontFamily="var(--reading)" fontStyle="italic" fontSize="16"
        fill={tint}
        transform={`rotate(-90, ${colCurrentX - 14}, ${(rowAbstractY + rowConcreteY) / 2})`}
      >
        distilled to
      </text>

      {/* "suggest" — top-left → top-right, going right */}
      <line
        x1={colCurrentX + r + 6} y1={rowAbstractY}
        x2={colFutureX - r - 6}  y2={rowAbstractY}
        stroke={tint} strokeWidth="1.6"
        markerEnd="url(#ba-arr)"
      />
      <text
        x={(colCurrentX + colFutureX) / 2}
        y={rowAbstractY - 12}
        textAnchor="middle"
        fontFamily="var(--reading)" fontStyle="italic" fontSize="16"
        fill={tint}
      >
        suggest
      </text>

      {/* "manifest as" — top-right → bottom-right, going down */}
      <line
        x1={colFutureX} y1={rowAbstractY + r + 6}
        x2={colFutureX} y2={rowConcreteY - r - 6}
        stroke={tint} strokeWidth="1.6"
        markerEnd="url(#ba-arr)"
      />
      <text
        x={colFutureX + 16}
        y={(rowAbstractY + rowConcreteY) / 2}
        textAnchor="middle"
        fontFamily="var(--reading)" fontStyle="italic" fontSize="16"
        fill={tint}
        transform={`rotate(90, ${colFutureX + 16}, ${(rowAbstractY + rowConcreteY) / 2})`}
      >
        manifest as
      </text>
    </svg>
  );
}
