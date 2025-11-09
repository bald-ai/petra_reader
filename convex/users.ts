import { mutation } from "./_generated/server";

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated call to mutation");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) {
      await ctx.db.insert("users", {
        name: identity.name ?? "Unknown",
        tokenIdentifier: identity.tokenIdentifier,
        email: identity.email,
        avatarUrl: identity.pictureUrl,
      });
    }
  },
});

