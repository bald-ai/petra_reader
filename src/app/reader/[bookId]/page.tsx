"use client";

import { useEffect, useRef, useState, useCallback, startTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import LanguageReader, { Paragraph, defaultParagraphs } from "@/components/language-reader";

const INITIAL_CHUNKS = 15;
const CHUNKS_PER_LOAD = 30;
const PRELOAD_THRESHOLD = 10;
const KEEP_WINDOW = 10;

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
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [minChunkIndex, setMinChunkIndex] = useState<number>(0);
  const [maxChunkIndex, setMaxChunkIndex] = useState<number>(INITIAL_CHUNKS - 1);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const hasTouchedRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const paragraphToChunkMap = useRef<Map<number, number>>(new Map());
  const hasScrolledRef = useRef(false);

  const chunks = useQuery(
    api.books.getChunks,
    bookId ? { bookId, fromChunk: minChunkIndex, toChunk: maxChunkIndex } : "skip",
  );

  useEffect(() => {
    hasTouchedRef.current = false;
    hasScrolledRef.current = false;
    paragraphToChunkMap.current.clear();
    startTransition(() => {
      setParagraphs([]);
      setMinChunkIndex(0);
      setMaxChunkIndex(INITIAL_CHUNKS - 1);
      setIsAtBottom(false);
      setCurrentChunkIndex(0);
    });
  }, [bookId]);

  useEffect(() => {
    if (!chunks || chunks.length === 0) {
      return;
    }

    const loadedChunkSet = new Set(chunks.map(c => c.chunkIndex));
    const previousChunkMap = new Map(paragraphToChunkMap.current);

    setParagraphs((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newParagraphs: Paragraph[] = [];
      const chunkMap = new Map<number, number>();

      for (const chunk of chunks) {
        for (const para of chunk.paragraphs) {
          chunkMap.set(para.id, chunk.chunkIndex);
          if (existingIds.has(para.id)) {
            continue;
          }
          existingIds.add(para.id);
          const fallback = defaultParagraphs.find((item) => item.id === para.id);
          newParagraphs.push({
            id: para.id,
            spanish: para.text ?? fallback?.spanish ?? "",
            english: fallback?.english ?? "",
          });
        }
      }

      paragraphToChunkMap.current = chunkMap;

      const filtered = prev.filter(p => {
        const chunkIdx = chunkMap.get(p.id) ?? previousChunkMap.get(p.id);
        return chunkIdx !== undefined && loadedChunkSet.has(chunkIdx);
      });

      if (newParagraphs.length === 0 && filtered.length === prev.length) {
        return prev;
      }

      const combined = [...filtered, ...newParagraphs];
      return combined.sort((a, b) => a.id - b.id);
    });

  }, [chunks]);

  const updateCurrentChunk = useCallback(() => {
    const scrollArea = document.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    if (!scrollArea || paragraphs.length === 0) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollArea;
    const threshold = 50;
    
    if (scrollTop > 10) {
      hasScrolledRef.current = true;
    }
    
    const atBottom = scrollHeight - scrollTop - clientHeight < threshold;
    
    setIsAtBottom(atBottom);

    const scrollRatio = Math.max(0, Math.min(1, scrollTop / Math.max(scrollHeight - clientHeight, 1)));
    const estimatedIndex = Math.floor(scrollRatio * paragraphs.length);
    const visibleParagraph = paragraphs[estimatedIndex];
    
    if (visibleParagraph) {
      const chunkIndex = paragraphToChunkMap.current.get(visibleParagraph.id);
      if (chunkIndex !== undefined) {
        setCurrentChunkIndex((prev) => prev !== chunkIndex ? chunkIndex : prev);
      }
    }
  }, [paragraphs]);

  useEffect(() => {
    if (processingStatus?.totalChunks === undefined) return;
    if (!chunks || chunks.length === 0) return;
    if (paragraphs.length === 0) return;

    const totalChunks = processingStatus.totalChunks;
    
    const newMin = Math.max(0, currentChunkIndex - KEEP_WINDOW);
    const newMax = Math.min(totalChunks - 1, currentChunkIndex + KEEP_WINDOW);

    let shouldUpdateMin = false;
    let shouldUpdateMax = false;
    let newMinValue = minChunkIndex;
    let newMaxValue = maxChunkIndex;

    if (currentChunkIndex - minChunkIndex <= PRELOAD_THRESHOLD && minChunkIndex > 0) {
      newMinValue = Math.max(0, minChunkIndex - CHUNKS_PER_LOAD);
      if (newMinValue !== minChunkIndex) {
        shouldUpdateMin = true;
      }
    }
    
    if (maxChunkIndex - currentChunkIndex <= PRELOAD_THRESHOLD && maxChunkIndex < totalChunks - 1) {
      newMaxValue = Math.min(totalChunks - 1, maxChunkIndex + CHUNKS_PER_LOAD);
      if (newMaxValue !== maxChunkIndex) {
        shouldUpdateMax = true;
      }
    }

    if (isAtBottom && maxChunkIndex < totalChunks - 1) {
      newMaxValue = Math.min(totalChunks - 1, maxChunkIndex + CHUNKS_PER_LOAD);
      if (newMaxValue !== maxChunkIndex) {
        shouldUpdateMax = true;
      }
    }

    if (hasScrolledRef.current) {
      if (minChunkIndex < newMin && newMin !== minChunkIndex) {
        newMinValue = newMin;
        shouldUpdateMin = true;
      }
      if (maxChunkIndex > newMax && newMax !== maxChunkIndex) {
        newMaxValue = newMax;
        shouldUpdateMax = true;
      }
    }

    if (shouldUpdateMin || shouldUpdateMax) {
      startTransition(() => {
        if (shouldUpdateMin) {
          setMinChunkIndex(newMinValue);
        }
        if (shouldUpdateMax) {
          setMaxChunkIndex(newMaxValue);
        }
      });
    }
  }, [currentChunkIndex, minChunkIndex, maxChunkIndex, processingStatus?.totalChunks, chunks, paragraphs.length, isAtBottom]);

  useEffect(() => {
    if (paragraphs.length === 0) return;
    
    const scrollArea = document.querySelector('[data-slot="scroll-area-viewport"]');
    if (!scrollArea) return;

    const handleScroll = () => {
      updateCurrentChunk();
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        updateCurrentChunk();
      }, 100);
    };

    scrollArea.addEventListener('scroll', handleScroll, { passive: true });
    
    const timeoutId = setTimeout(() => {
      updateCurrentChunk();
    }, 200);

    return () => {
      scrollArea.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      clearTimeout(timeoutId);
    };
  }, [updateCurrentChunk, paragraphs.length]);

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

  const status = processingStatus?.processingStatus;

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

  if (paragraphs.length === 0 && status === "completed") {
    return (
      <ReaderFallback
        title="No readable content found"
        description="We couldn't find any paragraphs inside this EPUB file."
      />
    );
  }

  return (
    <>
      <LanguageReader
        title={book.title}
        subtitle={book.author?.trim() ?? null}
        paragraphs={paragraphs}
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
