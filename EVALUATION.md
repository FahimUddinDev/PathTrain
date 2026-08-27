# PathTrain — Implementation Evaluation Report

**Evaluated against:** `REQUIREMENTS.md`
**Date:** 2026-08-26
**Commit at time of audit:** `c0dd237` — *updated ui aseper module 7 and 8 and change example anthropics to menual*
**Method:** Read-only audit of every functional requirement (FR-M0-01 → FR-M8-04) and all eight non-functional requirements against the actual codebase.

> **Update — 2026-08-26.** Sections 1–14 are the original audit and are kept as the historical record. All 16 gaps have since been closed; see [§16 Gap closure](#16-gap-closure--2026-08-26) for what changed.

---

## 1. Headline verdict

The project is substantially built end to end. All nine milestones have shipped code, and the core pipeline — curriculum → chunking → embedding → retrieval → playground → dataset export → training job → Ollama registration — is wired together and functional.

| Outcome | Count | Share |
|---|---|---|
| Fully met | 33 | 67% |
| Partial | 13 | 27% |
| Missing | 3 | 6% |
| **Total requirements** | **49** | |

The three genuinely missing features are all in the fine-tuning half of the product: bulk generation across multiple topics (FR-M6-07), auto-generate all five types on topic select (FR-M6-08), and the one-click export-to-training path (FR-M7-07).

The most consequential *partial* is that the AI generation endpoint exists and works, but nothing in the UI calls it, because the Examples page was converted to manual entry in the most recent commit.

---

## 2. Scorecard by milestone

| Milestone | Met | Partial | Missing | State |
|---|---|---|---|---|
| M0 Project setup | 5 | 0 | 0 | Complete |
| M1 Curriculum | 1 | 4 | 0 | Create/list only |
| M2 Topic ingestion | 4 | 1 | 0 | Nearly complete |
| M3 Embedding | 2 | 3 | 0 | Works, rough edges |
| M4 RAG playground | 6 | 0 | 0 | Complete |
| M5 Ollama | 3 | 1 | 0 | Complete, undocumented |
| M6 Dataset generation | 3 | 3 | 2 | Weakest area |
| M7 Export + job | 6 | 0 | 1 | Nearly complete |
| M8 Fine-tuned eval | 3 | 1 | 0 | Nearly complete |

---

## 3. Milestone 0 — Project setup

**Status: Complete (5/5)**

| ID | Verdict | Evidence |
|---|---|---|
| FR-M0-01 | Met | Next.js 14.2, Prisma 6.13, pnpm 9.15, Tailwind, 10 shadcn components in `components/ui/` |
| FR-M0-02 | Met | `CREATE EXTENSION vector` in `prisma/migrations/20260825120000_init/`; 768-d column; **ivfflat cosine index** `Chunk_embedding_idx` |
| FR-M0-03 | Met | `datasource db { url = env("DATABASE_URL") }` |
| FR-M0-04 | Met | HMAC-signed session cookie, `httpOnly` + `sameSite=lax` + `secure` in prod, timing-safe password compare |
| FR-M0-05 | Met | `app/(admin)/layout.tsx` sidebar + `SidebarNav`; dashboard intentionally empty per spec |

### Security observations (recorded, not blocking)

1. `SESSION_SECRET` falls back to `ADMIN_PASSWORD` when unset (`lib/auth/session.ts:10`), and `.env.example` does not define `SESSION_SECRET` — so in practice the HMAC signing key equals the login password.
2. Session payload contains only `{ exp }` with no identity binding; any valid signed token grants access.
3. No rate limiting on `POST /api/auth/login`.

---

## 4. Milestone 1 — Curriculum management

**Status: Partial (1 met / 4 partial) — weakest foundation area**

| ID | Verdict | Gap |
|---|---|---|
| FR-M1-01 Class CRUD | Partial | Create + list only; **no edit, no delete** |
| FR-M1-02 Subject CRUD | Partial | Create + list only; **no edit, no delete** |
| FR-M1-03 Chapter CRUD | Partial | Create + list only; **no edit, no delete** |
| FR-M1-04 Cascade dropdown | Met | `components/curriculum/cascade-select.tsx` with dependent resets |
| FR-M1-05 Delete behaviour (P1) | Partial | `onDelete: Cascade` defined in schema but **unreachable** — no delete path exists |

The requirement text for FR-M1-01/02/03 explicitly says "create, **edit**, list". The API routes at `/api/curriculum/{classes,subjects,chapters}` expose only `GET` and `POST`. There is no `PATCH`, `PUT`, or `DELETE` anywhere under `/api/curriculum/`, and `lib/curriculum/service.ts` exports only `list*`, `create*`, and `listCurriculumTree`. The UI has "Add" dialogs and read-only tables.

`Chapter.order` is correctly implemented: auto-appended on create, settable in the UI, and used for sorting (`orderBy: [{ order: "asc" }, { createdAt: "asc" }]`).

---

## 5. Milestone 2 — Topic ingestion

**Status: 4 met / 1 partial**

| ID | Verdict | Note |
|---|---|---|
| FR-M2-01 Entry form | Met | Cascade + name + raw text textarea |
| FR-M2-02 Topic list | Met | Name, chapter path, status, chunk count |
| FR-M2-03 Chunker | Met | Real tokenizer, topic prefix, order preserved, boundary-aware splitting |
| FR-M2-04 Chunk preview + edit | **Partial** | After-submit preview only; **no before-submit preview, no chunk edit** |
| FR-M2-05 Persist chunks | Met | Transactional create in `lib/ingestion/ingest-topic.ts` |

The chunker exceeds spec in one respect: it uses a real tokenizer (`gpt-tokenizer` cl100k_base) rather than a character heuristic, and splits on paragraph → line → sentence → word so it never cuts mid-word.

Two caveats:

- `MIN_TOKENS = 300` is exported from `lib/ingestion/chunker.ts:3` but **never used in the splitting logic**, so a trailing chunk can fall below 300 tokens.
- FR-M2-04 requires preview and edit "before/after submit". There is no chunk update API (`/api/chunks/[id]` does not exist), no editable chunk UI, and the `Chunk.editable` column is never read or written. Editing topic text re-chunks everything wholesale instead.

---

## 6. Milestone 3 — Embedding + vector store

**Status: 2 met / 3 partial**

| ID | Verdict | Gap |
|---|---|---|
| FR-M3-01 Embedder | Met | Ollama `nomic-embed-text`, 768-d, concurrency 6 |
| FR-M3-02 Vector metadata | **Partial** | Derived via SQL JOINs, not stored per-vector; `page` never populated |
| FR-M3-03 Re-embed on edit | **Partial** | Only via the Save button chain; not automatic |
| FR-M3-04 Status flow | Met | All five states set in code |
| FR-M3-05 Failure reason (P1) | **Partial** | Topic-level yes; chunk-level `embeddingStatus: failed` never set |

Details:

- **FR-M3-02** — class/subject/chapter identity is resolved at query time through joins from `Chunk` up to `Subject` in `lib/db/vector.ts`. Filters work correctly, but this diverges from the spec's separate `Embedding` entity with a metadata payload. `Chunk.page` exists and renders when present, but nothing ever assigns it.
- **FR-M3-03** — re-embedding happens only when the admin clicks Save in `TopicActions`, which chains `PATCH → /chunk → /embed`. Calling `PATCH /api/topics/[id]` directly does not re-chunk or re-embed. Newly created topics stay at `chunked` until Embed is pressed manually.
- **FR-M3-05** — `updateChunkEmbedding` always writes `'embedded'`; no code path sets a chunk to `failed`.

---

## 7. Milestone 4 — RAG retriever + playground

**Status: Complete (6/6) — strongest milestone**

| ID | Verdict | Evidence |
|---|---|---|
| FR-M4-01 Retriever | Met | `$queryRaw` with pgvector `<=>`; score returned as `1 - (embedding <=> query)` |
| FR-M4-02 Prompt builder | Met | `lib/rag/prompt-builder.ts` returns `{ system, user }` |
| FR-M4-03 Query API | Met | `/api/test/query` imports no LLM; returns `{ chunks }` only |
| FR-M4-04 Chat API | Met | NDJSON streaming with `meta` / `token` / `done` / `error` events |
| FR-M4-05 Playground UI | Met | Query box, four filter dropdowns, chunks and answer side by side |
| FR-M4-06 Prompt editor | Met | Editable textarea; explicitly does not re-embed |

---

## 8. Milestone 5 — Local model serving (Ollama)

**Status: 3 met / 1 partial**

| ID | Verdict | Gap |
|---|---|---|
| FR-M5-01 Setup docs | **Partial** | No install/pull/run instructions anywhere |
| FR-M5-02 Chat via Ollama | Met | No leftover cloud path in the chat route |
| FR-M5-03 Env model + selector | Met | `OLLAMA_MODEL` + UI dropdown |
| FR-M5-04 Clear error (P1) | Met | User sees a specific, actionable message |

`README.md` mentions Ollama only in a stack list, `docs/` does not exist, and `scripts/` is empty. A new operator has no instructions for `ollama serve`, `ollama pull qwen2.5:7b-instruct`, or `ollama pull nomic-embed-text`.

Error handling is genuinely good — when Ollama is down the user sees:

> Ollama is not reachable at http://localhost:11434. Start Ollama and pull qwen2.5:7b-instruct.

Verified: `lib/llm/client.ts` (Anthropic) is imported **only** by `lib/training/example-generator.ts`, never by the chat path.

---

## 9. Milestone 6 — Training dataset generation

**Status: 3 met / 3 partial / 2 missing — weakest milestone**

| ID | Verdict | Gap |
|---|---|---|
| FR-M6-01 Generate API | **Partial** | API works but **no UI calls it**; Anthropic only, no OpenAI; `ANTHROPIC_API_KEY` absent from `.env` |
| FR-M6-02 qna / mcq / srijonsil | Met | Distinct prompt builder per type |
| FR-M6-03 Evaluation examples | **Partial** | One random scenario per call, not correct + partial + wrong as a set |
| FR-M6-04 Multi-explain | Met | 2–3 styles in a single output |
| FR-M6-05 Persist as `generated` | Met | Note: AI path does not set `metadata`; manual path does |
| FR-M6-06 Review/Edit UI | **Partial** | Edit/approve/reject work; **no Generate section, no delete** |
| FR-M6-07 Bulk generate | **Missing** | Single `topicId` only; no `topicIds[]`, no `chapterId`, no batch loop |
| FR-M6-08 Auto all five types | **Missing** | `generateExamplesForTopic` helper exists but is called from nowhere |

The orphaned-endpoint finding is worth stating precisely: a repository-wide search for the string `generate-examples` now matches **only `REQUIREMENTS.md`**. The Examples panel states *"Enter instruction / input / output manually. No AI generation."*

There is also no way to delete a training example — `/api/training/examples/[id]` exports only `PATCH`, and no delete control exists in the UI.

---

## 10. Milestone 7 — Dataset export + training job

**Status: 6 met / 1 missing**

| ID | Verdict | Note |
|---|---|---|
| FR-M7-01 Dataset builder | Met | Approved-only + class/subject/chapter filters |
| FR-M7-02 JSONL export | Met | `instruction` / `input` / `output` / `metadata` |
| FR-M7-03 TrainingDataset row | Met | `exampleCount`, `log`, `jsonlPath`, `filterCriteria`, `exportedAt` |
| FR-M7-04 Start job | Met | `child_process` spawn, HTTP 202, non-blocking |
| FR-M7-05 Status polling | Met | 2.5 s poll while queued/running |
| FR-M7-06 Logs viewer | Met | Auto-scrolling `<pre>` |
| FR-M7-07 One-click path | **Missing** | Two pages, minimum two actions |

Export ordering is `orderBy: [{ createdAt: "asc" }, { id: "asc" }]`, which satisfies NFR-06 determinism.

For FR-M7-07, the current flow is: export on `/training/datasets` → follow a link to `/training/jobs` → re-select the dataset from a dropdown → click Start training. There is no combined endpoint, no single button, and the just-exported dataset is not pre-selected.

### Environment blocker (not a code defect)

- `training-service/.venv` exists but contains only `pip`, `setuptools`, `wheel`, and `packaging`. None of `torch`, `datasets`, `transformers`, `peft`, `trl`, or `unsloth` are installed — this is the cause of `ModuleNotFoundError: No module named 'datasets'`.
- The host reports **AMD Radeon(TM) Graphics** with no NVIDIA GPU. Unsloth QLoRA requires CUDA, so local training cannot run on this machine regardless of installation.
- There is no `training-service/README.md` documenting venv setup or GPU prerequisites.

---

## 11. Milestone 8 — Fine-tuned model integration + evaluation

**Status: 3 met / 1 partial**

| ID | Verdict | Gap |
|---|---|---|
| FR-M8-01 LoRA → Ollama | Met | Modelfile `FROM {base}` + `ADAPTER {path}` |
| FR-M8-02 Model switch | Met | Fine-tuned option disabled until registered |
| FR-M8-03 Side-by-side compare | Met | Concurrent streams, same query, shared chunks |
| FR-M8-04 Regression tracking | **Partial** | UI state only — **not persisted** |

The playground renders a verdict dropdown and notes textarea after comparison, but there is no save handler, no API route, and **no Prisma model** for regressions. The schema contains only `TrainingExample`, `TrainingDataset`, and `TrainingJob`. Values live in React `useState` and are lost on refresh, so nothing is actually tracked.

---

## 12. Non-functional requirements

| ID | Verdict | Note |
|---|---|---|
| NFR-01 Admin-only | Met | Middleware protects all routes except login endpoints; API returns 401 |
| NFR-02 Secrets in env | Met | `.env` gitignored; no key patterns in tracked files |
| NFR-03 Metadata filters | Met | Applied as SQL `WHERE` clauses |
| NFR-04 Chunk 300–500 tokens | **Partial** | Upper bound enforced; final chunk may fall below 300 |
| NFR-05 Retrieval visible | Met | Chunks with percentage score badges |
| NFR-06 Deterministic export | Met | Stable two-key ordering |
| NFR-07 Async jobs | Met | 202 response, background spawn, polling |
| NFR-08 Failures surfaced | **Partial** | Embed good; train reason only in logs; generate failures unreachable from UI |

---

## 13. Cross-cutting observations

### No tests, no CI

There are zero test files, no Vitest/Jest/Playwright config, and no `.github/workflows`. For a project with a deterministic-export requirement (NFR-06) and a token-range requirement (NFR-04) — both precisely the kind of behaviour a unit test pins down — this is the largest engineering risk in the repository. There is also no standalone `typecheck` script in `package.json`; type errors surface only during `next build`.

### Committed export artifact

`data/exports/class-6-2026-08-26T03-45-17-865Z.jsonl` is tracked in git. `/data/exports/` is **not** in `.gitignore`, unlike `/data/adapters/` and `/data/datasets/`. Generated artifacts will keep accumulating in version control.

### Schema drift from the spec

| `REQUIREMENTS.md` §5 | Actual schema |
|---|---|
| `Chunk.index` | `Chunk.chunkOrder` |
| `TrainingJob.finishedAt` | `TrainingJob.completedAt` |
| `TrainingDataset.filters` | `TrainingDataset.filterCriteria` |
| Separate `Embedding` entity | Vector column on `Chunk` |

All cosmetic and internally consistent, but the document no longer describes the schema.

### Stale requirements document

The header still reads *"Status: Draft — Milestone 0 not started"* after all nine milestones have shipped. The acceptance checklist (lines 485–493) has every box unchecked **except** the final M8 comparison item — the reverse of reality, since several earlier items are genuinely complete.

---

## 14. Priority-ranked gap list

| # | Gap | Requirements | Severity |
|---|---|---|---|
| 1 | Reconnect AI generation to the Examples UI | FR-M6-01, 07, 08 | High |
| 2 | Add curriculum edit + delete | FR-M1-01/02/03/05 | High |
| 3 | Persist regression notes (model + API) | FR-M8-04 | Medium |
| 4 | One-click export → train | FR-M7-07 | Medium |
| 5 | Chunk-level edit with re-embed trigger | FR-M2-04, FR-M3-03 | Medium |
| 6 | Setup docs: Ollama pull, Python venv, GPU prerequisite | FR-M5-01 | Medium |
| 7 | Test harness for chunker token range + export determinism | NFR-04, NFR-06 | Medium |
| 8 | Delete control for training examples | FR-M6-06 | Low |
| 9 | Set `SESSION_SECRET` explicitly in `.env.example` | NFR-02 | Low |
| 10 | Gitignore `/data/exports/`; untrack the committed JSONL | — | Low |
| 11 | Refresh `REQUIREMENTS.md` status header + checklist | — | Low |

---

## 15. Product decisions recorded

- **Example generation direction: manual only.** The manual entry form is the single authoring path. `lib/training/example-generator.ts`, `lib/llm/client.ts`, and `POST /api/training/generate-examples` were deleted, and `ANTHROPIC_API_KEY` was removed from the project. FR-M6-01/07/08 are re-interpreted as manual equivalents — a persist endpoint, bulk approve/reject, and a five-type coverage indicator — and `REQUIREMENTS.md` §6 records that reinterpretation.
- **Local training viability: interface verified, execution deferred.** With no NVIDIA GPU on this host, Unsloth QLoRA cannot execute locally. The trigger, queueing, status polling, and log streaming are all exercised end to end; the run itself fails at `import` with `ModuleNotFoundError`, which is the documented expected outcome. `training-service/README.md` states the CUDA prerequisite, so the fine-tune must be run on a CUDA host before M8 can be closed on evidence rather than wiring.

---

## 16. Gap closure — 2026-08-26

Every gap in §14 has been addressed. What changed, in the order the milestones were worked:

| # | Gap | Resolution |
|---|---|---|
| 1 | AI generation vs Examples UI | Resolved by descoping to manual (see §15) plus bulk approve/reject and the coverage indicator |
| 2 | Curriculum edit + delete | `PATCH`/`DELETE` on `classes|subjects|chapters/[id]`, with a delete dialog that counts descendants first |
| 3 | Regression notes | `RegressionNote` model + migration, `POST`/`GET /api/playground/regressions`, save button and saved-notes list |
| 4 | One-click export → train | `POST /api/training/dataset/export-and-train` and the "Export & start training" button |
| 5 | Chunk edit + re-embed | `POST /api/topics/preview-chunks`, `PATCH .../chunks/[chunkId]`, editable chunk cards, re-embed of only the edited chunk |
| 6 | Setup docs | `docs/SETUP.md` and `training-service/README.md` |
| 7 | Test harness | Vitest with 11 tests covering chunker token range (NFR-04) and export determinism (NFR-06) |
| 8 | Delete a training example | `DELETE /api/training/examples/[id]` with in-card confirmation |
| 9 | `SESSION_SECRET` | Added to `.env.example` with a note on the `ADMIN_PASSWORD` fallback |
| 10 | Export artifacts in git | `/data/exports/` gitignored and the committed JSONL untracked |
| 11 | Stale requirements doc | Status header, M6 section, env table, and acceptance checklist refreshed |

### Two defects found while closing the gaps

- **A fresh database could not be migrated at all.** `20260825120001_align_requirements_fields` ran `CREATE INDEX "Chunk_embedding_idx"`, which the init migration had already created and nothing dropped. `prisma migrate deploy` against an empty database failed partway through with `42P07 relation already exists`, so no new contributor could follow `docs/SETUP.md` to a working state. The index is now created with `IF NOT EXISTS`, and a full replay onto a scratch database was verified clean.
- **Finished training jobs showed no logs.** The jobs panel only fetched logs while polling an active job, so a job that had already failed displayed "Waiting for training output…" permanently — hiding the very error a reader needs. Logs are now fetched once on load regardless of status.
