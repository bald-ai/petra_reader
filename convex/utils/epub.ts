"use node";

import { load } from "cheerio";
import { EPub } from "epub2";
import { Buffer } from "node:buffer";

export type ParsedParagraph = {
  id: number;
  text: string;
};

type ExtractOptions = {
  /**
   * Hard stop for how many paragraphs we extract per request.
   * Keeps payload sizes predictable for large books.
   */
  maxParagraphs?: number;
};

export async function extractParagraphsFromEpub(
  rawData: ArrayBuffer,
  options?: ExtractOptions,
): Promise<ParsedParagraph[]> {
  const buffer = Buffer.from(rawData);
  // epub2 typings expect a path but the runtime also accepts a Buffer.
  const epub = await EPub.createAsync(buffer as unknown as string);

  const maxParagraphs = options?.maxParagraphs;
  const paragraphs: ParsedParagraph[] = [];

  for (const entry of epub.flow ?? []) {
    if (!entry?.id) {
      continue;
    }

    const chapterHtml = await epub.getChapterAsync(entry.id);
    if (!chapterHtml) {
      continue;
    }

    const chapterParagraphs = extractParagraphsFromChapter(chapterHtml);
    for (const text of chapterParagraphs) {
      paragraphs.push({
        id: paragraphs.length + 1,
        text,
      });
      if (maxParagraphs !== undefined && paragraphs.length >= maxParagraphs) {
        return paragraphs;
      }
    }
  }

  return paragraphs;
}

function extractParagraphsFromChapter(html: string): string[] {
  const $ = load(html, {
    decodeEntities: true,
    xmlMode: false,
  });

  const cleaned: string[] = [];
  const collectText = (content: string) => {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length >= 2) {
      cleaned.push(normalized);
    }
  };

  $("p, div, li").each((_, element) => {
    collectText($(element).text());
  });

  if (cleaned.length === 0) {
    collectText($.root().text());
  }

  return cleaned;
}
