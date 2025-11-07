"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { extractParagraphsFromEpub } from "./utils/epub";

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
