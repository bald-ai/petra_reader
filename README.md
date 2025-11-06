# Petra Reader – MVP-0 Wiring

This repo hosts the MVP scaffolding for Petra Reader:

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS 4
- Convex (to be linked)
- Netlify (deployment target)

## Phase 1 Status

- ✅ Node.js `v20.9.0` / npm `10.1.0` verified locally.
- ✅ Base Next.js + Tailwind project created with `create-next-app`.
- ✅ Convex SDK (`convex` npm package) installed and ready for initialization.
- ✅ Repository tracked in `https://github.com/bald-ai/petra_reader.git`.

## Local Development

Install dependencies (already done once by the scaffold, but available for fresh clones):

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Open http://localhost:3000 to view the app.

## Convex Setup (manual steps)

Convex needs an authenticated CLI session tied to your account, so run the following locally:

1. Authenticate and create the Convex project:
   ```bash
   npx convex dev
   ```
   - Sign in with GitHub when prompted.
   - Accept the prompts to create a new project.
   - This command generates the `convex/` directory and keeps the dev sync process running.

2. In a second terminal, seed sample data (optional but mirrors the quickstart):
   ```bash
   cat <<'EOF' > sampleData.jsonl
   {"text": "Buy groceries", "isCompleted": true}
   {"text": "Go for a swim", "isCompleted": true}
   {"text": "Integrate Convex", "isCompleted": false}
   EOF

   npx convex import --table tasks sampleData.jsonl
   ```

3. Add your first query by editing `convex/tasks.ts` (file created by the CLI) with:
   ```ts
   import { query } from "./_generated/server";

   export const get = query({
     args: {},
     handler: async (ctx) => {
       return await ctx.db.query("tasks").collect();
     },
   });
   ```

4. Provide the Convex URL to the frontend:
   - Copy `NEXT_PUBLIC_CONVEX_URL` from the CLI output.
   - Add it to `.env.local`:
     ```
     NEXT_PUBLIC_CONVEX_URL="https://YOUR-CONVEX-DEPLOYMENT.convex.cloud"
     ```

5. Restart `npm run dev` so the env var is picked up. After wiring the provider (coming next), the homepage will read from `api.tasks.get`.

## Next Steps

- Wire up `ConvexClientProvider` in `src/app/layout.tsx` and render Convex data on the landing page.
- Stage & commit the scaffold:
  ```bash
  git add .
  git commit -m "chore: scaffold Next.js + Tailwind base project"
  ```
- Push to `main` and verify GitHub updates.
- Proceed to Phase 4 (Netlify) once Convex is initialized and the “Add Book” flow is ready.
