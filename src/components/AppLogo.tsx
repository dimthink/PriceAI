export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[#202829] sm:gap-3" aria-label="PriceAI AI 比价雷达">
      <span className={`grid shrink-0 place-items-center ${compact ? "h-9 w-9" : "h-9 w-9 sm:h-11 sm:w-11"}`}>
        <svg
          viewBox="0 0 64 64"
          aria-hidden="true"
          className={compact ? "h-8 w-8" : "h-8 w-8 sm:h-10 sm:w-10"}
        >
          <circle cx="28" cy="28" r="20" fill="var(--color-logo-lens-bg)" stroke="currentColor" strokeWidth="5" />
          <path
            d="M15 33L23 25L30 30L41 19"
            fill="none"
            stroke="var(--color-brand)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
          <circle cx="41" cy="19" r="3.6" fill="var(--color-brand)" />
          <path d="M43 43L56 56" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`truncate font-sans font-extrabold tracking-[-0.01em] text-[#202829] ${compact ? "text-2xl" : "text-2xl sm:text-3xl"}`}>
          PriceAI
        </span>
        {!compact ? (
          <span className="mt-1.5 hidden text-[0.62rem] font-semibold tracking-[0.22em] text-[#6b7374] sm:block">
            AI 比价雷达
          </span>
        ) : null}
      </span>
    </span>
  );
}
