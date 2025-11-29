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

type ExtractedParagraph = {
  text: string;
  anchors: string[]; // All anchor IDs associated with this paragraph position
};

type ExtractedChapterContent = {
  paragraphs: ExtractedParagraph[];
  heading?: string;
};

type TocEntry = {
  title: string;
  file: string; // Normalized file path
  anchor?: string; // The anchor part of href (e.g., "p6")
  order: number; // Original order in TOC
};

type ExtractOptions = {
  maxParagraphs?: number;
};

// ============================================================================
// PATH NORMALIZATION
// ============================================================================

/**
 * Normalize file paths for consistent matching.
 * Handles: ../Text/chapter.html -> Text/chapter.html
 *          ./chapter.html -> chapter.html
 *          OEBPS/Text/ch.html -> Text/ch.html (strips common prefixes)
 */
function normalizePath(href: string | undefined): string {
  if (!href) return "";
  return href
    .replace(/^\.\//, "") // Remove leading ./
    .replace(/^(\.\.\/)+/g, "") // Remove leading ../
    .replace(/^OEBPS\//i, "") // Remove OEBPS/ prefix
    .replace(/^OPS\//i, "") // Remove OPS/ prefix
    .replace(/\\/g, "/") // Normalize backslashes
    .toLowerCase(); // Case-insensitive matching
}

/**
 * Extract just the filename from a path for fallback matching.
 */
function getFilename(href: string | undefined): string {
  if (!href) return "";
  const normalized = normalizePath(href);
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

// ============================================================================
// ANCHOR DETECTION
// ============================================================================

/**
 * Collect all anchor IDs from an element and its children/parents.
 * Handles multiple EPUB patterns:
 * - <p id="chapter1">
 * - <p><a id="chapter1"></a>text</p>
 * - <p><a name="chapter1"></a>text</p> (legacy)
 * - <div id="chapter1"><p>text</p></div>
 * - <span epub:type="pagebreak" id="page1"/>
 */
function collectAnchors(
  $: CheerioAPI,
  element: Element,
  seenIds: Set<string>
): string[] {
  const el = $(element);
  const anchors: string[] = [];

  const addAnchor = (id: string | undefined) => {
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      anchors.push(id);
    }
  };

  // 1. Check the element itself
  addAnchor(el.attr("id"));

  // 2. Check all descendants with id or name attributes
  el.find("[id], [name]").each((_, child) => {
    addAnchor($(child).attr("id"));
    addAnchor($(child).attr("name")); // Legacy <a name="...">
  });

  // 3. Check immediate parent (anchor might be on wrapper div)
  const parent = el.parent();
  if (parent.length) {
    addAnchor(parent.attr("id"));
  }

  // 4. Check preceding siblings that are empty anchors
  // Pattern: <a id="ch1"></a><p>Chapter text</p>
  let prev = el.prev();
  while (prev.length && prev.text().trim() === "") {
    addAnchor(prev.attr("id"));
    addAnchor(prev.attr("name"));
    prev = prev.prev();
  }

  return anchors;
}

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

/**
 * Normalize text for deduplication and matching.
 * Removes diacritics, extra whitespace, and lowercases.
 */
function normalizeForDedup(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Check if paragraph text matches a TOC title.
 * Uses multiple matching strategies for robustness.
 */
function textMatchesTitle(paraText: string, tocTitle: string): boolean {
  const normalizedPara = normalizeForDedup(paraText);
  const normalizedTitle = normalizeForDedup(tocTitle);

  // Exact match
  if (normalizedPara === normalizedTitle) return true;

  // Paragraph starts with title
  if (normalizedPara.startsWith(normalizedTitle + " ")) return true;

  // Title with punctuation
  if (
    normalizedPara === normalizedTitle + "." ||
    normalizedPara === normalizedTitle + ","
  )
    return true;

  // Short paragraph contains title (chapter headings)
  if (
    normalizedPara.length < normalizedTitle.length + 15 &&
    normalizedPara.includes(normalizedTitle)
  ) {
    return true;
  }

  // Handle numbered chapters: "Chapter 1" matches "1. Chapter Title"
  const chapterNumMatch = normalizedTitle.match(/^(\d+)\.\s*(.+)$/);
  if (chapterNumMatch) {
    const [, num, rest] = chapterNumMatch;
    if (
      normalizedPara === num ||
      normalizedPara === `chapter ${num}` ||
      normalizedPara === `capitulo ${num}` ||
      normalizedPara === rest
    ) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// HEADING EXTRACTION
// ============================================================================

// Titles to ignore (common EPUB structural elements)
const IGNORED_HEADINGS = new Set([
  "document outline",
  "table of contents",
  "contents",
  "toc",
  "índice",
  "indice",
  "tabla de contenidos",
  "copyright",
  "title page",
  "cover",
  "portada",
]);

function extractHeadingFromChapter($: CheerioAPI): string | null {
  const headingSelectors = "h1, h2, h3, h4, header h1, header h2, .chapter-title, .title";

  const candidate = $(headingSelectors)
    .map((_: number, el: Element) => $(el).text())
    .get()
    .map((text: string) => text.replace(/\s+/g, " ").trim())
    .find((text: string) => {
      if (text.length === 0) return false;
      const normalized = text.toLowerCase();
      return !IGNORED_HEADINGS.has(normalized);
    });

  return candidate && candidate.length > 0 ? candidate : null;
}

// ============================================================================
// PARAGRAPH EXTRACTION
// ============================================================================

function extractParagraphsFromChapter(html: string): ExtractedChapterContent {
  const $ = load(html, {
    decodeEntities: true,
    xmlMode: false,
  });

  const headingText = extractHeadingFromChapter($);
  const cleaned: ExtractedParagraph[] = [];
  const seenIds = new Set<string>();

  // Process content elements
  $("p, div, li, h1, h2, h3, h4, h5, h6").each((_, element) => {
    const el = $(element);
    const text = el.text();
    const normalized = text.replace(/\s+/g, " ").trim();

    if (normalized.length < 2) return;

    // Skip if this is a nested element (avoid duplicates)
    if (el.find("p, div, li").length > 0 && el.is("div")) {
      return;
    }

    const anchors = collectAnchors($, element, seenIds);
    cleaned.push({ text: normalized, anchors });
  });

  // Fallback: if no paragraphs found, get root text
  if (cleaned.length === 0) {
    const rootText = $.root().text().replace(/\s+/g, " ").trim();
    if (rootText.length >= 2) {
      cleaned.push({ text: rootText, anchors: [] });
    }
  }

  return { paragraphs: cleaned, heading: headingText ?? undefined };
}

// ============================================================================
// MAIN EXTRACTION LOGIC
// ============================================================================

export async function streamParagraphsFromEpub(
  rawData: ArrayBuffer,
  handler: (paragraph: ParsedParagraph) => Promise<void> | void,
  options?: ExtractOptions
): Promise<{ paragraphCount: number; chapters: ParsedChapter[] }> {
  const buffer = Buffer.from(rawData);
  const epub = await EPub.createAsync(buffer as unknown as string);

  const chapters: ParsedChapter[] = [];
  const maxParagraphs = options?.maxParagraphs;
  const seenChapterTitles = new Set<string>();
  let count = 0;

  // -------------------------------------------------------------------------
  // STEP 1: Build TOC lookup structures
  // -------------------------------------------------------------------------

  const tocEntries: TocEntry[] = [];
  const tocIdMap = new Map<string, string>(); // TOC entry ID -> title
  const tocAnchorMap = new Map<string, Map<string, string>>(); // file -> anchor -> title
  const tocFileMap = new Map<string, string>(); // file (no anchor) -> title (for files without anchors)

  for (let i = 0; i < (epub.toc ?? []).length; i++) {
    const tocEntry = epub.toc![i];
    if (!tocEntry?.title) continue;

    const trimmedTitle = String(tocEntry.title).replace(/\s+/g, " ").trim();
    if (trimmedTitle.length === 0) continue;

    // Store by ID
    if (tocEntry.id) {
      tocIdMap.set(tocEntry.id, trimmedTitle);
    }

    // Parse and normalize href
    if (tocEntry.href) {
      const [rawFile, anchor] = tocEntry.href.split("#");
      const normalizedFile = normalizePath(rawFile);
      const filename = getFilename(rawFile);

      tocEntries.push({
        title: trimmedTitle,
        file: normalizedFile,
        anchor,
        order: i,
      });

      // Build anchor map
      if (anchor) {
        // Add to both normalized path and filename for flexible matching
        for (const key of [normalizedFile, filename]) {
          if (!tocAnchorMap.has(key)) {
            tocAnchorMap.set(key, new Map());
          }
          tocAnchorMap.get(key)!.set(anchor, trimmedTitle);
        }
      } else {
        // No anchor - this file IS the chapter
        tocFileMap.set(normalizedFile, trimmedTitle);
        tocFileMap.set(filename, trimmedTitle);
      }
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: Process flow entries (actual content files)
  // -------------------------------------------------------------------------

  const collectedParagraphs: ParsedParagraph[] = [];

  for (const entry of epub.flow ?? []) {
    if (!entry?.id) continue;

    let chapterHtml: string | undefined;
    try {
      chapterHtml = await epub.getChapterAsync(entry.id);
    } catch {
      continue;
    }

    if (!chapterHtml) continue;

    const chapterContent = extractParagraphsFromChapter(chapterHtml);
    if (chapterContent.paragraphs.length === 0) continue;

    // Get normalized file paths for this entry
    const normalizedEntryFile = normalizePath(entry.href);
    const entryFilename = getFilename(entry.href);

    // Get anchor maps for this file (try multiple path formats)
    const fileAnchorMap =
      tocAnchorMap.get(normalizedEntryFile) ||
      tocAnchorMap.get(entryFilename) ||
      new Map<string, string>();

    // Track chapters found in this file
    const fileChapters: { paragraphId: number; title: string }[] = [];
    const startParagraphIdForFile = count + 1;

    // Process paragraphs
    for (const para of chapterContent.paragraphs) {
      count += 1;
      const paragraph = { id: count, text: para.text };

      // Check if any anchor matches TOC
      for (const anchor of para.anchors) {
        const tocTitle = fileAnchorMap.get(anchor);
        if (tocTitle) {
          const normalizedKey = normalizeForDedup(tocTitle);
          if (!seenChapterTitles.has(normalizedKey)) {
            seenChapterTitles.add(normalizedKey);
            fileChapters.push({ paragraphId: count, title: tocTitle });
          }
        }
      }

      collectedParagraphs.push(paragraph);
      await handler(paragraph);

      if (maxParagraphs !== undefined && count >= maxParagraphs) {
        for (const ch of fileChapters) {
          chapters.push({
            index: chapters.length,
            title: ch.title,
            startParagraphId: ch.paragraphId,
          });
        }
        return { paragraphCount: count, chapters };
      }
    }

    // Add chapters found via anchors
    for (const ch of fileChapters) {
      chapters.push({
        index: chapters.length,
        title: ch.title,
        startParagraphId: ch.paragraphId,
      });
    }

    // If no anchor-based chapters, try other methods
    if (fileChapters.length === 0) {
      // Method A: TOC entry ID matches flow entry ID
      let chapterTitle = tocIdMap.get(entry.id);

      // Method B: File path matches TOC entry (no anchor)
      if (!chapterTitle) {
        chapterTitle =
          tocFileMap.get(normalizedEntryFile) ||
          tocFileMap.get(entryFilename);
      }

      // Method C: Use HTML heading as fallback
      if (!chapterTitle) {
        chapterTitle = chapterContent.heading ?? null;
      }

      if (chapterTitle) {
        const normalizedKey = normalizeForDedup(chapterTitle);
        if (!seenChapterTitles.has(normalizedKey)) {
          seenChapterTitles.add(normalizedKey);
          chapters.push({
            index: chapters.length,
            title: chapterTitle,
            startParagraphId: startParagraphIdForFile,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // STEP 3: Fallback - Text matching if not enough chapters found
  // -------------------------------------------------------------------------

  const expectedChapters = tocEntries.length;
  const foundEnough = chapters.length >= expectedChapters / 2 || expectedChapters <= 2;

  if (!foundEnough && collectedParagraphs.length > 0) {
    // Reset and try text matching
    chapters.length = 0;
    seenChapterTitles.clear();

    for (const tocEntry of tocEntries) {
      const normalizedTocTitle = normalizeForDedup(tocEntry.title);

      for (const para of collectedParagraphs) {
        if (textMatchesTitle(para.text, tocEntry.title)) {
          if (!seenChapterTitles.has(normalizedTocTitle)) {
            seenChapterTitles.add(normalizedTocTitle);
            chapters.push({
              index: chapters.length,
              title: tocEntry.title,
              startParagraphId: para.id,
            });
          }
          break;
        }
      }
    }

    // Sort by paragraph position
    chapters.sort((a, b) => a.startParagraphId - b.startParagraphId);
  }

  // -------------------------------------------------------------------------
  // STEP 4: Final fallback - create default chapter
  // -------------------------------------------------------------------------

  if (chapters.length === 0 && count > 0) {
    chapters.push({
      index: 0,
      title: "Full book",
      startParagraphId: 1,
    });
  }

  // Re-index chapters
  chapters.forEach((ch, i) => {
    ch.index = i;
  });

  return { paragraphCount: count, chapters };
}

export async function extractParagraphsFromEpub(
  rawData: ArrayBuffer,
  options?: ExtractOptions
): Promise<{ paragraphs: ParsedParagraph[]; chapters: ParsedChapter[] }> {
  const paragraphs: ParsedParagraph[] = [];
  const { chapters } = await streamParagraphsFromEpub(
    rawData,
    async (paragraph) => {
      paragraphs.push(paragraph);
    },
    options
  );
  return { paragraphs, chapters };
}
