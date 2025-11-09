"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { extractParagraphsFromEpub } from "./utils/epub";

const CHUNK_SIZE = 50;

export const processBook = action({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, { bookId }) => {
    const book = await ctx.runQuery(api.books.getInternal, { bookId });
    if (!book) {
      throw new Error("Book not found.");
    }
    if (!book.storageId) {
      await ctx.runMutation(api.books.updateProcessingStatus, {
        bookId,
        status: "failed",
      });
      throw new Error("This book is missing file storage. Please re-upload.");
    }

    try {
      await ctx.runMutation(api.books.updateProcessingStatus, {
        bookId,
        status: "processing",
      });

      const fileBlob = await ctx.storage.get(book.storageId);
      if (!fileBlob) {
        await ctx.runMutation(api.books.updateProcessingStatus, {
          bookId,
          status: "failed",
        });
        throw new Error("Unable to load book file from storage.");
      }
      const fileBuffer = await fileBlob.arrayBuffer();

      const paragraphs = await extractParagraphsFromEpub(fileBuffer);

      const chunks: Array<{ chunkIndex: number; paragraphs: Array<{ id: number; text: string }> }> = [];
      for (let i = 0; i < paragraphs.length; i += CHUNK_SIZE) {
        const chunkParagraphs = paragraphs.slice(i, i + CHUNK_SIZE);
        chunks.push({
          chunkIndex: Math.floor(i / CHUNK_SIZE),
          paragraphs: chunkParagraphs,
        });
      }

      await ctx.runMutation(api.books.insertChunks, {
        bookId,
        chunks,
      });

      await ctx.runMutation(api.books.updateProcessingStatus, {
        bookId,
        status: "completed",
        totalChunks: chunks.length,
      });
    } catch (error) {
      await ctx.runMutation(api.books.updateProcessingStatus, {
        bookId,
        status: "failed",
      });
      throw error;
    }
  },
});

export const migrateExistingBooks = action({
  args: {},
  handler: async (ctx): Promise<Array<{ bookId: string; status: string; error?: string }>> => {
    const books = await ctx.runQuery(api.books.listUnprocessed);
    const results: Array<{ bookId: string; status: string; error?: string }> = [];

    for (const book of books) {
      try {
        await ctx.runAction(api.bookContent.processBook, { bookId: book._id });
        results.push({ bookId: book._id, status: "success" });
      } catch (error) {
        results.push({
          bookId: book._id,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },
});

export const content = action({
  args: {
    bookId: v.id("books"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { bookId, limit }) => {
    const book = await ctx.runQuery(api.books.get, { bookId });
    if (!book.storageId) {
      throw new Error("This book is missing file storage. Please re-upload.");
    }

    const fileBlob = await ctx.storage.get(book.storageId);
    if (!fileBlob) {
      throw new Error("Unable to load book file from storage.");
    }
    const fileBuffer = await fileBlob.arrayBuffer();

    const normalizedLimit =
      typeof limit === "number" && limit > 0 ? Math.min(limit, 1000) : undefined;
    const paragraphs = await extractParagraphsFromEpub(fileBuffer, {
      maxParagraphs: normalizedLimit,
    });

    return {
      bookId,
      paragraphs,
      paragraphCount: paragraphs.length,
      hasMore:
        normalizedLimit !== undefined
          ? paragraphs.length >= normalizedLimit
          : false,
    };
  },
});
