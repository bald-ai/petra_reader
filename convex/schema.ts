import { defineSchema, defineTable } from "convex/schema";
import { v } from "convex/values";

export default defineSchema({
  books: defineTable({
    title: v.string(),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),
});
