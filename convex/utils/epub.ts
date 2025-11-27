"use node";

import { load, type CheerioAPI, type Element } from "cheerio";
import { EPub } from "epub2";
import { Buffer } from "node:buffer";

export type ParsedParagraph = {
  id: number;
  text: string;
};

export type ParsedChapter = {
  index: number;
  title: string;
  startParagraphId: number;
};

type ExtractedChapterContent = {
  paragraphs: string[];
  heading?: string;
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
): Promise<{ paragraphCount: number; chapters: ParsedChapter[] }> {
  const buffer = Buffer.from(rawData);
  // epub2 typings expect a path but the runtime also accepts a Buffer.
  const epub = await EPub.createAsync(buffer as unknown as string);

  const chapters: ParsedChapter[] = [];
  const maxParagraphs = options?.maxParagraphs;
  const seenChapterTitles = new Set<string>();
  let count = 0;

  // Build a map from flow entry IDs to TOC titles.
  // The TOC (NCX) is what e-readers display - it only includes actual chapters,
  // not title pages, copyright pages, etc.
  const tocMap = new Map<string, string>();
  for (const tocEntry of epub.toc ?? []) {
    if (tocEntry?.id && tocEntry?.title) {
      const trimmedTitle = String(tocEntry.title).replace(/\s+/g, " ").trim();
      if (trimmedTitle.length > 0) {
        tocMap.set(tocEntry.id, trimmedTitle);
      }
    }
  }

  for (const entry of epub.flow ?? []) {
    if (!entry?.id) {
      continue;
    }

    let chapterHtml: string | undefined;
    try {
      chapterHtml = await epub.getChapterAsync(entry.id);
    } catch (error) {
      console.warn("Failed to read chapter from EPUB flow entry:", error);
      continue;
    }

    if (!chapterHtml) {
      continue;
    }

    const chapterContent = extractParagraphsFromChapter(chapterHtml);
    const chapterParagraphs = chapterContent.paragraphs;
    if (chapterParagraphs.length === 0) {
      continue;
    }

    const startParagraphId = count + 1;

    // Prefer TOC title (what e-readers show), then HTML heading, then entry.title
    const tocTitle = tocMap.get(entry.id);
    const chapterTitle = tocTitle ?? chapterContent.heading ?? null;

    // Only create a chapter entry if we have a real title from TOC or heading.
    // This filters out title pages, copyright pages, etc. that don't belong
    // in the chapter list but still includes their content.
    if (chapterTitle) {
      const normalizedKey = normalizeForDedup(chapterTitle);
      if (!seenChapterTitles.has(normalizedKey)) {
        seenChapterTitles.add(normalizedKey);
        chapters.push({
          index: chapters.length,
          title: chapterTitle,
          startParagraphId,
        });
      }
    }

    // Always process paragraphs, even if not creating a chapter entry
    for (const text of chapterParagraphs) {
      count += 1;
      await handler({
        id: count,
        text,
      });
      if (maxParagraphs !== undefined && count >= maxParagraphs) {
        return { paragraphCount: count, chapters };
      }
    }
  }

  if (chapters.length === 0 && count > 0) {
    chapters.push({
      index: 0,
      title: "Full book",
      startParagraphId: 1,
    });
  }

  return { paragraphCount: count, chapters };
}

export async function extractParagraphsFromEpub(
  rawData: ArrayBuffer,
  options?: ExtractOptions,
): Promise<{ paragraphs: ParsedParagraph[]; chapters: ParsedChapter[] }> {
  const paragraphs: ParsedParagraph[] = [];
  const { chapters } = await streamParagraphsFromEpub(
    rawData,
    async (paragraph) => {
      paragraphs.push(paragraph);
    },
    options,
  );
  return { paragraphs, chapters };
}

function extractParagraphsFromChapter(html: string): ExtractedChapterContent {
  const $ = load(html, {
    decodeEntities: true,
    xmlMode: false,
  });

  const headingText = extractHeadingFromChapter($);

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

  return { paragraphs: cleaned, heading: headingText ?? undefined };
}

function extractHeadingFromChapter($: CheerioAPI): string | null {
  const headingSelectors = "h1, h2, h3, h4, header h1, header h2";
  const candidate = $(headingSelectors)
    .map((_: number, el: Element) => $(el).text())
    .get()
    .map((text: string) => text.replace(/\s+/g, " ").trim())
    .find((text: string) => text.length > 0);
  return candidate && candidate.length > 0 ? candidate : null;
}

function normalizeForDedup(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
