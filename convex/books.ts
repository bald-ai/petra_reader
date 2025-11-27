import { mutation, query, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

const sortByValidator = v.optional(
  v.union(v.literal("title"), v.literal("recent")),
);

type SortBy = "title" | "recent";
type ChapterInfo = {
  index: number;
  title: string;
  startParagraphId: number;
};

async function getCurrentUserOrCreate(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated");
  }

  let user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  if (!user) {
    const userId = await ctx.db.insert("users", {
      name: identity.name ?? "Unknown",
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      avatarUrl: identity.pictureUrl,
    });
    user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("Failed to create user");
    }
  }

  return user;
}

async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();

  return user;
}

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
    const user = await getCurrentUserOrCreate(ctx);
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
      userId: user._id,
      processingStatus: "pending",
      totalChunks: 0,
      chapters: [],
    });

    ctx.scheduler.runAfter(0, api.bookContent.processBook, { bookId });

    return bookId;
  },
});

export const touchOpen = mutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const user = await getCurrentUserOrCreate(ctx);
    const existing = await ctx.db.get(bookId);
    if (!existing) {
      throw new Error("Book not found.");
    }

    if (existing.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(bookId, { lastOpenedAt: Date.now() });
  },
});

export const saveReadingPosition = mutation({
  args: {
    bookId: v.id("books"),
    paragraphId: v.number(),
  },
  handler: async (ctx, { bookId, paragraphId }) => {
    const user = await getCurrentUserOrCreate(ctx);
    const existing = await ctx.db.get(bookId);
    if (!existing) {
      throw new Error("Book not found.");
    }

    if (existing.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(bookId, { lastReadParagraphId: paragraphId });
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
  processingStatus?: "pending" | "processing" | "completed" | "failed";
  totalChunks?: number;
  lastReadParagraphId?: number | null;
  chapters?: ChapterInfo[];
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
    processingStatus: book.processingStatus,
    totalChunks: book.totalChunks,
    lastReadParagraphId: book.lastReadParagraphId ?? null,
    chapters: book.chapters ?? [],
  };
}

export const list = query({
  args: {
    sortBy: sortByValidator,
  },
  handler: async (ctx, { sortBy }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }
    const books = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
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
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }
    const book = await ctx.db.get(bookId);
    if (!book) {
      throw new Error("Book not found.");
    }
    if (book.userId !== user._id) {
      throw new Error("Unauthorized");
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
    const user = await getCurrentUserOrCreate(ctx);
    const book = await ctx.db.get(bookId);
    if (!book) {
      throw new Error("Book not found.");
    }

    if (book.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    // Delete the book record immediately
    await ctx.db.delete(bookId);

    // Delete storage file
    if (book.storageId) {
      try {
        await ctx.storage.delete(book.storageId);
      } catch (error) {
        console.warn("Failed to delete book file from storage:", error);
      }
    }

    // Schedule background job to delete chunks in batches
    await ctx.scheduler.runAfter(0, internal.books.deleteChunksBatch, {
      bookId,
    });

    return { success: true };
  },
});

export const get = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Unauthenticated");
    }
    const book = await ctx.db.get(bookId);
    if (!book) {
      throw new Error("Book not found.");
    }
    if (book.userId !== user._id) {
      throw new Error("Unauthorized");
    }
    return sanitizeBookDetails(book);
  },
});

export const getInternal = query({
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

export const getProcessingStatus = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }
    const book = await ctx.db.get(bookId);
    if (!book || book.userId !== user._id) {
      return null;
    }
    return {
      processingStatus: book.processingStatus,
      totalChunks: book.totalChunks,
    };
  },
});

export const updateProcessingStatus = internalMutation({
  args: {
    bookId: v.id("books"),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    totalChunks: v.optional(v.number()),
    chapters: v.optional(
      v.array(
        v.object({
          index: v.number(),
          title: v.string(),
          startParagraphId: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, { bookId, status, totalChunks, chapters }) => {
    const update: { processingStatus: typeof status; totalChunks?: number; chapters?: ChapterInfo[] } = {
      processingStatus: status,
    };
    if (totalChunks !== undefined) {
      update.totalChunks = totalChunks;
    }
    if (chapters !== undefined) {
      update.chapters = chapters;
    }
    await ctx.db.patch(bookId, update);
  },
});

export const insertChunks = internalMutation({
  args: {
    bookId: v.id("books"),
    chunks: v.array(
      v.object({
        chunkIndex: v.number(),
        paragraphs: v.array(
          v.object({
            id: v.number(),
            text: v.string(),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { bookId, chunks }) => {
    for (const chunk of chunks) {
      await ctx.db.insert("bookChunks", {
        bookId,
        chunkIndex: chunk.chunkIndex,
        paragraphs: chunk.paragraphs,
      });
    }
  },
});

export const getChunks = query({
  args: {
    bookId: v.id("books"),
    fromChunk: v.number(),
    toChunk: v.number(),
  },
  handler: async (ctx, { bookId, fromChunk, toChunk }) => {
    const book = await ctx.db.get(bookId);
    if (!book) {
      return [];
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || book.userId !== user._id) {
      return [];
    }

    const chunks = await ctx.db
      .query("bookChunks")
      .withIndex("by_book", (q) =>
        q.eq("bookId", bookId).gte("chunkIndex", fromChunk).lte("chunkIndex", toChunk),
      )
      .collect();

    return chunks
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        paragraphs: chunk.paragraphs,
      }));
  },
});

const DELETE_BATCH_SIZE = 100;

export const deleteChunksBatch = internalMutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const chunks = await ctx.db
      .query("bookChunks")
      .withIndex("by_book", (q) => q.eq("bookId", bookId))
      .take(DELETE_BATCH_SIZE);

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    // If we deleted a full batch, there might be more - schedule another run
    if (chunks.length === DELETE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.books.deleteChunksBatch, {
        bookId,
      });
    }
  },
});
