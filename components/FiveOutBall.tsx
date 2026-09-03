export default function FiveOutBall({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="fiveout-ball-clip"><circle cx="50" cy="50" r="42" /></clipPath>
      </defs>

      <circle cx="50" cy="50" r="45.5" fill="#07111f" stroke="#67e8f9" strokeWidth="4.5" />
      <circle cx="50" cy="50" r="41.5" stroke="#d9fbff" strokeWidth="2" />
      <g clipPath="url(#fiveout-ball-clip)" stroke="#d9fbff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 47C24 30 48 24 75 29c9 1.7 16 4.8 22 8.5" />
        <path d="M6 68c16-20 33-27 49-20 13 5.5 27 20 41 34" />
        <path d="M34 5c-8 15-10 31-7 49 3.4 20.5 12 35 26 43" />
        <path d="M15 18c10 8.5 21 9.5 33 3.5C61 15 72 11 85 14" />
      </g>
    </svg>
  );
}
