import type { Metadata } from "next";
import { z } from "zod";
import { mdxGuideSources } from "@/lib/generated-mdx-guides";

const frontmatterSchema = z.object({
  title: z.string(),
  description: z.string(),
  eyebrow: z.string().optional(),
  categoryId: z.enum(["basics", "official", "payment", "channels"]),
  tags: z.array(z.string()).default([]),
  intent: z.string().optional(),
  canonical: z.string(),
  primaryCta: z
    .object({
      href: z.string(),
      label: z.string(),
    })
    .optional(),
  secondaryCta: z
    .object({
      href: z.string(),
      label: z.string(),
    })
    .optional(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
});

export type MdxGuideFrontmatter = z.infer<typeof frontmatterSchema>;

export type MdxGuideDocument = {
  frontmatter: MdxGuideFrontmatter;
  body: string;
};

export async function readMdxGuide(slug: string) {
  const source = mdxGuideSources[slug as keyof typeof mdxGuideSources];
  if (!source) {
    throw new Error(`Unknown MDX guide slug: ${slug}`);
  }
  return source;
}

export async function readParsedMdxGuide(slug: string): Promise<MdxGuideDocument> {
  return parseMdxGuideSource(await readMdxGuide(slug));
}

export function parseMdxGuideSource(source: string): MdxGuideDocument {
  const { frontmatterText, body } = splitMdxGuideSource(source);
  return {
    frontmatter: parseMdxGuideFrontmatter(parseFrontmatterText(frontmatterText)),
    body,
  };
}

export function parseMdxGuideFrontmatter(frontmatter: unknown) {
  return frontmatterSchema.parse(frontmatter);
}

export async function buildMdxGuideMetadata(slug: string): Promise<Metadata> {
  const { frontmatter } = await readParsedMdxGuide(slug);

  return {
    title: frontmatter.title,
    description: frontmatter.description,
    alternates: {
      canonical: frontmatter.canonical,
    },
    openGraph: {
      title: `${frontmatter.title} | PriceAI`,
      description: frontmatter.description,
      url: `https://priceai.cc${frontmatter.canonical}`,
    },
  };
}

function splitMdxGuideSource(source: string): { frontmatterText: string; body: string } {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("MDX guide source must start with frontmatter.");
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex < 0) {
    throw new Error("MDX guide source is missing closing frontmatter marker.");
  }

  return {
    frontmatterText: normalized.slice(4, endIndex),
    body: normalized.slice(endIndex + "\n---\n".length).trim(),
  };
}

function parseFrontmatterText(frontmatterText: string): unknown {
  const output: {
    title?: string;
    description?: string;
    eyebrow?: string;
    categoryId?: string;
    tags: string[];
    intent?: string;
    canonical?: string;
    primaryCta?: { href?: string; label?: string };
    secondaryCta?: { href?: string; label?: string };
    faq: Array<{ question?: string; answer?: string }>;
  } = {
    tags: [],
    faq: [],
  };
  let section: "tags" | "primaryCta" | "secondaryCta" | "faq" | null = null;

  for (const rawLine of frontmatterText.split("\n")) {
    if (!rawLine.trim()) continue;

    if (!rawLine.startsWith(" ")) {
      const { key, value } = parseFrontmatterKeyValue(rawLine);
      section = null;

      if (key === "tags") {
        section = "tags";
      } else if (key === "primaryCta" || key === "secondaryCta") {
        section = key;
        output[key] = {};
      } else if (key === "faq") {
        section = "faq";
      } else if (value !== null) {
        output[key as keyof typeof output] = parseScalar(value) as never;
      }
      continue;
    }

    const line = rawLine.trim();
    if (section === "tags" && line.startsWith("- ")) {
      output.tags.push(parseScalar(line.slice(2)));
      continue;
    }

    if ((section === "primaryCta" || section === "secondaryCta") && line.includes(":")) {
      const { key, value } = parseFrontmatterKeyValue(line);
      if (value !== null && (key === "href" || key === "label")) {
        output[section] = {
          ...output[section],
          [key]: parseScalar(value),
        };
      }
      continue;
    }

    if (section === "faq") {
      if (line.startsWith("- question:")) {
        output.faq.push({ question: parseScalar(line.slice("- question:".length).trim()) });
      } else if (line.startsWith("answer:")) {
        const current = output.faq[output.faq.length - 1];
        if (current) current.answer = parseScalar(line.slice("answer:".length).trim());
      }
    }
  }

  return output;
}

function parseFrontmatterKeyValue(line: string): { key: string; value: string | null } {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) return { key: line.trim(), value: null };

  const key = line.slice(0, colonIndex).trim();
  const value = line.slice(colonIndex + 1).trim();
  return { key, value: value ? value : null };
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function buildMdxGuideJsonLd(frontmatter: MdxGuideFrontmatter) {
  const pageUrl = `https://priceai.cc${frontmatter.canonical}`;
  const items: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: frontmatter.title,
      inLanguage: "zh-CN",
      url: pageUrl,
      description: frontmatter.description,
      author: {
        "@type": "Organization",
        name: "PriceAI",
      },
      publisher: {
        "@type": "Organization",
        name: "PriceAI",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "PriceAI", item: "https://priceai.cc" },
        { "@type": "ListItem", position: 2, name: "指南", item: pageUrl },
      ],
    },
  ];

  if (frontmatter.faq.length) {
    items.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: frontmatter.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return items;
}
