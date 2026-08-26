# PathTrain

Admin-only RAG + fine-tuning content pipeline. See `REQUIREMENTS.md` and `AGENTS.md`.

## Stack

- Next.js 14+ (App Router, TypeScript)
- Tailwind + shadcn/ui
- PostgreSQL + pgvector, Prisma
- pnpm
- Ollama `Qwen2.5-7B-Instruct` (local RAG) + `nomic-embed-text` (embeddings)
- Python + Unsloth QLoRA in `/training-service`

Training examples are written by hand in the admin UI — there is no LLM generation step.

## Setup

Full instructions, including pgvector and Ollama, are in [docs/SETUP.md](docs/SETUP.md).
The short version:

```bash
cp .env.example .env         # set DATABASE_URL and ADMIN_PASSWORD
ollama serve                 # then: ollama pull qwen2.5:7b-instruct && ollama pull nomic-embed-text
pnpm install
pnpm prisma migrate deploy
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test          # `pnpm test:watch` while developing
```

Tests cover the two behaviours most likely to regress silently: the chunker's 300–500 token
range (NFR-04) and byte-for-byte deterministic JSONL export (NFR-06).

## Fine-tuning

Training runs in [`training-service/`](training-service/README.md) and **requires an NVIDIA
GPU with CUDA**. Everything up to and including the JSONL export works without one.
