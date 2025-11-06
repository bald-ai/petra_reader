"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { formatFileSize } from "@/lib/format";

type ReaderPageProps = {
  params: {
    bookId: string;
  };
};

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return "Never";
  }
  return new Date(timestamp).toLocaleString();
}

export default function ReaderPage({ params }: ReaderPageProps) {
  const bookId = params.bookId as Id<"books">;
  const book = useQuery(api.books.get, { bookId });
  const fileUrl = useQuery(
    api.books.getFileUrl,
    book?.storageId ? { bookId } : "skip",
  );

  const isLoading =
    book === undefined ||
    (book?.storageId ? fileUrl === undefined : false);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 bg-background px-6 py-10 text-foreground sm:px-10">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-600 transition hover:text-foreground dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to Library
      </Link>

      {isLoading || book === null ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
          Loading reader…
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-black">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold">{book.title}</h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {book.author ?? "Unknown author"}
                </p>
              </div>
              <div className="flex flex-col gap-1 text-right text-sm text-zinc-500 dark:text-zinc-400">
                <span>{formatFileSize(book.sizeBytes)}</span>
                <span>Added {new Date(book.createdAt).toLocaleString()}</span>
                <span>Last opened {formatTimestamp(book.lastOpenedAt)}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              {book.storageId ? (
                <>
                  <a
                    href={fileUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90"
                  >
                    Open EPUB
                  </a>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    This is a placeholder link while the reader UI is under
                    construction.
                  </span>
                </>
              ) : (
                <span className="text-sm text-red-500">
                  This legacy entry is missing file storage. Please re-upload the
                  EPUB from the library.
                </span>
              )}
            </div>
          </section>

          <section className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white/80 p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-black/40 dark:text-zinc-400">
            EPUB rendering coming soon.
          </section>
        </>
      )}
    </main>
  );
}
