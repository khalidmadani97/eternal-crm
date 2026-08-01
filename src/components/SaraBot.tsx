// Sara's face (Slice 35, redrawn cuter+purple per owner feedback): soft
// violet bot with a light face and big sparkly eyes. Zero dependencies.
export type SaraMood = 'idle' | 'thinking' | 'happy'

export function SaraBot({ size = 52, mood = 'idle' }: { size?: number; mood?: SaraMood }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="Sara"
      className={mood === 'thinking' ? 'sara-think' : undefined}
    >
      {/* antenna */}
      <line x1="50" y1="15" x2="50" y2="25" stroke="#8b5cf6" strokeWidth="3.5" strokeLinecap="round" />
      <circle className={`sara-dot ${mood === 'idle' ? 'sara-pulse' : ''}`} cx="50" cy="11" r="5.5" fill="#d946ef" />

      {/* waving arm (happy only) */}
      {mood === 'happy' && (
        <g className="sara-wave-arm">
          <line x1="83" y1="68" x2="94" y2="50" stroke="#8b5cf6" strokeWidth="7" strokeLinecap="round" />
          <circle cx="95" cy="48" r="5.5" fill="#c4b5fd" />
        </g>
      )}

      {/* head: soft violet with a big light face */}
      <rect x="17" y="24" width="66" height="58" rx="27" fill="#8b5cf6" />
      <rect x="24" y="31" width="52" height="44" rx="20" fill="#f5f3ff" />

      {/* little ears */}
      <circle cx="17" cy="53" r="5" fill="#a78bfa" />
      <circle cx="83" cy="53" r="5" fill="#a78bfa" />

      {/* face */}
      <g className="sara-eyes">
        {mood === 'happy' ? (
          <>
            {/* closed happy eyes */}
            <path d="M33 51 q6.5 -8 13 0" stroke="#6d28d9" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M54 51 q6.5 -8 13 0" stroke="#6d28d9" strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="sara-blink">
            {/* big round eyes with sparkles */}
            <circle cx="39.5" cy="50" r="8" fill="#6d28d9" />
            <circle cx="60.5" cy="50" r="8" fill="#6d28d9" />
            <circle cx="42.5" cy="47" r="3" fill="#ffffff" />
            <circle cx="63.5" cy="47" r="3" fill="#ffffff" />
            <circle cx="37" cy="52.5" r="1.5" fill="#ffffff" opacity="0.8" />
            <circle cx="58" cy="52.5" r="1.5" fill="#ffffff" opacity="0.8" />
          </g>
        )}
        {/* mouth */}
        {mood === 'happy' ? (
          <path d="M40 62 q10 10 20 0" stroke="#7c3aed" strokeWidth="4" fill="none" strokeLinecap="round" />
        ) : mood === 'thinking' ? (
          <ellipse cx="50" cy="64" rx="4" ry="3.5" fill="#a78bfa" />
        ) : (
          <path d="M43 63 q7 5.5 14 0" stroke="#7c3aed" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        )}
      </g>

      {/* pink blush */}
      <ellipse cx="30" cy="59" rx="4.5" ry="3" fill="#f9a8d4" opacity="0.8" />
      <ellipse cx="70" cy="59" rx="4.5" ry="3" fill="#f9a8d4" opacity="0.8" />
    </svg>
  )
}
