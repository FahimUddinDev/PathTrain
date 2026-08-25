# PathTrain

Admin-only RAG + fine-tuning content pipeline. See `REQUIREMENTS.md` and `AGENTS.md`.

## Stack

- Next.js 14+ (App Router, TypeScript)
- Tailwind + shadcn/ui
- PostgreSQL + pgvector, Prisma
- pnpm
- Anthropic / OpenAI (dataset generation)
- Ollama `Qwen2.5-7B-Instruct` (local RAG)
- Python + Unsloth QLoRA in `/training-service`

## Setup (Milestone 0)

1. Copy `.env.example` to `.env` and set `DATABASE_URL` plus `ADMIN_PASSWORD`.
2. PostgreSQL must have the [pgvector](https://github.com/pgvector/pgvector) extension available.
3. Install and migrate:

```bash
pnpm install
pnpm prisma migrate dev
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
