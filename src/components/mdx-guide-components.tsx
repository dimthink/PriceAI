import { ArrowRight, Info, ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { GuideResponsiveTable } from "@/components/GuideResponsiveTable";

type CalloutVariant = "note" | "warning";

export function Callout({
  title,
  children,
  variant = "note",
}: {
  title?: string;
  children: ReactNode;
  variant?: CalloutVariant;
}) {
  const isWarning = variant === "warning";

  return (
    <div className={`my-7 rounded-md px-4 py-4 ${isWarning ? "bg-[#fff7e8] text-[#7a541b]" : "bg-[#eef3f8] text-[#47657a]"}`}>
      <div className="flex gap-3">
        {isWarning ? <ShieldAlert size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
        <div>
          {title ? <p className="font-semibold text-[#202829]">{title}</p> : null}
          <div className={`${title ? "mt-2 " : ""}text-sm leading-7`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function GuideCta({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
        variant === "primary"
          ? "bg-[#2d3435] text-[#f8f8f8] hover:bg-[#202829]"
          : "bg-[#edf0f1] text-[#2d3435] hover:bg-[#dde4e5]"
      }`}
    >
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}

export const mdxGuideComponents = {
  a: (props: ComponentProps<"a">) => (
    <a {...props} className="font-semibold text-[#2f7a4b] underline decoration-[#45bf78]/30 underline-offset-4 hover:text-[#202829]" />
  ),
  h2: (props: ComponentProps<"h2">) => <h2 {...props} className="mt-12 font-serif text-3xl font-semibold tracking-normal text-[#202829]" />,
  h3: (props: ComponentProps<"h3">) => <h3 {...props} className="mt-8 text-lg font-semibold text-[#202829]" />,
  p: (props: ComponentProps<"p">) => <p {...props} className="mt-4 text-base leading-[1.85] text-[#485152]" />,
  ul: (props: ComponentProps<"ul">) => <ul {...props} className="mt-4 list-disc space-y-2 pl-5 text-base leading-[1.85] text-[#485152]" />,
  ol: (props: ComponentProps<"ol">) => <ol {...props} className="mt-4 list-decimal space-y-2 pl-5 text-base leading-[1.85] text-[#485152]" />,
  li: (props: ComponentProps<"li">) => <li {...props} className="pl-1" />,
  strong: (props: ComponentProps<"strong">) => <strong {...props} className="font-semibold text-[#202829]" />,
  table: (props: ComponentProps<"table">) => <GuideResponsiveTable>{props.children}</GuideResponsiveTable>,
  Callout,
  GuideCta,
};
