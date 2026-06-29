import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

export function DataTableShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 ${className}`}
    >
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function DataTableHead({
  children,
  className = "",
  compact = false,
  explanation,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  explanation?: string;
}) {
  return (
    <th className={`${compact ? "px-4" : "px-5"} py-3 text-left font-semibold ${className}`} scope="col">
      {explanation ? (
        <span
          className="inline-flex cursor-help items-center border-b border-dashed border-[#7f8889] pb-0.5 leading-tight text-[#4f5758]"
          title={explanation}
          aria-label={`${plainText(children)}：${explanation}`}
        >
          {children}
        </span>
      ) : (
        children
      )}
    </th>
  );
}

function plainText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "说明";
}

export function ViewToggleButton({
  active,
  icon,
  label,
  onClick,
  compact = false,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition ${
        compact ? "px-3" : "md:px-3.5"
      } ${
        active
          ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
          : "text-[#5a6061] hover:text-[#202829]"
      }`}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label
      className={`flex h-11 min-w-0 items-center gap-2 rounded-full bg-white px-4 shadow-[0_16px_45px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15 ${className}`}
    >
      <Search size={16} className="shrink-0 text-[#5a6061]" />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-[#2d3435] outline-none placeholder:text-[#8d9798]"
      />
    </label>
  );
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-[#5a6061]">{label}</span>
      <select
        className="h-10 w-full truncate rounded-full bg-white px-3 text-sm font-semibold text-[#2d3435] outline-none ring-1 ring-[#adb3b4]/15 transition focus:ring-2 focus:ring-[#45bf78]/35"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MetricTile({
  label,
  value,
  helper,
  className = "",
}: {
  label: string;
  value: string;
  helper?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-lg bg-white px-3 py-2 ring-1 ring-[#adb3b4]/15 ${className}`}>
      <p className="truncate text-[0.68rem] font-semibold text-[#5a6061]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold tabular-nums text-[#202829] md:text-lg">{value}</p>
      {helper ? <p className="mt-0.5 truncate text-xs text-[#7a8182]">{helper}</p> : null}
    </div>
  );
}

export function PriceMetric({
  label,
  value,
  helper,
  official,
  tone = "default",
  density = "regular",
}: {
  label: string;
  value: string;
  helper?: string;
  official?: string;
  tone?: "default" | "muted" | "good" | "warn";
  density?: "regular" | "compact";
}) {
  const className =
    tone === "good"
      ? "bg-[#f5fbf7] ring-[#d7eadb]"
      : tone === "warn"
        ? "bg-[#fffaf0] ring-[#f0dfb8]"
        : tone === "muted"
          ? "bg-[#f2f4f4] ring-[#adb3b4]/10"
          : "bg-[#f7f9f9] ring-[#adb3b4]/10";

  if (density === "compact") {
    return (
      <div className={`min-w-0 rounded-md px-2.5 py-2 ring-1 ${className}`}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-[11px] font-bold text-[#5a6061]">{label}</p>
          {helper ? (
            <span className="shrink-0 rounded-full bg-white/75 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#5a6061] ring-1 ring-[#adb3b4]/10">
              {helper}
            </span>
          ) : null}
        </div>
        {official ? (
          <p className="mt-1 truncate text-[11px] font-semibold text-[#8b9192] line-through decoration-[#8b9192]/70">
            {official}
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-sm font-extrabold tabular-nums text-[#202829]">{value}</p>
      </div>
    );
  }

  return (
    <div className={`min-w-0 rounded-lg px-3 py-2 ring-1 ${className}`}>
      <p className="text-[0.68rem] font-semibold text-[#5a6061]">{label}</p>
      {official ? (
        <p className="mt-1 truncate text-xs font-semibold text-[#8b9192] line-through decoration-[#8b9192]/70">
          {official}
        </p>
      ) : null}
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#202829]">{value}</p>
      {helper ? <p className="mt-1 break-words text-xs leading-5 text-[#5a6061]">{helper}</p> : null}
    </div>
  );
}

export function StatusChip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "info" | "danger" | "neutral" | "muted";
  className?: string;
}) {
  const toneClass = {
    success: "bg-[#e8f3ec] text-[#2f7a4b]",
    warning: "bg-[#fff7e8] text-[#7a541b]",
    info: "bg-[#eef3f8] text-[#47657a]",
    danger: "bg-[#fbe9e7] text-[#9b3328]",
    neutral: "bg-[#e4e9ea] text-[#2d3435]",
    muted: "bg-[#f2f4f4] text-[#5a6061]",
  }[tone];

  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass} ${className}`}>
      {children}
    </span>
  );
}

export function MobileFilterSheet({
  open,
  title,
  description,
  children,
  resultCount,
  onClose,
  onReset,
}: {
  open: boolean;
  title: string;
  description: string;
  children: ReactNode;
  resultCount: number;
  onClose: () => void;
  onReset: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="关闭筛选"
        className="absolute inset-0 h-full w-full bg-[#202829]/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <section className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-2xl bg-[#f9f9f9] px-5 pb-5 pt-4 shadow-[0_-20px_70px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/20">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#adb3b4]/60" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-[#202829]">{title}</p>
            <p className="mt-1 text-sm text-[#5a6061]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e9ea] text-[#5a6061] transition hover:bg-[#dde4e5] hover:text-[#202829]"
            aria-label="关闭筛选"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-5 space-y-5">{children}</div>
        <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-[#dfe4e5] pt-4">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#e4e9ea] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
          >
            重置
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
          >
            查看 {resultCount} 条结果
          </button>
        </div>
      </section>
    </div>
  );
}
