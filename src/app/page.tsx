"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Home() {
  const books = useQuery(api.books.list);
  const addBook = useMutation(api.books.add);

  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Please enter a book title.");
      return;
    }

    try {
      setIsSubmitting(true);
      await addBook({ title: trimmed });
      setTitle("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 bg-background px-6 py-16 text-foreground sm:px-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Petra Reader – Book List
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This page reads from Convex in real time. Add a title to watch it sync
          instantly across connected clients.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-black">
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Book title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-base shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="e.g. The Left Hand of Darkness"
              maxLength={120}
              disabled={isSubmitting}
            />
          </label>
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-foreground px-6 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Adding…" : "Add Book"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Books</h2>
        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-black">
          {books === undefined && (
            <p className="text-sm text-zinc-500">Loading books…</p>
          )}
          {books && books.length === 0 && (
            <p className="text-sm text-zinc-500">
              No books yet. Add your first title above.
            </p>
          )}
          {books?.map((book) => (
            <article
              key={book._id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 bg-background px-4 py-3 text-sm dark:border-zinc-800"
            >
              <span className="font-medium">{book.title}</span>
              <time
                className="text-xs text-zinc-500"
                dateTime={new Date(book.createdAt).toISOString()}
              >
                {new Date(book.createdAt).toLocaleString()}
              </time>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
