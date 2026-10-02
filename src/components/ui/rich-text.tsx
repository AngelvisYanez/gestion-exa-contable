"use client";

import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "a",
  "blockquote",
  "code",
  "pre",
];

export function sanitizeRichHtml(html?: string | null) {
  if (!html) return "";
  if (typeof window === "undefined") {
    // SSR: strip scripts crudamente
    return String(html)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/on\w+=["'][^"']*["']/gi, "");
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
  });
}

/** Texto plano para previews / busqueda visual en cards. */
export function plainTextFromHtml(html?: string | null) {
  if (!html) return "";
  const withBreaks = String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
  const text = withBreaks
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text;
}

export function isProbablyHtml(value?: string | null) {
  return !!value && /<\/?[a-z][\s\S]*>/i.test(value);
}

type Props = {
  html?: string | null;
  className?: string;
  empty?: string;
};

export function RichTextHtml({ html, className, empty = "Sin descripcion." }: Props) {
  const clean = sanitizeRichHtml(html);
  if (!clean || plainTextFromHtml(clean) === "") {
    return <span className="text-muted-foreground">{empty}</span>;
  }
  return (
    <div
      className={cn(
        "rich-html prose prose-sm max-w-none text-sm leading-relaxed",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_a]:font-semibold [&_a]:text-sky-700 [&_a]:underline",
        "[&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-bold",
        "[&_p]:mb-2 [&_p:last-child]:mb-0",
        className
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
