import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

const sortByValidator = v.optional(
  v.union(v.literal("title"), v.literal("recent")),
);

type SortBy = "title" | "recent";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmedTitle = args.title?.trim() ?? "";
    const trimmedAuthor = args.author?.trim() ?? "";
    const { storageId, filename } = args;
    const metadata = await ctx.storage.getMetadata(storageId);
    if (!metadata) {
      throw new Error("Uploaded file was not found in storage.");
    }
    const now = Date.now();
    const derivedTitle =
      trimmedTitle ||
      filename.replace(/\.epub$/i, "").trim() ||
      "Untitled EPUB";

    const bookId = await ctx.db.insert("books", {
      title: derivedTitle,
      author: trimmedAuthor.length > 0 ? trimmedAuthor : null,
      sizeBytes: metadata.size,
      storageId,
      coverUrl: null,
      createdAt: now,
      lastOpenedAt: null,
    });

    return bookId;
  },
});

export const touchOpen = mutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const existing = await ctx.db.get(bookId);
    if (!existing) {
      throw new Error("Book not found.");
    }

    await ctx.db.patch(bookId, { lastOpenedAt: Date.now() });
  },
});

type BookListItem = {
  _id: Id<"books">;
  title: string;
  author: string | null;
  sizeBytes: number;
  coverUrl: string | null;
  createdAt: number;
  lastOpenedAt: number | null;
};

type BookDetails = BookListItem & {
  storageId: Id<"_storage"> | null;
};

function sanitizeBookForList(book: Doc<"books">): BookListItem | null {
  if (!book.storageId || book.sizeBytes === undefined) {
    return null;
  }

  return {
    _id: book._id,
    title: book.title,
    author: book.author ?? null,
    sizeBytes: book.sizeBytes ?? 0,
    coverUrl: book.coverUrl ?? null,
    createdAt: book.createdAt,
    lastOpenedAt: book.lastOpenedAt ?? null,
  };
}

function sanitizeBookDetails(book: Doc<"books">): BookDetails {
  return {
    _id: book._id,
    title: book.title,
    author: book.author ?? null,
    sizeBytes: book.sizeBytes ?? 0,
    coverUrl: book.coverUrl ?? null,
    createdAt: book.createdAt,
    lastOpenedAt: book.lastOpenedAt ?? null,
    storageId: book.storageId ?? null,
  };
}

export const list = query({
  args: {
    sortBy: sortByValidator,
  },
  handler: async (ctx, { sortBy }) => {
    const books = await ctx.db.query("books").collect();
    const sanitized = books
      .map(sanitizeBookForList)
      .filter((book): book is BookListItem => book !== null);

    const order: SortBy = sortBy ?? "title";
    if (order === "recent") {
      return sanitized.sort((a, b) => {
        const aOpened = a.lastOpenedAt ?? 0;
        const bOpened = b.lastOpenedAt ?? 0;
        if (bOpened !== aOpened) {
          return bOpened - aOpened;
        }
        return b.createdAt - a.createdAt;
      });
    }

    return sanitized.sort((a, b) => {
      const titleCompare = a.title.localeCompare(b.title);
      if (titleCompare !== 0) {
        return titleCompare;
      }
      return a.createdAt - b.createdAt;
    });
  },
});

export const getFileUrl = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const book = await ctx.db.get(bookId);
    if (!book) {
      throw new Error("Book not found.");
    }
    if (!book.storageId) {
      throw new Error("This book is missing file storage. Please re-upload.");
    }
    const url = await ctx.storage.getUrl(book.storageId);
    if (!url) {
      throw new Error("Unable to access file URL.");
    }
    return url;
  },
});

export const remove = mutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const book = await ctx.db.get(bookId);
    if (!book) {
      throw new Error("Book not found.");
    }

    // Delete the book record from the database
    await ctx.db.delete(bookId);

    // Optionally delete the file from storage if storageId exists
    if (book.storageId) {
      try {
        await ctx.storage.delete(book.storageId);
      } catch (error) {
        // Log error but don't fail the deletion if storage deletion fails
        console.warn("Failed to delete book file from storage:", error);
      }
    }

    return { success: true };
  },
});

export const get = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const book = await ctx.db.get(bookId);
    if (!book) {
      throw new Error("Book not found.");
    }
    return sanitizeBookDetails(book);
  },
});
