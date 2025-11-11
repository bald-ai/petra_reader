import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }).index("by_token", ["tokenIdentifier"]),
  
  books: defineTable({
    title: v.string(),
    author: v.optional(v.union(v.string(), v.null())),
    sizeBytes: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    coverUrl: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    lastOpenedAt: v.optional(v.union(v.number(), v.null())),
    lastReadParagraphId: v.optional(v.union(v.number(), v.null())),
    userId: v.id("users"),
    processingStatus: v.optional(v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed"))),
    totalChunks: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_title", ["title"])
    .index("by_created_at", ["createdAt"])
    .index("by_last_opened_at", ["lastOpenedAt"]),
  
  bookChunks: defineTable({
    bookId: v.id("books"),
    chunkIndex: v.number(),
    paragraphs: v.array(v.object({
      id: v.number(),
      text: v.string(),
    })),
  })
    .index("by_book", ["bookId", "chunkIndex"]),
});
