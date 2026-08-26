# PathTrain setup

Everything PathTrain needs runs locally: PostgreSQL with pgvector, Ollama, and the Next.js app.
Fine-tuning is the one exception — it needs an NVIDIA GPU, see [training-service/README.md](../training-service/README.md).

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18.18+ | Next.js 14 requirement |
| pnpm | 9+ | `corepack enable pnpm` |
| PostgreSQL | 14+ | must be able to load pgvector |
| Ollama | latest | serves both the chat and embedding models |

## 2. PostgreSQL + pgvector

Create the database:

```bash
createdb pathtrain
```

Install the [pgvector](https://github.com/pgvector/pgvector) extension for your Postgres build,
then enable it inside the database:

```bash
psql -d pathtrain -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

The Prisma migrations also run `CREATE EXTENSION IF NOT EXISTS vector`, but the extension
files must already be installed on the server for that to succeed.

If you would rather not install Postgres directly:

```bash
docker run -d --name pathtrain-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=pathtrain \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

## 3. Ollama

PathTrain uses two models: one for Playground answers and one for embeddings.
The embedding model must be `nomic-embed-text` — `Chunk.embedding` is a `vector(768)`
column and the embedder rejects any vector of a different width.

```bash
ollama serve

# in another shell
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

Confirm both are present:

```bash
ollama list
```

`ollama serve` must stay running. Embedding a topic or asking a Playground question while it
is down fails with `Ollama is not reachable at http://localhost:11434`.

## 4. Environment variables

Copy `.env.example` to `.env` and fill it in.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `ADMIN_USERNAME` | yes | admin login name |
| `ADMIN_PASSWORD` | yes | admin login password |
| `SESSION_SECRET` | recommended | HMAC key for the session cookie; falls back to `ADMIN_PASSWORD` |
| `OLLAMA_BASE_URL` | no | defaults to `http://localhost:11434` |
| `OLLAMA_MODEL` | no | Playground base model, defaults to `qwen2.5:7b-instruct` |
| `OLLAMA_EMBEDDING_MODEL` | no | defaults to `nomic-embed-text` |
| `OLLAMA_FINETUNED_MODEL` | no | model tag registered after a training run |
| `PYTHON_PATH` | for training | interpreter used to launch `training-service/train.py` |

Leaving `SESSION_SECRET` empty signs sessions with `ADMIN_PASSWORD`, so rotating the
password logs everyone out.

## 5. Install and run

```bash
pnpm install
pnpm prisma migrate deploy   # use `migrate dev` when changing the schema
pnpm dev
```

Checks, all of which should pass on a clean checkout:

```bash
pnpm lint
pnpm typecheck
pnpm test          # `pnpm test:watch` while developing
```

Open [http://localhost:3000](http://localhost:3000) and sign in with `ADMIN_USERNAME` /
`ADMIN_PASSWORD`. Every route except `/login` requires a session.

## 6. Verify the pipeline

1. **Curriculum** — add a Class, Subject, and Chapter.
2. **Topics → New topic** — pick the chapter, paste textbook text, click *Preview chunks* to
   check the 300–500 token split, then *Create topic*.
3. On the topic page, click *Embed*. The status should move `chunked → embedding → embedded`.
   If a single chunk fails, the topic shows `failed` with the chunk count in its reason; fix
   the chunk and press *Embed* again to retry just that chunk.
4. **Examples** — add training examples by hand. With a topic selected, the coverage badges
   show which of the five types it still lacks. Approve them, in bulk if you like.
5. **Datasets** — export the approved examples to JSONL, or use *Export & start training* to
   export and queue a job in one step.
6. **Playground** — ask a question about the topic and confirm the retrieved chunks and answer.
   Once a fine-tuned model is registered, *Compare both* runs base and fine-tuned side by side
   and the verdict can be saved as a regression note.

## Troubleshooting

**`Ollama is not reachable`** — `ollama serve` is not running, or `OLLAMA_BASE_URL` points
somewhere else.

**`Expected 768-d embedding from <model>, got N`** — `OLLAMA_EMBEDDING_MODEL` is set to a
model with a different vector width. Use `nomic-embed-text`.

**`type "vector" does not exist`** — pgvector is not installed on the Postgres server. Install
the extension files, then re-run `pnpm prisma migrate deploy`.

**Login always fails** — `ADMIN_PASSWORD` is unset. The login route returns
`Admin login is not configured` in that case.
