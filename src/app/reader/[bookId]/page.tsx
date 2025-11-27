"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import LanguageReader, { ChapterInfo, Paragraph } from "@/components/language-reader";
import { useOnline } from "@/hooks/use-online";

type ChunkRecord = {
  chunkIndex: number;
  paragraphs: Array<{
    id: number;
    text: string;
  }>;
};

const CHUNK_BATCH_SIZE = 4;
const CHUNK_SIZE = 50;
const CHUNK_WINDOW_PADDING = 2;

function buildParagraphsFromChunks(chunks: ChunkRecord[]): Paragraph[] {
  if (chunks.length === 0) {
    return [];
  }

  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const collected: Paragraph[] = [];

  for (const chunk of ordered) {
    for (const paragraph of chunk.paragraphs) {
      collected.push({
        id: paragraph.id,
        spanish: paragraph.text ?? "",
        english: "",
      });
    }
  }

  return collected;
}

export default function ReaderPage() {
  const router = useRouter();
  const routeParams = useParams<{ bookId: string }>();
  const bookId = routeParams?.bookId as Id<"books"> | undefined;
  const book = useQuery(api.books.get, bookId ? { bookId } : "skip");
  const processingStatus = useQuery(
    api.books.getProcessingStatus,
    bookId ? { bookId } : "skip",
  );
  const touchOpen = useMutation(api.books.touchOpen);
  const saveReadingPosition = useMutation(api.books.saveReadingPosition);
  const hasTouchedRef = useRef(false);
  const previousBookIdRef = useRef<Id<"books"> | undefined>(bookId);
  const initialScrollSetRef = useRef<Id<"books"> | null>(null);
  const savePositionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const online = useOnline();
  const pendingProgressKey = bookId ? `petra:pendingProgress:${bookId}` : null;

  const status = processingStatus?.processingStatus ?? null;
  const totalChunks = processingStatus?.totalChunks ?? 0;

  const [chunkRequestRange, setChunkRequestRange] = useState<{ from: number; to: number } | null>(null);
  const [chunkMap, setChunkMap] = useState<Map<number, Paragraph[]>>(() => new Map());
  const [highestLoadedChunkIndex, setHighestLoadedChunkIndex] = useState(-1);
  const highestLoadedChunkIndexRef = useRef(-1);
  const chunkMetadataRef = useRef<Map<number, { start: number; length: number }>>(new Map());
  const activeChunkIndexesRef = useRef<Set<number>>(new Set());
  const pendingChunkRequestRef = useRef<Set<number>>(new Set());
  const chunkRequestInFlightRef = useRef(false);
  const lastRequestedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const visibleRangeRef = useRef<{ startIndex: number; endIndex: number } | null>(null);
  const desiredChunkWindowRef = useRef<{ startChunk: number; endChunk: number } | null>(null);
  const translationsWarmedUpRef = useRef(false);
  const warmupTranslateWord = useAction(api.translations.translateWord);
  const warmupLookupDefinition = useAction(api.translations.lookupWordDefinition);
  const [scrollTargetParagraphId, setScrollTargetParagraphId] = useState<number | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);

  // Derive flattened paragraphs array from chunkMap - O(active chunks) not O(total paragraphs)
  const paragraphs = useMemo(() => {
    if (totalChunks <= 0) return [];

    // Find the range of loaded chunks to minimize array size
    let maxChunk = -1;
    for (const chunkIndex of chunkMap.keys()) {
      maxChunk = Math.max(maxChunk, chunkIndex);
    }

    const targetChunk =
      totalChunks > 0 && scrollTargetParagraphId !== null && scrollTargetParagraphId !== undefined
        ? Math.max(
            0,
            Math.min(Math.floor((scrollTargetParagraphId - 1) / CHUNK_SIZE), totalChunks - 1),
          )
        : -1;

    const maxChunkIndex = Math.max(maxChunk, targetChunk);
    if (maxChunkIndex < 0) return [];

    // Calculate the total size needed (covers loaded chunks plus any pending scroll target)
    const lastChunkLength =
      chunkMap.get(totalChunks - 1)?.length ??
      chunkMetadataRef.current.get(totalChunks - 1)?.length ??
      CHUNK_SIZE;
    const maxParagraphs = (totalChunks - 1) * CHUNK_SIZE + Math.max(lastChunkLength, 0);
    const totalSize = Math.min((maxChunkIndex + 1) * CHUNK_SIZE, maxParagraphs);
    const result: Paragraph[] = new Array(totalSize);

    // Fill with placeholders
    for (let i = 0; i < totalSize; i++) {
      result[i] = {
        id: -(i + 1),
        spanish: "",
        english: "",
        isPlaceholder: true,
      };
    }

    // Overlay active chunks
    for (const [chunkIndex, paras] of chunkMap) {
      const start = chunkIndex * CHUNK_SIZE;
      for (let i = 0; i < paras.length; i++) {
        if (start + i < totalSize) {
          result[start + i] = paras[i];
        }
      }
    }

    return result;
  }, [chunkMap, totalChunks, scrollTargetParagraphId]);

  const chunkRequestArgs =
    bookId && chunkRequestRange
      ? {
          bookId,
          fromChunk: chunkRequestRange.from,
          toChunk: chunkRequestRange.to,
        }
      : "skip";

  const chunkBatch = useQuery(api.books.getChunks, chunkRequestArgs);

  const isRequestingChunks = chunkRequestRange !== null;
  const chapters: ChapterInfo[] = useMemo(() => {
    if (book && book !== null && Array.isArray(book.chapters) && book.chapters.length > 0) {
      const sorted = [...book.chapters].sort((a, b) => a.startParagraphId - b.startParagraphId);
      const seenTitles = new Set<string>();
      return sorted.filter((chapter) => {
        const norm = chapter.title
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (seenTitles.has(norm)) {
          return false;
        }
        seenTitles.add(norm);
        return true;
      });
    }
    if (book && book !== null) {
      return [
        {
          index: 0,
          title: book.title || "Full book",
          startParagraphId: 1,
        },
      ];
    }
    return [];
  }, [book]);

  const paragraphsWithHeadings = useMemo(() => {
    if (paragraphs.length === 0 || chapters.length === 0) {
      return paragraphs;
    }
    const headingMap = new Map<number, ChapterInfo>();
    for (const chapter of chapters) {
      const insertIndex = chapter.startParagraphId - 1;
      if (insertIndex >= 0 && insertIndex <= paragraphs.length - 1) {
        headingMap.set(insertIndex, chapter);
      }
    }
    if (headingMap.size === 0) {
      return paragraphs;
    }
    const result: Paragraph[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const heading = headingMap.get(i);
      if (heading) {
        result.push({
          id: -100000 - heading.index,
          spanish: heading.title,
          english: "",
          isHeading: true,
        });
      }
      result.push(paragraphs[i]);
    }
    return result;
  }, [paragraphs, chapters]);

  useEffect(() => {
    if (translationsWarmedUpRef.current || !online) {
      return;
    }
    translationsWarmedUpRef.current = true;
    const warmUpApis = async () => {
      try {
        const results = await Promise.allSettled([
          warmupTranslateWord({ word: "hola" }),
          warmupLookupDefinition({ word: "hola" }),
        ]);
        
        console.log("🔥 [WARM-UP] Translation API warm-up results:");
        if (results[0].status === "fulfilled") {
          console.log("  ✅ translateWord('hola'):", results[0].value);
        } else {
          console.log("  ❌ translateWord('hola') failed:", results[0].reason);
        }
        
        if (results[1].status === "fulfilled") {
          console.log("  ✅ lookupWordDefinition('hola'):", results[1].value);
        } else {
          console.log("  ❌ lookupWordDefinition('hola') failed:", results[1].reason);
        }
      } catch (error) {
        console.warn("🔥 [WARM-UP] Warm-up requests failed", error);
      }
    };
    void warmUpApis();
  }, [online, warmupLookupDefinition, warmupTranslateWord]);

  const queueReadingPosition = useCallback(
    (paragraphId: number) => {
      if (!pendingProgressKey || typeof window === "undefined") {
        return;
      }
      try {
        localStorage.setItem(
          pendingProgressKey,
          JSON.stringify({ paragraphId, ts: Date.now() }),
        );
      } catch (error) {
        console.error("Failed to queue reading position", error);
      }
    },
    [pendingProgressKey],
  );

  const persistReadingPosition = useCallback(
    async (paragraphId: number) => {
      if (!bookId) {
        return;
      }
      if (!online) {
        queueReadingPosition(paragraphId);
        return;
      }
      try {
        await saveReadingPosition({ bookId, paragraphId });
        if (typeof window !== "undefined" && pendingProgressKey) {
          try {
            localStorage.removeItem(pendingProgressKey);
          } catch (error) {
            console.error("Failed to clear queued reading position", error);
          }
        }
      } catch (error) {
        console.error("Failed to save reading position", error);
        queueReadingPosition(paragraphId);
      }
    },
    [bookId, online, pendingProgressKey, queueReadingPosition, saveReadingPosition],
  );

  const flushQueuedProgress = useCallback(async () => {
    if (!bookId || !pendingProgressKey || typeof window === "undefined" || !online) {
      return;
    }
    const raw = localStorage.getItem(pendingProgressKey);
    if (!raw) {
      return;
    }
    try {
      const payload = JSON.parse(raw) as { paragraphId?: number };
      if (typeof payload?.paragraphId !== "number") {
        try {
          localStorage.removeItem(pendingProgressKey);
        } catch (removeError) {
          console.error("Failed to clear invalid queued reading position", removeError);
        }
        return;
      }
      await saveReadingPosition({ bookId, paragraphId: payload.paragraphId });
      try {
        localStorage.removeItem(pendingProgressKey);
      } catch (removeError) {
        console.error("Failed to clear queued reading position", removeError);
      }
    } catch (error) {
      console.error("Failed to flush reading position", error);
    }
  }, [bookId, online, pendingProgressKey, saveReadingPosition]);

  const scheduleChunkFetch = useCallback(
    (from: number, to: number) => {
      if (!bookId || status !== "completed" || !totalChunks || totalChunks <= 0) {
        return false;
      }
      if (chunkRequestInFlightRef.current) {
        return false;
      }
      const clampedFrom = Math.max(0, Math.min(from, totalChunks - 1));
      const clampedTo = Math.max(clampedFrom, Math.min(to, totalChunks - 1));
      if (clampedFrom > clampedTo) {
        return false;
      }
      chunkRequestInFlightRef.current = true;
      setChunkRequestRange({ from: clampedFrom, to: clampedTo });
      lastRequestedRangeRef.current = { from: clampedFrom, to: clampedTo };
      for (let index = clampedFrom; index <= clampedTo; index++) {
        pendingChunkRequestRef.current.add(index);
      }
      return true;
    },
    [bookId, status, totalChunks],
  );

  const pruneChunksOutsideWindow = useCallback((windowRange: { startChunk: number; endChunk: number }) => {
    const activeChunks = activeChunkIndexesRef.current;
    if (activeChunks.size === 0) {
      return;
    }
    const toPrune: number[] = [];
    activeChunks.forEach((chunkIndex) => {
      if (chunkIndex < windowRange.startChunk || chunkIndex > windowRange.endChunk) {
        toPrune.push(chunkIndex);
      }
    });
    if (toPrune.length === 0) {
      return;
    }
    // O(k) where k = chunks to prune, not O(n) where n = total paragraphs
    setChunkMap((prev) => {
      const next = new Map(prev);
      for (const chunkIndex of toPrune) {
        next.delete(chunkIndex);
        chunkMetadataRef.current.delete(chunkIndex);
        activeChunks.delete(chunkIndex);
      }
      return next;
    });
  }, []);

  const ensureChunksForWindow = useCallback(
    (windowRange: { startChunk: number; endChunk: number }) => {
      if (!bookId || status !== "completed") {
        return;
      }
      if (windowRange.startChunk > windowRange.endChunk) {
        return;
      }
      const missing: number[] = [];
      for (let index = windowRange.startChunk; index <= windowRange.endChunk; index++) {
        if (activeChunkIndexesRef.current.has(index)) {
          continue;
        }
        if (pendingChunkRequestRef.current.has(index)) {
          continue;
        }
        missing.push(index);
      }
      if (missing.length === 0) {
        return;
      }
      let rangeStart = missing[0];
      let previous = missing[0];
      for (let i = 1; i < missing.length; i++) {
        const current = missing[i];
        if (current === previous + 1) {
          previous = current;
          continue;
        }
        if (scheduleChunkFetch(rangeStart, Math.min(previous, rangeStart + CHUNK_BATCH_SIZE - 1))) {
          return;
        }
        rangeStart = current;
        previous = current;
      }
      scheduleChunkFetch(rangeStart, Math.min(previous, rangeStart + CHUNK_BATCH_SIZE - 1));
    },
    [bookId, status, scheduleChunkFetch],
  );

  const findChapterIndexForParagraph = useCallback(
    (paragraphId: number | null) => {
      if (!paragraphId || chapters.length === 0) {
        return 0;
      }
      let candidate = 0;
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        if (paragraphId >= chapter.startParagraphId) {
          candidate = i;
        } else {
          break;
        }
      }
      return candidate;
    },
    [chapters],
  );

  const handleVisibleRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      if (!totalChunks || totalChunks <= 0) {
        return;
      }
      visibleRangeRef.current = range;
      const startChunk = Math.max(0, Math.floor(range.startIndex / CHUNK_SIZE) - CHUNK_WINDOW_PADDING);
      const endChunk = Math.min(
        totalChunks - 1,
        Math.floor(range.endIndex / CHUNK_SIZE) + CHUNK_WINDOW_PADDING,
      );
      const windowRange = { startChunk, endChunk };
      desiredChunkWindowRef.current = windowRange;
      pruneChunksOutsideWindow(windowRange);
      ensureChunksForWindow(windowRange);

      // Debounced save reading position
      if (bookId && paragraphsWithHeadings.length > 0 && range.startIndex >= 0) {
        const firstVisibleParagraph = paragraphsWithHeadings[range.startIndex];
        if (
          firstVisibleParagraph &&
          !firstVisibleParagraph.isPlaceholder &&
          !firstVisibleParagraph.isHeading &&
          firstVisibleParagraph.id > 0
        ) {
          if (savePositionTimeoutRef.current) {
            clearTimeout(savePositionTimeoutRef.current);
          }
          savePositionTimeoutRef.current = setTimeout(() => {
            void persistReadingPosition(firstVisibleParagraph.id);
          }, 1000);
        }
      }

      // Update active chapter indicator based on the first fully loaded visible paragraph
      let visibleParagraphId: number | null = null;
      for (let i = range.startIndex; i <= range.endIndex && i < paragraphsWithHeadings.length; i++) {
        const candidate = paragraphsWithHeadings[i];
        if (candidate && !candidate.isPlaceholder && !candidate.isHeading && candidate.id > 0) {
          visibleParagraphId = candidate.id;
          break;
        }
      }
      const nextChapterIndex = findChapterIndexForParagraph(visibleParagraphId);
      setActiveChapterIndex(nextChapterIndex);
    },
    [
      totalChunks,
      pruneChunksOutsideWindow,
      ensureChunksForWindow,
      bookId,
      paragraphsWithHeadings,
      persistReadingPosition,
      findChapterIndexForParagraph,
    ],
  );
  const resetLoadedData = useCallback(() => {
    chunkMetadataRef.current.clear();
    activeChunkIndexesRef.current.clear();
    pendingChunkRequestRef.current.clear();
    desiredChunkWindowRef.current = null;
    visibleRangeRef.current = null;
    lastRequestedRangeRef.current = null;
    highestLoadedChunkIndexRef.current = -1;
    setHighestLoadedChunkIndex(-1);
    chunkRequestInFlightRef.current = false;
    if (savePositionTimeoutRef.current) {
      clearTimeout(savePositionTimeoutRef.current);
      savePositionTimeoutRef.current = null;
    }
    setChunkRequestRange((prev) => (prev === null ? prev : null));
    setChunkMap((prev) => (prev.size > 0 ? new Map() : prev));
    setScrollTargetParagraphId((prev) => (prev !== null ? null : prev));
    setActiveChapterIndex(0);
  }, []);

  useEffect(() => {
    const bookIdChanged = previousBookIdRef.current !== bookId;
    previousBookIdRef.current = bookId;

    if (bookIdChanged) {
      initialScrollSetRef.current = null;
      startTransition(() => {
        resetLoadedData();
      });
    }

    if (status === "completed" && totalChunks > 0) {
      startTransition(() => {
        // Check if there's a saved reading position
        const savedParagraphId = book?.lastReadParagraphId;
        const initialTarget =
          savedParagraphId && savedParagraphId > 0
            ? savedParagraphId
            : chapters[0]?.startParagraphId ?? null;

        if (bookId && initialScrollSetRef.current !== bookId) {
          setScrollTargetParagraphId(initialTarget);
          initialScrollSetRef.current = bookId;
        }
        if (savedParagraphId && savedParagraphId > 0) {
          // Calculate which chunk contains the saved paragraph
          // Paragraph IDs are sequential, so we can estimate the chunk
          const estimatedChunkIndex = Math.floor((savedParagraphId - 1) / CHUNK_SIZE);
          const targetChunk = Math.max(0, Math.min(estimatedChunkIndex, totalChunks - 1));
          // Load the target chunk and surrounding chunks
          const startChunk = Math.max(0, targetChunk - CHUNK_WINDOW_PADDING);
          const endChunk = Math.min(totalChunks - 1, targetChunk + CHUNK_WINDOW_PADDING);
          scheduleChunkFetch(startChunk, endChunk);
        } else {
          // Default: load from beginning
          scheduleChunkFetch(0, Math.min(totalChunks - 1, CHUNK_BATCH_SIZE - 1));
        }
      });
    } else {
      startTransition(() => {
        setChunkRequestRange((prev) => (prev === null ? prev : null));
        resetLoadedData();
        setScrollTargetParagraphId(null);
      });
    }
  }, [bookId, resetLoadedData, scheduleChunkFetch, status, totalChunks, book, chapters]);

  useEffect(() => {
    if (!chunkRequestRange) {
      return;
    }
    if (chunkBatch === undefined) {
      return;
    }

    const clearPendingRange = () => {
      if (lastRequestedRangeRef.current) {
        for (
          let index = lastRequestedRangeRef.current.from;
          index <= lastRequestedRangeRef.current.to;
          index++
        ) {
          pendingChunkRequestRef.current.delete(index);
        }
        lastRequestedRangeRef.current = null;
      }
    };

    if (!chunkBatch || chunkBatch.length === 0) {
      startTransition(() => {
        setChunkRequestRange(null);
      });
      chunkRequestInFlightRef.current = false;
      clearPendingRange();
      return;
    }

    const unseenChunks = chunkBatch.filter(
      (chunk) => !activeChunkIndexesRef.current.has(chunk.chunkIndex),
    );

    for (const chunk of chunkBatch) {
      pendingChunkRequestRef.current.delete(chunk.chunkIndex);
    }

    if (unseenChunks.length === 0) {
      chunkRequestInFlightRef.current = false;
      clearPendingRange();
      startTransition(() => {
        setChunkRequestRange(null);
      });
      return;
    }

    const prepared = unseenChunks
      .map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        paragraphs: buildParagraphsFromChunks([chunk]),
      }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    startTransition(() => {
      let batchMaxIndex = highestLoadedChunkIndexRef.current;
      // O(k) where k = new chunks, not O(n) where n = total paragraphs
      setChunkMap((prev) => {
        const next = new Map(prev);
        for (const entry of prepared) {
          const chunkStart = entry.chunkIndex * CHUNK_SIZE;
          next.set(entry.chunkIndex, entry.paragraphs);
          chunkMetadataRef.current.set(entry.chunkIndex, {
            start: chunkStart,
            length: entry.paragraphs.length,
          });
          activeChunkIndexesRef.current.add(entry.chunkIndex);
          batchMaxIndex = Math.max(batchMaxIndex, entry.chunkIndex);
        }
        return next;
      });
      setHighestLoadedChunkIndex((prev) => {
        if (batchMaxIndex <= prev) {
          highestLoadedChunkIndexRef.current = prev;
          return prev;
        }
        highestLoadedChunkIndexRef.current = batchMaxIndex;
        return batchMaxIndex;
      });
      setChunkRequestRange(null);
    });

    chunkRequestInFlightRef.current = false;
    clearPendingRange();

    // Defer window management to avoid infinite loop - these will trigger new chunk requests
    // which would cause this effect to run again immediately
    const timeoutId = setTimeout(() => {
      if (desiredChunkWindowRef.current) {
        pruneChunksOutsideWindow(desiredChunkWindowRef.current);
        ensureChunksForWindow(desiredChunkWindowRef.current);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkBatch, chunkRequestRange]);

  const requestMoreChunks = useCallback(() => {
    if (!bookId || status !== "completed") {
      return;
    }
    if (!totalChunks || totalChunks <= 0) {
      return;
    }
    const nextFrom = Math.max(highestLoadedChunkIndex + 1, 0);
    if (nextFrom >= totalChunks) {
      return;
    }
    const nextTo = Math.min(totalChunks - 1, nextFrom + CHUNK_BATCH_SIZE - 1);
    scheduleChunkFetch(nextFrom, nextTo);
  }, [bookId, status, totalChunks, scheduleChunkFetch, highestLoadedChunkIndex]);

  const handleChapterSelect = useCallback(
    (chapter: ChapterInfo) => {
      if (!chapter || !bookId || status !== "completed" || !totalChunks || totalChunks <= 0) {
        return;
      }
      const paragraphId = Math.max(1, chapter.startParagraphId);
      setScrollTargetParagraphId(paragraphId);
      const targetChunk = Math.max(0, Math.floor((paragraphId - 1) / CHUNK_SIZE));
      const startChunk = Math.max(0, targetChunk - CHUNK_WINDOW_PADDING);
      const endChunk = Math.min(totalChunks - 1, targetChunk + CHUNK_WINDOW_PADDING);
      desiredChunkWindowRef.current = { startChunk, endChunk };
      ensureChunksForWindow({ startChunk, endChunk });
      const chapterArrayIndex = chapters.findIndex((c) => c.index === chapter.index);
      if (chapterArrayIndex >= 0) {
        setActiveChapterIndex(chapterArrayIndex);
      }
    },
    [bookId, status, totalChunks, ensureChunksForWindow, chapters],
  );

  const hasMoreChunks =
    status === "completed" &&
    totalChunks > 0 &&
    highestLoadedChunkIndex < totalChunks - 1;

  useEffect(() => {
    hasTouchedRef.current = false;
    return () => {
      if (savePositionTimeoutRef.current) {
        clearTimeout(savePositionTimeoutRef.current);
        savePositionTimeoutRef.current = null;
      }
    };
  }, [bookId]);

  useEffect(() => {
    if (!bookId || !online) return;
    void flushQueuedProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, online]);


  useEffect(() => {
    if (!bookId || hasTouchedRef.current || !online) {
      return;
    }

    if (book && processingStatus?.processingStatus === "completed") {
      touchOpen({ bookId })
        .then((result) => {
          console.log("📖 [BOOK OPEN] touchOpen result:", result);
        })
        .catch((error) => {
          console.error("📖 [BOOK OPEN] Failed to record open event:", error);
        });
      hasTouchedRef.current = true;
    }
  }, [bookId, book, processingStatus, touchOpen, online]);


  if (!bookId) {
    return (
      <ReaderFallback
        title="Missing book information"
        description="We couldn't determine which book to open. Try navigating from the library again."
      />
    );
  }

  if (book === undefined) {
    return (
      <ReaderFallback
        title="Loading reader…"
        description="Fetching book metadata and preparing the reader interface."
      />
    );
  }

  if (book === null) {
    return (
      <ReaderFallback
        title="Book not found"
        description="This book either no longer exists or you might not have access to it."
      />
    );
  }

  if (processingStatus === undefined) {
    return (
      <ReaderFallback
        title="Loading reader…"
        description="Fetching book metadata and preparing the reader interface."
      />
    );
  }

  if (status === undefined || status === null) {
    return (
      <ReaderFallback
        title="Book needs processing"
        description="This book was uploaded before the new system. Please re-upload it or wait for processing to complete."
      />
    );
  }

  if (status === "pending" || status === "processing") {
    return (
      <ReaderFallback
        title="Processing book…"
        description="Extracting paragraphs from the EPUB file. This may take a moment."
      />
    );
  }

  if (status === "failed") {
    return (
      <ReaderFallback
        title="Unable to process this book"
        description="Failed to extract content from the EPUB file. Please try re-uploading."
      />
    );
  }

  if (status === "completed" && totalChunks === 0) {
    return (
      <ReaderFallback
        title="No readable content found"
        description="We couldn't find any paragraphs inside this EPUB file."
      />
    );
  }

  if (status === "completed" && totalChunks > 0 && paragraphs.length === 0 && !isRequestingChunks) {
    return (
      <ReaderFallback
        title="Unable to load this book"
        description="We couldn't retrieve any paragraphs for this book. Try reloading the page or re-uploading the EPUB."
      />
    );
  }

  return (
    <>
      <LanguageReader
        title={book.title}
        subtitle={book.author?.trim() ?? null}
        paragraphs={paragraphsWithHeadings}
        hasMore={hasMoreChunks}
        isInitialLoading={paragraphs.length === 0 && isRequestingChunks}
        isLoadingMore={isRequestingChunks && paragraphs.length > 0}
        onLoadMore={hasMoreChunks ? requestMoreChunks : undefined}
        onVisibleRangeChange={handleVisibleRangeChange}
        onBack={() => router.push("/")}
        scrollToParagraphId={scrollTargetParagraphId}
        chapters={chapters}
        activeChapterIndex={activeChapterIndex}
        onSelectChapter={handleChapterSelect}
      />
    </>
  );
}

type ReaderFallbackProps = {
  title: string;
  description?: string;
};

function ReaderFallback({ title, description }: ReaderFallbackProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background px-6 py-10 text-foreground sm:px-10">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        ← Back to Library
      </Link>

      <section className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </section>
    </main>
  );
}
