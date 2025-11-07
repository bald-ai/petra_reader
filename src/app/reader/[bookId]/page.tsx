"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import LanguageReader, { Paragraph } from "@/components/language-reader";

export default function ReaderPage() {
  const router = useRouter();
  const routeParams = useParams<{ bookId: string }>();
  const bookId = routeParams?.bookId as Id<"books"> | undefined;
  const book = useQuery(api.books.get, bookId ? { bookId } : "skip");
  const fetchContent = useAction(api.bookContent.content);
  const touchOpen = useMutation(api.books.touchOpen);
  const [paragraphs, setParagraphs] = useState<Paragraph[] | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const hasTouchedRef = useRef(false);

  useEffect(() => {
    hasTouchedRef.current = false;
  }, [bookId]);

  useEffect(() => {
    if (!bookId) {
      setParagraphs(null);
      setContentError(null);
      setIsContentLoading(false);
      return;
    }

    let isCancelled = false;
    setParagraphs(null);
    setIsContentLoading(true);
    setContentError(null);

    const loadContent = async () => {
      try {
        const result = await fetchContent({ bookId });
        if (isCancelled) {
          return;
        }

        const mapped: Paragraph[] = (result?.paragraphs ?? []).map(
          (paragraph) => ({
            id: paragraph.id,
            text: paragraph.text,
            translation: null,
          }),
        );

        setParagraphs(mapped);

        if (!hasTouchedRef.current) {
          touchOpen({ bookId }).catch((error) => {
            console.error("Failed to record open event", error);
          });
          hasTouchedRef.current = true;
        }
      } catch (error) {
        if (!isCancelled) {
          setContentError(
            error instanceof Error
              ? error.message
              : "Failed to load book content.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsContentLoading(false);
        }
      }
    };

    void loadContent();

    return () => {
      isCancelled = true;
    };
  }, [bookId, fetchContent, touchOpen]);

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

  if (contentError) {
    return (
      <ReaderFallback
        title="Unable to load this book"
        description={contentError}
      />
    );
  }

  if (isContentLoading || paragraphs === null) {
    return (
      <ReaderFallback
        title="Preparing book text…"
        description="Extracting the paragraphs from the EPUB file."
      />
    );
  }

  if (paragraphs.length === 0) {
    return (
      <ReaderFallback
        title="No readable content found"
        description="We couldn't find any paragraphs inside this EPUB file."
      />
    );
  }

  return (
    <LanguageReader
      title={book.title}
      subtitle={book.author?.trim() ?? null}
      paragraphs={paragraphs}
      onBack={() => router.push("/")}
    />
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
