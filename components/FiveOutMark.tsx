export default function FiveOutMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3" aria-label="FIVEOUT">
      <svg viewBox="0 0 64 64" aria-hidden="true" className={`${compact ? "h-9 w-9" : "h-11 w-11"} shrink-0 overflow-visible`}>
        <defs>
          <clipPath id="fiveout-five-bowl"><path d="M19 27.5c4.6-3.8 10.2-5.6 16.8-5.6C49.5 21.9 58 29.2 58 40.7 58 53 48.3 61 34.5 61 22.8 61 13.8 55.8 9 46.8l12.4-6.1c2.8 5.2 7 7.8 12.7 7.8 6.1 0 10-3 10-7.7 0-4.6-3.7-7.4-9.9-7.4H14.6z" /></clipPath>
        </defs>
        <path d="M18.5 4H58l-5.8 13.2H29.4l-2.6 8.2c3-2.3 7.2-3.5 12.1-3.5C50.6 21.9 58 29.4 58 40.7 58 53 48.3 61 34.5 61 22.8 61 13.8 55.8 9 46.8l12.4-6.1c2.8 5.2 7 7.8 12.7 7.8 6.1 0 10-3 10-7.7 0-4.6-3.7-7.4-9.9-7.4H11.5L18.5 4Z" fill="#182f63" stroke="#67e8f9" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M18.5 4h14.8L27 10.8l-9.8 5.4Z" fill="#8b5cf6" />
        <g clipPath="url(#fiveout-five-bowl)" fill="none" stroke="#67e8f9" strokeWidth="2.8" strokeLinecap="round">
          <path d="M17.5 51.5C31 45.8 43.8 38.3 55.7 27.6" />
          <path d="M37.2 23.5c5.8 7.4 8.7 17.4 8.5 28.5" />
          <path d="M47.5 25.7c2.5 6.5 5.7 11.4 10.5 14.8" />
        </g>
      </svg>
      {!compact && <span className="text-[1.05rem] font-black tracking-[-.045em] text-white">FIVE<span className="text-cyan-300">OUT</span></span>}
    </span>
  );
}
