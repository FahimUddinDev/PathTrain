# PathTrain — Agent Instructions

Admin-only RAG + fine-tuning pipeline. Source of truth: `REQUIREMENTS.md`.

## Stack (do not substitute)

- **App:** Next.js 14+ App Router, TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **DB:** PostgreSQL + pgvector, Prisma ORM
- **Package manager:** pnpm only (`pnpm`, not npm/yarn)
- **Dataset gen / eval LLM:** Anthropic or OpenAI API
- **Playground answers:** Ollama `Qwen2.5-7B-Instruct` at `localhost:11434`
- **Fine-tune:** Python + Unsloth (QLoRA) in `/training-service` — triggered from Next.js via `child_process` or HTTP API

## Layout

```
app/                 # Next.js App Router (UI + API)
components/          # shadcn/ui + feature components
lib/ingestion/       # chunker.ts, embedder.ts
lib/rag/             # retriever.ts, prompt builder
prisma/              # schema + migrations
training-service/    # Unsloth QLoRA (Python, separate from Next.js)
```

## Rules

- App Router (`app/`) only. API in `app/api`; business logic in `lib/` — keep `route.ts` thin.
- All DB access through Prisma. Raw SQL only for pgvector (`$queryRaw`).
- Server Components by default; `"use client"` only when interactivity is needed.
- Tailwind + shadcn/ui; avoid custom CSS. Names in English.
- Admin-only. No student-facing features, public signup, or OCR/PDF ingestion.
- Build order: M0 → M1 → M2 → M3 → M4 (verify RAG) → M5 → M6 → M7 → M8.
- Secrets in `.env`: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_EMBEDDING_MODEL`. Never commit keys.
- Training jobs are async (queue + poll). Do not block an API route on a full train run.
