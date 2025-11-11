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

export async function streamParagraphsFromEpub(
  rawData: ArrayBuffer,
  handler: (paragraph: ParsedParagraph) => Promise<void> | void,
  options?: ExtractOptions,
): Promise<number> {
  const buffer = Buffer.from(rawData);
  // epub2 typings expect a path but the runtime also accepts a Buffer.
  const epub = await EPub.createAsync(buffer as unknown as string);

  const maxParagraphs = options?.maxParagraphs;
  let count = 0;

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
      count += 1;
      await handler({
        id: count,
        text,
      });
      if (maxParagraphs !== undefined && count >= maxParagraphs) {
        return count;
      }
    }
  }

  return count;
}

export async function extractParagraphsFromEpub(
  rawData: ArrayBuffer,
  options?: ExtractOptions,
): Promise<ParsedParagraph[]> {
  const paragraphs: ParsedParagraph[] = [];
  await streamParagraphsFromEpub(
    rawData,
    async (paragraph) => {
      paragraphs.push(paragraph);
    },
    options,
  );
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
