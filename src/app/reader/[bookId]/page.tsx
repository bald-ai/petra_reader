"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import LanguageReader, { Paragraph, defaultParagraphs } from "@/components/language-reader";

type ChunkRecord = {
  chunkIndex: number;
  paragraphs: Array<{
    id: number;
    text: string;
  }>;
};

const CHUNK_BATCH_SIZE = 4;

function buildParagraphsFromChunks(chunks: ChunkRecord[]): Paragraph[] {
  if (chunks.length === 0) {
    return [];
  }

  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const collected: Paragraph[] = [];

  for (const chunk of ordered) {
    for (const paragraph of chunk.paragraphs) {
      const fallback = DEFAULT_PARAGRAPH_LOOKUP.get(paragraph.id);
      collected.push({
        id: paragraph.id,
        spanish: paragraph.text ?? fallback?.spanish ?? "",
        english: fallback?.english ?? "",
      });
    }
  }

  return collected;
}
const DEFAULT_PARAGRAPH_LOOKUP = new Map(
  defaultParagraphs.map((paragraph) => [paragraph.id, paragraph] as const),
);

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
  const hasTouchedRef = useRef(false);
  const previousBookIdRef = useRef<Id<"books"> | undefined>(bookId);

  const status = processingStatus?.processingStatus ?? null;
  const totalChunks = processingStatus?.totalChunks ?? 0;

  const [chunkRequestRange, setChunkRequestRange] = useState<{ from: number; to: number } | null>(null);
  const [loadedChunks, setLoadedChunks] = useState<Record<number, ChunkRecord>>({});
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);

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
  const loadedChunkCount = Object.keys(loadedChunks).length;

  const resetLoadedData = useCallback(() => {
    setLoadedChunks((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    setParagraphs((prev) => (prev.length > 0 ? [] : prev));
  }, []);

  useEffect(() => {
    const bookIdChanged = previousBookIdRef.current !== bookId;
    previousBookIdRef.current = bookId;

    if (bookIdChanged) {
      startTransition(() => {
        resetLoadedData();
      });
    }

    if (status === "completed" && totalChunks > 0) {
      startTransition(() => {
        setChunkRequestRange({
          from: 0,
          to: Math.min(totalChunks - 1, CHUNK_BATCH_SIZE - 1),
        });
      });
    } else {
      startTransition(() => {
        setChunkRequestRange((prev) => (prev === null ? prev : null));
        resetLoadedData();
      });
    }
  }, [bookId, resetLoadedData, status, totalChunks]);

  useEffect(() => {
    if (!chunkRequestRange) {
      return;
    }
    if (chunkBatch === undefined) {
      return;
    }

    if (!chunkBatch || chunkBatch.length === 0) {
      if (totalChunks > 0 && loadedChunkCount >= totalChunks) {
        startTransition(() => {
          setChunkRequestRange(null);
        });
      }
      return;
    }

    startTransition(() => {
      const newChunks: ChunkRecord[] = [];

      setLoadedChunks((prev) => {
        let hasChanges = false;
        const next = { ...prev };
        for (const chunk of chunkBatch) {
          if (next[chunk.chunkIndex]) {
            continue;
          }
          next[chunk.chunkIndex] = chunk;
          newChunks.push(chunk);
          hasChanges = true;
        }
        return hasChanges ? next : prev;
      });

      if (newChunks.length > 0) {
        const appendedParagraphs = buildParagraphsFromChunks(newChunks);
        setParagraphs((prev) => (prev.length > 0 ? [...prev, ...appendedParagraphs] : appendedParagraphs));
      }

      setChunkRequestRange(null);
    });
  }, [chunkBatch, chunkRequestRange, loadedChunkCount, totalChunks]);

  // Rebuild paragraphs from loadedChunks if paragraphs is empty but chunks exist
  useEffect(() => {
    if (paragraphs.length === 0 && Object.keys(loadedChunks).length > 0) {
      const chunksArray = Object.values(loadedChunks);
      const rebuiltParagraphs = buildParagraphsFromChunks(chunksArray);
      if (rebuiltParagraphs.length > 0) {
        startTransition(() => {
          setParagraphs(rebuiltParagraphs);
        });
      }
    }
  }, [paragraphs.length, loadedChunks]);

  const requestMoreChunks = useCallback(() => {
    if (!bookId || status !== "completed") {
      return;
    }
    if (isRequestingChunks) {
      return;
    }
    if (!totalChunks || loadedChunkCount >= totalChunks) {
      return;
    }

    const loadedIndexes = Object.keys(loadedChunks).map((key) => Number(key));
    const highestLoaded = loadedIndexes.length > 0 ? Math.max(...loadedIndexes) : -1;
    const nextFrom = highestLoaded + 1;
    if (nextFrom >= totalChunks) {
      return;
    }

    const nextTo = Math.min(totalChunks - 1, nextFrom + CHUNK_BATCH_SIZE - 1);
    setChunkRequestRange({ from: nextFrom, to: nextTo });
  }, [bookId, status, isRequestingChunks, totalChunks, loadedChunkCount, loadedChunks]);

  const hasMoreChunks =
    status === "completed" &&
    totalChunks > 0 &&
    loadedChunkCount < totalChunks;

  useEffect(() => {
    hasTouchedRef.current = false;
  }, [bookId]);


  useEffect(() => {
    if (!bookId || hasTouchedRef.current) {
      return;
    }

    if (book && processingStatus?.processingStatus === "completed") {
      touchOpen({ bookId }).catch((error) => {
        console.error("Failed to record open event", error);
      });
      hasTouchedRef.current = true;
    }
  }, [bookId, book, processingStatus, touchOpen]);


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

  if (processingStatus === undefined || book === undefined) {
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
        paragraphs={paragraphs}
        hasMore={hasMoreChunks}
        isInitialLoading={paragraphs.length === 0 && isRequestingChunks}
        isLoadingMore={isRequestingChunks && paragraphs.length > 0}
        onLoadMore={hasMoreChunks ? requestMoreChunks : undefined}
        onBack={() => router.push("/")}
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
