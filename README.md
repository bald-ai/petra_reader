# Petra Reader MVP-0

This repository will host the Petra Reader MVP stack:

- Next.js 14 (TypeScript) frontend
- Tailwind CSS styling
- Convex for realtime backend + database
- Netlify for hosting and CI/CD

## Phase 1: Environment Prep

Current status:

1. Node.js `v20.9.0` and npm `10.1.0` verified locally.
2. Git repository initialized and pointed to `https://github.com/bald-ai/petra_reader.git`.
3. `.gitignore` added to filter Node/Next.js/Tailwind/Convex artifacts.
4. Baseline README established (this file).

## Next Actions

1. Stage and commit the Phase 1 files:
   ```bash
   git add .gitignore README.md
   git commit -m "chore: complete MVP-0 phase 1 setup"
   ```
2. Push to the existing remote:
   ```bash
   git push origin main
   ```
3. Confirm the GitHub repository reflects the new commit.

Once this is done we can move on to Phase 2 (hosting accounts) and continue wiring the stack.
