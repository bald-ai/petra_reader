"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { formatFileSize } from "@/lib/format";

type SortOption = "title" | "recent";

const sortLabels: Record<SortOption, string> = {
  title: "Title A→Z",
  recent: "Recently opened",
};

export default function LibraryPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("title");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const books = useQuery(api.books.list, useMemo(() => ({ sortBy }), [sortBy]));
  const generateUploadUrl = useMutation(api.books.generateUploadUrl);
  const createBook = useMutation(api.books.create);
  const touchOpen = useMutation(api.books.touchOpen);

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

  const handleOpenBook = async (bookId: Id<"books">) => {
    try {
      await touchOpen({ bookId });
    } catch (err) {
      console.error(err);
    }
    router.push(`/reader/${bookId}`);
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
                className="h-36 animate-pulse rounded-xl border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-black/30"
              />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
            <p className="font-medium text-zinc-600 dark:text-zinc-300">
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
                <button
                  key={book._id}
                  type="button"
                  onClick={() => handleOpenBook(book._id)}
                  className="group flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus:outline-none dark:border-zinc-800 dark:bg-black"
                >
                  <div className="relative mb-3 aspect-[3/4] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 transition group-hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900">
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
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {author}
                    </p>
                  )}
                  <p className="mt-4 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {formatFileSize(book.sizeBytes)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
