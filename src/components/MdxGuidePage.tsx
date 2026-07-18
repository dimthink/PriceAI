/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { GuideDocsLayout } from "@/components/GuideDocsLayout";
import { GuideReadingFooter } from "@/components/GuideReadingFooter";
import { GuideResponsiveTable } from "@/components/GuideResponsiveTable";
import { JsonLd } from "@/components/JsonLd";
import { Callout, GuideCta } from "@/components/mdx-guide-components";
import { buildMdxGuideJsonLd, readParsedMdxGuide } from "@/lib/mdx-guides";

type GuideBlock =
  | { type: "callout"; title?: string; variant?: "note" | "warning"; children: GuideBlock[] }
  | { type: "blockquote"; text: string }
  | { type: "code"; code: string; language?: string }
  | { type: "ctaGroup"; ctas: Array<{ href: string; label: string; variant?: "primary" | "secondary" }> }
  | { type: "grid"; columns: GuideBlock[][] }
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "image"; alt: string; src: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

type RenderOptions = {
  compact?: boolean;
  sectionNumber?: number;
};

export async function MdxGuidePage({ slug }: { slug: string }) {
  const { frontmatter, body } = await readParsedMdxGuide(slug);
  const blocks = parseGuideBlocks(body);
  const shouldShowDescription = frontmatter.description.trim() !== "" && frontmatter.description.trim() !== frontmatter.title.trim();
  const isSourceMirror = frontmatter.sourceMode === "mirror";

  return (
    <>
      <JsonLd data={buildMdxGuideJsonLd(frontmatter)} />
      <GuideDocsLayout currentHref={frontmatter.canonical}>
        <article className="pb-14">
          <header className="border-b border-[#dfe4e5] pb-7">
            {frontmatter.eyebrow ? (
              <p className="text-xs font-bold tracking-[0.08em] text-[#2f7a4b]">{frontmatter.eyebrow}</p>
            ) : null}
            <h1 className="mt-3 max-w-[760px] font-serif text-[2.25rem] font-semibold leading-[1.2] tracking-normal text-[#202829] sm:text-[2.5rem]">
              {frontmatter.title}
            </h1>
            {shouldShowDescription ? (
              <p className="mt-5 max-w-[72ch] text-base leading-8 text-[#5a6061]">{frontmatter.description}</p>
            ) : null}
            {frontmatter.tags.length ? (
              <div className="mt-5 flex flex-wrap gap-2" aria-label="文章标签">
                {frontmatter.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-[#eef1f1] px-2.5 py-1 text-xs font-semibold text-[#5a6061]">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {(frontmatter.primaryCta || frontmatter.secondaryCta) ? (
              <div className="mt-6 flex flex-wrap gap-3">
                {frontmatter.primaryCta ? <HeaderCta href={frontmatter.primaryCta.href}>{frontmatter.primaryCta.label}</HeaderCta> : null}
                {frontmatter.secondaryCta ? (
                  <HeaderCta href={frontmatter.secondaryCta.href} variant="secondary">
                    {frontmatter.secondaryCta.label}
                  </HeaderCta>
                ) : null}
              </div>
            ) : null}
          </header>

          <div className="max-w-[72ch] pt-7">{renderGuideBlocks(blocks, "body")}</div>

          {isSourceMirror ? null : <GuideReadingFooter currentHref={frontmatter.canonical} />}
        </article>
      </GuideDocsLayout>
    </>
  );
}

function HeaderCta({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <GuideCta href={href} variant={variant}>
      {children}
    </GuideCta>
  );
}

function parseGuideBlocks(source: string): GuideBlock[] {
  return parseGuideLines(source.replace(/\r\n/g, "\n").split("\n"));
}

function parseGuideLines(lines: string[]): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("<Callout")) {
      const endIndex = findClosingLine(lines, index + 1, "</Callout>");
      const attrs = parseMdxTagAttributes(trimmed);
      blocks.push({
        type: "callout",
        title: attrs.title,
        variant: attrs.variant === "warning" ? "warning" : "note",
        children: parseGuideLines(lines.slice(index + 1, endIndex)),
      });
      index = endIndex + 1;
      continue;
    }

    if (trimmed.startsWith("<div")) {
      const endIndex = findClosingLine(lines, index + 1, "</div>");
      const ctas = lines.slice(index + 1, endIndex).flatMap((ctaLine) => {
        const cta = parseGuideCtaLine(ctaLine);
        return cta ? [cta] : [];
      });
      if (ctas.length) {
        blocks.push({ type: "ctaGroup", ctas });
      }
      index = endIndex + 1;
      continue;
    }

    if (trimmed.startsWith("<grid")) {
      const endIndex = findClosingLine(lines, index + 1, "</grid>");
      const columns: GuideBlock[][] = [];
      let gridIndex = index + 1;

      while (gridIndex < endIndex) {
        if (!lines[gridIndex].trim()) {
          gridIndex += 1;
          continue;
        }

        if (lines[gridIndex].trim().startsWith("<column")) {
          const columnEndIndex = findClosingLine(lines, gridIndex + 1, "</column>");
          columns.push(parseGuideLines(lines.slice(gridIndex + 1, columnEndIndex)));
          gridIndex = columnEndIndex + 1;
          continue;
        }

        gridIndex += 1;
      }

      blocks.push({ type: "grid", columns });
      index = endIndex + 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim() || undefined;
      const endIndex = findCodeFenceEnd(lines, index + 1);
      blocks.push({
        type: "code",
        language,
        code: lines.slice(index + 1, endIndex).join("\n"),
      });
      index = endIndex + 1;
      continue;
    }

    const image = parseMarkdownImageLine(trimmed);
    if (image) {
      blocks.push({ type: "image", ...image });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index].trim();
        if (!quoteLine.startsWith(">")) break;
        quoteLines.push(quoteLine.replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      blocks.push({ type: "heading", level: 4, text: trimmed.slice(5).trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "heading", level: 3, text: trimmed.slice(4).trim() });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "heading", level: 2, text: trimmed.slice(3).trim() });
      index += 1;
      continue;
    }

    if (isTableRow(trimmed) && isTableDelimiter(lines[index + 1]?.trim() || "")) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableRow(lines[index].trim())) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      blocks.push(parseTableBlock(tableLines));
      continue;
    }

    if (isOrderedListItem(trimmed) || isUnorderedListItem(trimmed)) {
      const ordered = isOrderedListItem(trimmed);
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = lines[index].trim();
        if (ordered && isOrderedListItem(itemLine)) {
          items.push(itemLine.replace(/^\d+\.\s+/, ""));
          index += 1;
          continue;
        }
        if (!ordered && isUnorderedListItem(itemLine)) {
          items.push(itemLine.slice(2).trim());
          index += 1;
          continue;
        }
        break;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index].trim();
      if (!paragraphLine || isSpecialBlockStart(paragraphLine, lines[index + 1]?.trim() || "")) break;
      paragraphLines.push(paragraphLine);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderGuideBlocks(blocks: GuideBlock[], keyPrefix: string, options: RenderOptions = {}): ReactNode {
  let sectionNumber = 0;
  return blocks.map((block, index) => {
    const nextSectionNumber = block.type === "heading" && block.level === 2 ? ++sectionNumber : undefined;
    return renderGuideBlock(block, `${keyPrefix}-${index}`, index, {
      ...options,
      sectionNumber: nextSectionNumber,
    });
  });
}

function renderGuideBlock(block: GuideBlock, key: string, index: number, options: RenderOptions): ReactNode {
  if (block.type === "heading") {
    if (block.level === 2) {
      return (
        <h2
          key={key}
          data-guide-toc-label={block.text}
          data-guide-section-number={options.sectionNumber}
          className="mt-14 scroll-mt-28 font-serif text-[1.75rem] font-semibold leading-[1.3] tracking-normal text-[#202829] sm:text-[2rem]"
        >
          {options.sectionNumber ? (
            <span aria-hidden="true" className="mr-3 font-sans text-base font-bold text-[#2f7a4b] sm:text-lg">
              {options.sectionNumber}.
            </span>
          ) : null}
          {renderInlineMarkdown(block.text, `${key}-text`)}
        </h2>
      );
    }
    if (block.level === 4) {
      return (
        <h4 key={key} className="mt-6 text-base font-semibold text-[#202829]">
          {renderInlineMarkdown(block.text, `${key}-text`)}
        </h4>
      );
    }
    return (
      <h3 key={key} className="mt-9 text-lg font-semibold leading-7 text-[#202829]">
        {renderInlineMarkdown(block.text, `${key}-text`)}
      </h3>
    );
  }

  if (block.type === "paragraph") {
    const compactClass = index === 0 ? "text-sm leading-7" : "mt-2 text-sm leading-7";
    return (
      <p key={key} className={options.compact ? compactClass : "mt-4 text-base leading-[1.85] text-[#485152]"}>
        {renderInlineMarkdown(block.text, `${key}-text`)}
      </p>
    );
  }

  if (block.type === "blockquote") {
    return (
      <blockquote key={key} className="my-8 border-l-2 border-[#45bf78] bg-[#eef3f8] px-5 py-4 text-base leading-[1.85] text-[#47657a]">
        {renderInlineMarkdown(block.text, `${key}-text`)}
      </blockquote>
    );
  }

  if (block.type === "image") {
    return (
      <figure key={key} className="my-9 overflow-hidden rounded-md border border-[#dfe4e5] bg-white">
        <img src={block.src} alt={block.alt || "教程截图"} loading="lazy" className="h-auto w-full" />
      </figure>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        key={key}
        className={`${options.compact ? "mt-2 text-sm" : "mt-4 text-base text-[#485152]"} ${
          block.ordered ? "list-decimal" : "list-disc"
        } space-y-2 pl-5 leading-8`}
      >
        {block.items.map((item, itemIndex) => (
          <li key={`${key}-item-${itemIndex}`} className="pl-1">
            {renderInlineMarkdown(item, `${key}-item-${itemIndex}`)}
          </li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "table") {
    return (
      <GuideResponsiveTable key={key}>
        <thead>
          <tr>
            {block.headers.map((header, headerIndex) => (
              <th key={`${key}-head-${headerIndex}`}>{renderInlineMarkdown(header, `${key}-head-${headerIndex}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>
                  {renderInlineMarkdown(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </GuideResponsiveTable>
    );
  }

  if (block.type === "grid") {
    return (
      <div key={key} className="my-7 grid gap-4 sm:grid-cols-2">
        {block.columns.map((column, columnIndex) => (
          <div key={`${key}-column-${columnIndex}`} className="min-w-0">
            {renderGuideBlocks(column, `${key}-column-${columnIndex}`)}
          </div>
        ))}
      </div>
    );
  }

  if (block.type === "callout") {
    return (
      <Callout key={key} title={block.title} variant={block.variant}>
        {renderGuideBlocks(block.children, `${key}-callout`, { compact: true })}
      </Callout>
    );
  }

  if (block.type === "ctaGroup") {
    return (
      <div key={key} className="mt-5 flex flex-wrap gap-3">
        {block.ctas.map((cta, ctaIndex) => (
          <GuideCta key={`${key}-cta-${ctaIndex}`} href={cta.href} variant={cta.variant}>
            {cta.label}
          </GuideCta>
        ))}
      </div>
    );
  }

  return (
    <pre key={key} className="my-6 overflow-x-auto rounded-md bg-[#202829] p-4 text-sm leading-7 text-[#f8f8f8]">
      <code data-language={block.language}>{block.code}</code>
    </pre>
  );
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)）]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(unescapeInlineMarkdown(text.slice(cursor, match.index)));
    }

    const token = match[0];
    const key = `${keyPrefix}-${nodes.length}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-[#eef1f1] px-1.5 py-0.5 text-[0.92em] text-[#202829]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-[#202829]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(renderInlineLink(key, link[2], link[1]));
      } else if (token.startsWith("http")) {
        nodes.push(renderInlineLink(key, token, token));
      }
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(unescapeInlineMarkdown(text.slice(cursor)));
  }

  return nodes;
}

function renderInlineLink(key: string, href: string, label: string): ReactNode {
  const externalProps = href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {};

  return (
    <a
      key={key}
      href={href}
      className="font-semibold text-[#2f7a4b] underline decoration-[#45bf78]/30 underline-offset-4 hover:text-[#202829]"
      {...externalProps}
    >
      {unescapeInlineMarkdown(label)}
    </a>
  );
}

function unescapeInlineMarkdown(value: string): string {
  return value.replace(/\\([#$])/g, "$1");
}

function parseTableBlock(lines: string[]): GuideBlock {
  const [headerLine, , ...rowLines] = lines;
  return {
    type: "table",
    headers: parseTableCells(headerLine),
    rows: rowLines.filter((line) => !isTableDelimiter(line)).map(parseTableCells),
  };
}

function parseTableCells(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdownImageLine(line: string): { alt: string; src: string } | null {
  const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (!match) return null;
  return {
    alt: match[1].trim(),
    src: match[2].trim(),
  };
}

function parseGuideCtaLine(line: string): { href: string; label: string; variant?: "primary" | "secondary" } | null {
  const match = line.trim().match(/^<GuideCta\s+([^>]*)>(.*)<\/GuideCta>$/);
  if (!match) return null;
  const attrs = parseMdxTagAttributes(match[1]);
  if (!attrs.href) return null;
  return {
    href: attrs.href,
    label: match[2].trim(),
    variant: attrs.variant === "secondary" ? "secondary" : "primary",
  };
}

function parseMdxTagAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of value.matchAll(/(\w+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function isSpecialBlockStart(line: string, nextLine: string): boolean {
  return (
    line.startsWith("<Callout") ||
    line.startsWith("<div") ||
    line.startsWith("<grid") ||
    line.startsWith("```") ||
    line.startsWith("#### ") ||
    line.startsWith("## ") ||
    line.startsWith("### ") ||
    line.startsWith(">") ||
    Boolean(parseMarkdownImageLine(line)) ||
    (isTableRow(line) && isTableDelimiter(nextLine)) ||
    isOrderedListItem(line) ||
    isUnorderedListItem(line)
  );
}

function isTableRow(line: string): boolean {
  return line.startsWith("|") && line.endsWith("|");
}

function isTableDelimiter(line: string): boolean {
  return /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|$/.test(line);
}

function isOrderedListItem(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

function isUnorderedListItem(line: string): boolean {
  return line.startsWith("- ");
}

function findClosingLine(lines: string[], startIndex: number, closingTag: string): number {
  const endIndex = lines.findIndex((line, index) => index >= startIndex && line.trim() === closingTag);
  if (endIndex < 0) {
    throw new Error(`Missing closing tag ${closingTag}.`);
  }
  return endIndex;
}

function findCodeFenceEnd(lines: string[], startIndex: number): number {
  const endIndex = lines.findIndex((line, index) => index >= startIndex && line.trim().startsWith("```"));
  if (endIndex < 0) {
    throw new Error("Missing closing code fence.");
  }
  return endIndex;
}
