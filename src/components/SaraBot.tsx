// Sara's face (Slice 35): a hand-drawn SVG bot, zero dependencies. Moods:
//   idle     — bobbing, blinking, antenna glowing
//   thinking — eyes darting, antenna racing
//   happy    — beaming smile, waving arm
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
      <line x1="50" y1="16" x2="50" y2="26" stroke="#b08d3f" strokeWidth="3" strokeLinecap="round" />
      <circle className={`sara-dot ${mood === 'idle' ? 'sara-pulse' : ''}`} cx="50" cy="12" r="5" fill="#f59e0b" />

      {/* waving arm (happy only) */}
      {mood === 'happy' && (
        <g className="sara-wave-arm">
          <line x1="82" y1="70" x2="94" y2="52" stroke="#3b2a20" strokeWidth="6" strokeLinecap="round" />
          <circle cx="95" cy="50" r="5" fill="#f0c060" />
        </g>
      )}

      {/* head */}
      <rect x="20" y="26" width="60" height="52" rx="22" fill="#3b2a20" />
      <rect x="26" y="32" width="48" height="40" rx="17" fill="#4a372a" />

      {/* face */}
      <g className="sara-eyes">
        {mood === 'happy' ? (
          <>
            {/* closed happy eyes */}
            <path d="M36 50 q5 -6 10 0" stroke="#fcd34d" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M54 50 q5 -6 10 0" stroke="#fcd34d" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="sara-blink">
            <circle cx="41" cy="49" r="5.5" fill="#fcd34d" />
            <circle cx="59" cy="49" r="5.5" fill="#fcd34d" />
            <circle cx="42.5" cy="47.5" r="2" fill="#3b2a20" />
            <circle cx="60.5" cy="47.5" r="2" fill="#3b2a20" />
          </g>
        )}
        {/* mouth */}
        {mood === 'happy' ? (
          <path d="M40 60 q10 9 20 0" stroke="#fcd34d" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        ) : mood === 'thinking' ? (
          <ellipse cx="50" cy="62" rx="4" ry="3" fill="#fcd34d" />
        ) : (
          <path d="M42 61 q8 6 16 0" stroke="#fcd34d" strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
      </g>

      {/* blush */}
      <circle cx="31" cy="58" r="3.5" fill="#b08d3f" opacity="0.45" />
      <circle cx="69" cy="58" r="3.5" fill="#b08d3f" opacity="0.45" />
    </svg>
  )
}
