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

## Google Translate credentials

The project uses `@google-cloud/translate` for translation functionality. Drop the service-account JSON in the project root as
`gen-lang-client-0029722726-1c17e946b90e.json` (gitignored). The npm scripts automatically export:

```
GOOGLE_APPLICATION_CREDENTIALS=./gen-lang-client-0029722726-1c17e946b90e.json
GOOGLE_CLOUD_PROJECT=gen-lang-client-0029722726
```

For Netlify or other hosts, set both env vars (the project uses the `GOOGLE_CLOUD_PROJECT` name everywhere).

## Convex Setup (manual steps)

Convex uses CLI auth tied to your account. For fresh environments:

1. Authenticate and start the dev deployment:
   ```bash
   npx convex dev
   ```
   - Sign in with GitHub when prompted (device flow).
   - Create/select the `petra_reader` project.
   - The command stays running to sync the functions in `convex/`.

2. (Optional) Seed sample data via the mutation:
   ```bash
   npx convex run books:add --title "Pattern Recognition"
   npx convex run books:add --title "The Left Hand of Darkness"
   npx convex run books:add --title "Neuromancer"
   ```

3. Ensure `.env.local` contains the values printed by the CLI:
   ```
   CONVEX_DEPLOYMENT=dev:...
   NEXT_PUBLIC_CONVEX_URL=https://....convex.cloud
   ```

The backend logic lives in `convex/schema.ts` and `convex/books.ts`, and the homepage consumes the `books.list` query + `books.add` mutation in real time.

## Next Steps

- ✅ Convex provider is wired in `src/app/layout.tsx`.
- ✅ Homepage renders the Convex book list and supports the “Add Book” mutation.
- ☐ Move to Phase 4 (Netlify) by connecting the repo and verifying deploys.
- ☐ Expand datastore & UI once hosting loop is proven.
