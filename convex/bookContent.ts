"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { streamParagraphsFromEpub } from "./utils/epub";

const CHUNK_SIZE = 50;
const CHUNK_FLUSH_BATCH = 4;

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
      await ctx.runMutation(internal.books.updateProcessingStatus, {
        bookId,
        status: "failed",
      });
      throw new Error("This book is missing file storage. Please re-upload.");
    }

    try {
      await ctx.runMutation(internal.books.updateProcessingStatus, {
        bookId,
        status: "processing",
      });

      const fileBlob = await ctx.storage.get(book.storageId);
      if (!fileBlob) {
        await ctx.runMutation(internal.books.updateProcessingStatus, {
          bookId,
          status: "failed",
        });
        throw new Error("Unable to load book file from storage.");
      }
      const fileBuffer = await fileBlob.arrayBuffer();

      let chunkIndex = 0;
      let totalChunks = 0;
      let chunkParagraphs: Array<{ id: number; text: string }> = [];
      const chunkBuffer: Array<{ chunkIndex: number; paragraphs: Array<{ id: number; text: string }> }> = [];

      const flushChunks = async () => {
        if (chunkBuffer.length === 0) {
          return;
        }
        await ctx.runMutation(internal.books.insertChunks, {
          bookId,
          chunks: [...chunkBuffer],
        });
        chunkBuffer.length = 0;
      };

      const queueChunk = async (paragraphs: Array<{ id: number; text: string }>) => {
        if (paragraphs.length === 0) {
          return;
        }
        chunkBuffer.push({
          chunkIndex,
          paragraphs,
        });
        chunkIndex += 1;
        totalChunks += 1;
        if (chunkBuffer.length >= CHUNK_FLUSH_BATCH) {
          await flushChunks();
        }
      };

      await streamParagraphsFromEpub(fileBuffer, async (paragraph) => {
        chunkParagraphs.push(paragraph);
        if (chunkParagraphs.length >= CHUNK_SIZE) {
          const completedChunk = chunkParagraphs;
          chunkParagraphs = [];
          await queueChunk(completedChunk);
        }
      });

      if (chunkParagraphs.length > 0) {
        await queueChunk(chunkParagraphs);
        chunkParagraphs = [];
      }

      await flushChunks();

      await ctx.runMutation(internal.books.updateProcessingStatus, {
        bookId,
        status: "completed",
        totalChunks,
      });
    } catch (error) {
      await ctx.runMutation(internal.books.updateProcessingStatus, {
        bookId,
        status: "failed",
      });
      throw error;
    }
  },
});
