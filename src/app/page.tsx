"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { formatFileSize } from "@/lib/format";

type SortOption = "title" | "recent";

const sortLabels: Record<SortOption, string> = {
  title: "Title A→Z",
  recent: "Recently opened",
};

export default function LibraryPage() {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center" suppressHydrationWarning>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-foreground border-t-transparent" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <RedirectToLogin />
      </Unauthenticated>
      <Authenticated>
        <LibraryContent />
      </Authenticated>
    </>
  );
}

function RedirectToLogin() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return null;
}

function LibraryContent() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("title");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const books = useQuery(api.books.list, { sortBy });
  const generateUploadUrl = useMutation(api.books.generateUploadUrl);
  const createBook = useMutation(api.books.create);
  const deleteBook = useMutation(api.books.remove);

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      for (const file of selectedFiles) {
        if (!file.name.toLowerCase().endsWith(".epub")) {
          setError("Only .epub files are supported.");
          continue;
        }

        const title = file.name.replace(/\.epub$/i, "").trim();
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/epub+zip",
          },
          body: file,
        });

        if (!response.ok) {
          throw new Error("Failed to upload file to storage.");
        }

        const { storageId } = (await response.json()) as {
          storageId?: Id<"_storage"> | string;
        };

        if (!storageId) {
          throw new Error("No storage ID returned after upload.");
        }

        await createBook({
          storageId: storageId as Id<"_storage">,
          filename: file.name,
          title: title.length > 0 ? title : undefined,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleOpenBook = (bookId: Id<"books">) => {
    router.push(`/reader/${bookId}`);
  };

  const handleDeleteBook = async (bookId: Id<"books">, bookTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete "${bookTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteBook({ bookId });
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete book. Please try again.",
      );
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 bg-background px-6 py-12 text-foreground sm:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Upload EPUBs to keep them in sync via Convex storage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-zinc-600 dark:text-zinc-400">
            Sort by
            <select
              className="ml-2 rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              disabled={books === undefined}
            >
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={triggerFilePicker}
            className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isUploading}
          >
            {isUploading ? "Uploading…" : "Upload EPUB"}
          </button>
          <UserButton />
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            multiple
            hidden
            onChange={handleFilesSelected}
          />
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <section className="flex-1">
        {books === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse rounded-xl border border-border bg-card/80"
              />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              No books yet
            </p>
            <p>Upload an EPUB to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => {
              const author = book.author?.trim();
              const coverSrc = book.coverUrl ?? "/placeholder-cover.png";

              return (
                <div
                  key={book._id}
                  className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
                >
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBook(book._id, book.title);
                    }}
                    className="absolute right-2 top-2 z-10 rounded-full bg-background/90 p-2 text-red-500 opacity-0 shadow-sm transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:bg-background/80 dark:hover:bg-red-950/50"
                    title="Delete book"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  {/* Book content */}
                  <button
                    type="button"
                    onClick={() => handleOpenBook(book._id)}
                    className="flex flex-1 flex-col focus:outline-none"
                  >
                    <div className="relative mb-3 aspect-[3/4] w-full overflow-hidden rounded-lg border border-border/80 bg-muted transition group-hover:border-foreground/20">
                      <Image
                        src={coverSrc}
                        alt={`${book.title} cover`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = "/placeholder-cover.png";
                          event.currentTarget.srcset = "/placeholder-cover.png";
                        }}
                      />
                    </div>
                    <h2 className="line-clamp-2 text-base font-semibold text-foreground">
                      {book.title}
                    </h2>
                    {author && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {author}
                      </p>
                    )}
                    <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
                      {formatFileSize(book.sizeBytes)}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
