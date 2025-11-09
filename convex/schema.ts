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
    userId: v.id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_title", ["title"])
    .index("by_created_at", ["createdAt"])
    .index("by_last_opened_at", ["lastOpenedAt"]),
});
