export default function FiveOutMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3" aria-label="FIVEOUT">
      <svg viewBox="0 0 48 48" aria-hidden="true" className={`${compact ? "h-9 w-9" : "h-11 w-11"} shrink-0 overflow-visible`}>
        <defs>
          <linearGradient id="fiveout-mark" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#67e8f9" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="46" height="46" rx="14" fill="#0d1424" stroke="url(#fiveout-mark)" strokeWidth="2" />
        <path d="M11 37V20c0-6 5-11 11-11h15" fill="none" stroke="#e8edf8" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 37c0-10 8-18 18-18" fill="none" stroke="url(#fiveout-mark)" strokeWidth="3" strokeLinecap="round" />
        {[[12,14],[22,10],[32,14],[38,24],[36,36]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.8" fill="#67e8f9" />)}
      </svg>
      {!compact && <span className="text-[1.05rem] font-black tracking-[-.04em] text-white">FIVE<span className="text-cyan-300">OUT</span></span>}
    </span>
  );
}
