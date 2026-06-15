export function WhatIfCard() {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Open home page scrolled to the experiment section
    window.open('/?section=experiment', '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        border: 'none',
        background: 'transparent',
        padding: '1.5em 0',
        cursor: 'pointer',
        textDecoration: 'none',
      }}
    >
      {/* Card container */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.boxShadow = '0 12px 32px rgba(31,30,27,0.12)';
        el.style.transform = 'translateY(-4px)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.boxShadow = 'none';
        el.style.transform = 'translateY(0)';
      }}>
        {/* Visual representation of the table as a grid */}
        <div style={{
          aspectRatio: '16 / 9',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--tint-tr) 8%, transparent), color-mix(in srgb, var(--tint-tr) 3%, transparent))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative grid pattern in background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(0deg, transparent 0 19px, color-mix(in srgb, var(--ink) 3%, transparent) 19px 20px), repeating-linear-gradient(90deg, transparent 0 19px, color-mix(in srgb, var(--ink) 3%, transparent) 19px 20px)',
            pointerEvents: 'none',
          }} />

          {/* Center content */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}>
            <div style={{
              fontSize: 'clamp(24px, 4vw, 48px)',
              fontWeight: 400,
              color: 'var(--ink)',
              fontFamily: 'var(--serif)',
              letterSpacing: '-0.015em',
              lineHeight: 1.1,
            }}>
              What if?
            </div>
            <div style={{
              fontSize: 'clamp(14px, 2vw, 18px)',
              fontFamily: 'var(--sans)',
              color: 'var(--ink-2)',
              fontWeight: 400,
              maxWidth: 360,
              letterSpacing: '0',
            }}>
              Bold bets on where human–AI interaction could go next
            </div>
          </div>
        </div>

        {/* Text section */}
        <div style={{
          padding: 'clamp(20px, 4vw, 32px)',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'var(--sans)',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 8,
          }}>
            Interactive Framework
          </div>
          <div style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: 'var(--ink)',
            lineHeight: 1.4,
            fontWeight: 400,
            letterSpacing: '-0.01em',
          }}>
            Explore questions & approaches to reimagine how we design human-AI interaction.
          </div>
        </div>
      </div>
    </button>
  );
}
