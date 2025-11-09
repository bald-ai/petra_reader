"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import LanguageReader, { Paragraph, defaultParagraphs } from "@/components/language-reader";

const INITIAL_CHUNKS = 5;
const CHUNKS_PER_LOAD = 3;

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
  const [loadedChunks, setLoadedChunks] = useState<Set<number>>(new Set());
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [maxChunkIndex, setMaxChunkIndex] = useState<number>(INITIAL_CHUNKS - 1);
  const hasTouchedRef = useRef(false);

  const chunks = useQuery(
    api.books.getChunks,
    bookId ? { bookId, fromChunk: 0, toChunk: maxChunkIndex } : "skip",
  );

  useEffect(() => {
    hasTouchedRef.current = false;
    setLoadedChunks(new Set());
    setParagraphs([]);
    setMaxChunkIndex(INITIAL_CHUNKS - 1);
  }, [bookId]);

  useEffect(() => {
    if (!chunks || chunks.length === 0) {
      return;
    }

    setParagraphs((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newParagraphs: Paragraph[] = [];

      for (const chunk of chunks) {
        for (const para of chunk.paragraphs) {
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

      if (newParagraphs.length === 0) {
        return prev;
      }

      const combined = [...prev, ...newParagraphs];
      return combined.sort((a, b) => a.id - b.id);
    });

    setLoadedChunks((prev) => {
      const updated = new Set(prev);
      for (const chunk of chunks) {
        updated.add(chunk.chunkIndex);
      }
      return updated;
    });
  }, [chunks]);

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

  const handleLoadMore = () => {
    if (processingStatus?.totalChunks !== undefined) {
      const newMax = Math.min(
        maxChunkIndex + CHUNKS_PER_LOAD,
        processingStatus.totalChunks - 1,
      );
      setMaxChunkIndex(newMax);
    }
  };

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

  const hasMoreChunks =
    processingStatus?.totalChunks !== undefined &&
    maxChunkIndex < processingStatus.totalChunks - 1;

  return (
    <>
      <LanguageReader
        title={book.title}
        subtitle={book.author?.trim() ?? null}
        paragraphs={paragraphs}
        onBack={() => router.push("/")}
      />
      {hasMoreChunks && (
        <div className="fixed bottom-20 left-0 right-0 z-30 flex justify-center">
          <button
            onClick={handleLoadMore}
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90"
          >
            Load more
          </button>
        </div>
      )}
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
