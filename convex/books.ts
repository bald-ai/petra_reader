import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("books")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: {
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.title.trim();
    if (trimmed.length === 0) {
      throw new Error("Title cannot be empty.");
    }
    await ctx.db.insert("books", {
      title: trimmed,
      createdAt: Date.now(),
    });
  },
});
