# PathTrain — Software Requirements

**Product:** Admin-only RAG + Fine-tuning Content Pipeline  
**Document type:** Requirements specification (derived from milestone plan)  
**Status:** Draft — Milestone 0 not started  
**Audience:** Implementation, review, and acceptance

---

## 1. Purpose

PathTrain is an internal admin application for preparing curriculum content, testing retrieval-augmented generation (RAG), generating fine-tuning datasets, and triggering / evaluating local model fine-tuning.

The fine-tuned model must be able to:

1. **Generate its own questions** — multiple choice (MCQ) and srijonsil / creative.
2. **Mark student answers** — when the score is low, explain the mistake and how to improve.
3. **Explain a topic in multiple ways** — including real-life examples.

This document is the source of truth for what to build, in what order, and when each milestone is done.

---

## 2. Scope

### 2.1 In scope

- Admin-only web app (login required for all features).
- Curriculum data entry: Class → Subject → Chapter → Topic.
- Text ingestion, chunking, embedding, and vector search (pgvector).
- RAG playground for retrieval and answer quality testing.
- Local model serving via Ollama.
- Synthetic training-example generation (5 types), review/approval, JSONL export.
- Fine-tuning job trigger, status, logs, and playground comparison of base vs fine-tuned model.

### 2.2 Out of scope

- Student-facing UI, student accounts, classrooms, or homework submission.
- Public registration or multi-tenant SaaS.
- OCR / PDF / image book ingestion (Milestone 2 is **manual text paste only**).
- Production GPU cluster orchestration beyond a training trigger + status polling.
- Mobile apps.

---

## 3. Users and access

| Role | Description | Access |
|---|---|---|
| Admin | Curriculum operator / ML operator | All features after login |

- Single simple admin login (not a public app).
- Unauthenticated users must be redirected to login.
- No student or teacher roles in this phase.

---

## 4. Tech stack (locked — do not substitute)

| Layer | Choice |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| UI | Tailwind CSS + shadcn/ui |
| DB | PostgreSQL + pgvector extension |
| ORM | Prisma |
| Package manager | pnpm |
| LLM (dataset gen + evaluation) | Anthropic or OpenAI API |
| Local model (RAG answers) | Ollama `Qwen2.5-7B-Instruct` at `localhost:11434` |
| Fine-tune | Python + Unsloth (QLoRA) in `/training-service`, triggered from Next.js via `child_process` or HTTP API |
| Auth | Simple admin login (session or equivalent) |

---

## 5. Domain model

### 5.1 Curriculum hierarchy

```
Class
  └── Subject (belongs to one Class)
        └── Chapter (belongs to one Subject, ordered)
              └── Topic (belongs to one Chapter)
                    └── Chunk[] (text slices of Topic)
                    └── Embedding[] (vector per Chunk, via pgvector)
                    └── TrainingExample[] (generated/reviewed pairs)
```

### 5.2 Core entities (logical)

**Class**

| Field | Notes |
|---|---|
| id | Primary key |
| name | e.g. `Class 6` |
| createdAt / updatedAt | Audit |

**Subject**

| Field | Notes |
|---|---|
| id | Primary key |
| classId | FK → Class |
| name | e.g. `Science` |

**Chapter**

| Field | Notes |
|---|---|
| id | Primary key |
| subjectId | FK → Subject |
| name | Chapter title |
| order | Integer sort order within Subject |

**Topic**

| Field | Notes |
|---|---|
| id | Primary key |
| chapterId | FK → Chapter |
| name | Topic title |
| rawText | Full pasted book/content text |
| status | `draft` \| `chunked` \| `embedding` \| `embedded` \| `failed` |
| failureReason | Optional, when status is `failed` |

**Chunk**

| Field | Notes |
|---|---|
| id | Primary key |
| topicId | FK → Topic |
| index | Order within topic |
| text | Chunk body (topic name prefixed) |
| tokenCount | Approximate tokens |
| page | Optional page metadata |
| editable | Admin may edit before/after embed |

**Embedding / Vector row**

| Field | Notes |
|---|---|
| chunkId | FK → Chunk |
| vector | pgvector embedding |
| metadata | classId, subjectId, chapterId, topicId, page, etc. |

**TrainingExample**

| Field | Notes |
|---|---|
| id | Primary key |
| topicId | FK → Topic |
| type | `qna` \| `mcq` \| `srijonsil` \| `evaluation` \| `multi_explain` |
| instruction | JSONL `instruction` |
| input | JSONL `input` |
| output | JSONL `output` |
| metadata | class, subject, topic, type |
| status | `generated` \| `approved` \| `rejected` |
| reviewNotes | Optional admin notes |

**TrainingDataset**

| Field | Notes |
|---|---|
| id | Primary key |
| name | Human label |
| filters | class / subject / chapter used to select examples |
| exampleCount | Number of approved examples included |
| jsonlPath or blob | Exported file location |
| createdAt | When built |
| log | Creation log |

**TrainingJob**

| Field | Notes |
|---|---|
| id | Primary key |
| datasetId | FK → TrainingDataset |
| status | `queued` \| `running` \| `completed` \| `failed` |
| logs | Progress / loss text |
| startedAt / finishedAt | Timestamps |
| adapterPath / modelTag | Result artifact reference |

---

## 6. Functional requirements by milestone

IDs are stable. Priority: **P0** = must-have for that milestone’s “done when”.

---

### Milestone 0 — Project Setup

Foundation. No curriculum features yet.

| ID | Requirement | Priority |
|---|---|---|
| FR-M0-01 | Scaffold Next.js 14+ App Router (TypeScript) + Prisma + PostgreSQL monolith with pnpm, Tailwind, and shadcn/ui. | P0 |
| FR-M0-02 | Enable pgvector on the database (migration or SQL). | P0 |
| FR-M0-03 | App connects to Postgres via env (`DATABASE_URL`). | P0 |
| FR-M0-04 | Simple admin login; unauthenticated routes are blocked. | P0 |
| FR-M0-05 | Admin shell: sidebar + navigation + empty dashboard. | P0 |

**Done when:** app boots, DB migrates, admin can log in and see an empty dashboard.

---

### Milestone 1 — Curriculum Management

| ID | Requirement | Priority |
|---|---|---|
| FR-M1-01 | Class CRUD: create, edit, list. | P0 |
| FR-M1-02 | Subject CRUD under a given Class. | P0 |
| FR-M1-03 | Chapter CRUD under a given Subject, with `order`. | P0 |
| FR-M1-04 | Cascade dropdown UI: Class filters Subject; Subject filters Chapter. | P0 |
| FR-M1-05 | Deleting a Class/Subject/Chapter must not leave orphaned children (define cascade or block-with-error; pick one and apply consistently). | P1 |

**Done when:** Class → Subject → Chapter cascade dropdown filters correctly.

---

### Milestone 2 — Topic Ingestion (Text Input)

| ID | Requirement | Priority |
|---|---|---|
| FR-M2-01 | Topic entry form: Chapter (via cascade) + Topic name + raw text textarea. | P0 |
| FR-M2-02 | Topic list showing name, chapter path, and status (`draft` / `chunked` / `embedded` / `failed`). | P0 |
| FR-M2-03 | Chunker at `lib/ingestion/chunker.ts`: split Topic text into **300–500 token** chunks; prefix each chunk with topic name. | P0 |
| FR-M2-04 | Chunk preview and edit before/after submit. | P0 |
| FR-M2-05 | Submitting a Topic persists chunks to the database. | P0 |

**Done when:** pasting text and submitting produces chunks saved to the DB.

**Chunker rules**

- Target size: 300–500 tokens per chunk.
- Prefix: topic name at the start of each chunk (for retrieval context).
- Preserve order (`index`).
- Prefer splitting on paragraph / sentence boundaries when possible (do not cut mid-word).

---

### Milestone 3 — Embedding + Vector Store

| ID | Requirement | Priority |
|---|---|---|
| FR-M3-01 | Embedder at `lib/ingestion/embedder.ts`: embed each chunk and store in pgvector. | P0 |
| FR-M3-02 | Store metadata with each vector: class, subject, chapter, topic ids; page if present. | P0 |
| FR-M3-03 | Editing Topic text or a chunk triggers re-embedding of affected chunks. | P0 |
| FR-M3-04 | Topic status flow: `draft` → `embedding` → `embedded` or `failed`. | P0 |
| FR-M3-05 | Failed embeds set `failed` and a readable `failureReason`. | P1 |

**Done when:** submitting a Topic ends with a searchable vector row in pgvector.

**Status note:** Milestone 2 lists `chunked`; Milestone 3 lists `draft → embedding → embedded/failed`. Implementation must use one coherent status machine, e.g.:

`draft` → `chunked` → `embedding` → `embedded` | `failed`

---

### Milestone 4 — RAG Retriever + Playground

| ID | Requirement | Priority |
|---|---|---|
| FR-M4-01 | Retriever at `lib/rag/retriever.ts`: similarity search + metadata filters (class / subject / topic). | P0 |
| FR-M4-02 | Prompt builder: retrieved chunks + system prompt → final LLM prompt. | P0 |
| FR-M4-03 | `GET/POST /api/test/query` returns **only** retrieval results (raw chunks + similarity scores). No LLM call. | P0 |
| FR-M4-04 | `POST /api/test/chat` runs retrieval + LLM and returns a full RAG answer. | P0 |
| FR-M4-05 | Playground UI: query box, filter dropdowns, retrieved chunks and AI answer side by side. | P0 |
| FR-M4-06 | System prompt editor in UI; changing the prompt and re-testing must not require re-ingesting content. | P0 |

**Done when:** in the Playground, a question retrieves the correct chunk and a relevant answer is visually verifiable.

**Gate:** Do not start fine-tuning work (M6+) until this RAG MVP is verified.

---

### Milestone 5 — Local Model Serving (Ollama)

| ID | Requirement | Priority |
|---|---|---|
| FR-M5-01 | Document/run Ollama locally; pull `Qwen2.5-7B-Instruct`. | P0 |
| FR-M5-02 | Next.js calls Ollama at `http://localhost:11434` for Playground “full AI answer”. | P0 |
| FR-M5-03 | Base model name is configurable via `.env` / config (model selector). | P0 |
| FR-M5-04 | If Ollama is down, Playground shows a clear error (not a generic 500 only). | P1 |

**Done when:** Playground “Full AI answer” comes from the local Ollama model.

Until M5, `/api/test/chat` may use a temporary cloud LLM if needed for M4 verification; M5 replaces that path with Ollama.

---

### Milestone 6 — Training Dataset Generation

Generate **five** example types from Topic text so the model learns question generation, marking, and multi-way explanation — not only Q&A.

| ID | Requirement | Priority |
|---|---|---|
| FR-M6-01 | `POST /api/training/generate-examples` generates synthetic examples for a Topic via Anthropic or OpenAI API. | P0 |
| FR-M6-02 | Question types: concept explanation (`qna`), MCQ (`mcq`), srijonsil (`srijonsil`) — each with its own generation pattern. | P0 |
| FR-M6-03 | **Answer-evaluation examples** (`evaluation`): question + sample student answer (correct / partial / wrong), score, mistake explanation, improvement tips. | P0 |
| FR-M6-04 | **Multi-explanation examples** (`multi_explain`): same topic explained 2–3 ways (simple language, analogy, real-life example). | P0 |
| FR-M6-05 | Persist `TrainingExample` with `type` and status `generated`. | P0 |
| FR-M6-06 | Review/Edit UI: admin edits, approves, or rejects each example. | P0 |
| FR-M6-07 | Bulk generate by selecting multiple Topics and/or Chapters. | P0 |
| FR-M6-08 | Selecting a Topic auto-generates **all five** types. | P0 |

**Done when:** selecting a Topic auto-generates all 5 types and the admin can approve them.

#### 6.1 Example types

| `type` | Intent | Generation pattern |
|---|---|---|
| `qna` | Concept explanation Q&A | Question about the topic; grounded answer from topic text |
| `mcq` | Multiple choice | Stem + options + correct answer (+ brief rationale) |
| `srijonsil` | Creative / open-ended | Prompt that requires original thinking, still curriculum-grounded |
| `evaluation` | Marking + feedback | See JSONL format below |
| `multi_explain` | Multiple explanations | See JSONL format below |

#### 6.2 Answer-evaluation JSONL format

```json
{
  "instruction": "Evaluate the student's answer and explain any mistakes.",
  "input": "Question: What is pollination?\nStudent's answer: Bees drinking nectar from flowers.",
  "output": "Score: 2/10. Mistake: you've confused pollination with nectar collection. Pollination is the transfer of pollen from one flower to another, which is necessary for reproduction. To improve: re-read the definition of pollination on page 45 of the textbook, and notice how bees carry pollen while doing so.",
  "metadata": {
    "class": 6,
    "subject": "science",
    "topic": "pollination",
    "type": "evaluation"
  }
}
```

**Evaluation generation rules**

- Produce **correct**, **partial**, and **wrong** student-answer variants per topic (or a documented mix).
- `output` must include: numeric score, mistake (when score is low), and improvement guidance.
- Ground feedback in the Topic text (page reference when available).

#### 6.3 Multi-explanation JSONL format

```json
{
  "instruction": "Explain what pollination is, in multiple ways (simple language + real-life example).",
  "input": "",
  "output": "Simply put: pollination is... \n\nReal-life example 1 (bees): when a bee moves from one flower to another... \n\nReal-life example 2 (wind): in some plants, pollination happens via wind...",
  "metadata": {
    "class": 6,
    "subject": "science",
    "topic": "pollination",
    "type": "multi_explain"
  }
}
```

**Multi-explain generation rules**

- Same instruction, multiple styles in one `output` (simple language + ≥1 real-life example; analogy optional).
- `input` may be empty.

---

### Milestone 7 — Dataset Export + Training Job

| ID | Requirement | Priority |
|---|---|---|
| FR-M7-01 | Dataset builder: select **approved** examples filtered by class / subject / chapter. | P0 |
| FR-M7-02 | Export JSONL in instruction format: `instruction` / `input` / `output` (plus `metadata` as in M6). | P0 |
| FR-M7-03 | Create a `TrainingDataset` record: when created, example count, log. | P0 |
| FR-M7-04 | `POST /api/training/jobs/start` triggers `/training-service` Unsloth QLoRA via `child_process` or HTTP API. | P0 |
| FR-M7-05 | Job status polling UI: `queued` / `running` / `completed` / `failed`. | P0 |
| FR-M7-06 | Job logs viewer: training progress / loss. | P0 |
| FR-M7-07 | One-click path: approved dataset → JSONL → start job. | P0 |

**Done when:** from an approved dataset, admin can build JSONL and start a training job in one click, and track status.

**Export rule:** Only `status = approved` examples are included. Rejected and unreviewed (`generated`) examples are excluded.

---

### Milestone 8 — Fine-tuned Model Integration + Evaluation

| ID | Requirement | Priority |
|---|---|---|
| FR-M8-01 | Merge/load LoRA adapter into Ollama via a Modelfile. | P0 |
| FR-M8-02 | Playground model switch: base vs fine-tuned. | P0 |
| FR-M8-03 | Before/after comparison: both models’ answers to the **same** query, side by side. | P0 |
| FR-M8-04 | Regression tracking: note which Topic/question the fine-tuned model does better or worse on. | P0 |

**Done when:** admin can compare base vs fine-tuned output side by side in the Playground.

---

## 7. API summary

All endpoints require admin auth unless noted.

| Method | Path | Milestone | Behavior |
|---|---|---|---|
| — | Auth login/logout | M0 | Session for admin |
| CRUD | `/api/classes`, `/api/subjects`, `/api/chapters` | M1 | Curriculum CRUD |
| CRUD | `/api/topics`, chunks nested or sibling | M2 | Topic + chunk persist |
| POST | Topic embed / re-embed | M3 | Embedder pipeline |
| POST | `/api/test/query` | M4 | Retrieval only (chunks + scores) |
| POST | `/api/test/chat` | M4 / M5 | Retrieval + LLM (Ollama from M5) |
| POST | `/api/training/generate-examples` | M6 | Synthetic examples for Topic(s) |
| PATCH | Training example review | M6 | Approve / reject / edit |
| POST | Dataset build / export | M7 | JSONL + TrainingDataset |
| POST | `/api/training/jobs/start` | M7 | Start Unsloth job |
| GET | Job status / logs | M7 | Polling |

Exact REST shapes may be refined at implementation; behavior above is required.

---

## 8. UI surfaces

| Surface | Milestone | Must include |
|---|---|---|
| Login | M0 | Admin credentials |
| Dashboard | M0 | Empty shell initially; later summaries optional |
| Curriculum | M1 | Class / Subject / Chapter CRUD + cascade |
| Topics | M2–M3 | Entry form, list + status, chunk preview/edit |
| Playground | M4–M5, M8 | Query, filters, chunks vs answer, prompt editor, model toggle, side-by-side compare |
| Training examples | M6 | Generate, review, edit, approve/reject, bulk generate |
| Datasets & jobs | M7 | Filter approved examples, export, start job, status, logs |

Navigation lives in the admin sidebar (M0).

---

## 9. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Admin-only: no public content or student APIs in this phase. |
| NFR-02 | Secrets (DB, LLM keys, admin password) live in env, never in git. |
| NFR-03 | Embeddings and retrieval must support metadata filters so Class 6 Science does not retrieve unrelated classes/subjects. |
| NFR-04 | Chunk size stays in 300–500 tokens so retrieval is neither too coarse nor too fragmented. |
| NFR-05 | Playground must make retrieval quality **visible** (chunks + scores), not only the final answer. |
| NFR-06 | Training export is deterministic given the same approved set and filters. |
| NFR-07 | Training jobs must not block the Next.js request forever; use async job + polling. |
| NFR-08 | Failed pipeline steps (embed, generate, train) must surface status + reason to the admin. |

---

## 10. Environment / configuration

Minimum configuration (names may be adjusted, purpose is required):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` (or equivalent) | Simple admin auth |
| `OLLAMA_BASE_URL` | Default `http://localhost:11434` |
| `OLLAMA_MODEL` | Base instruct model name |
| `OLLAMA_FINETUNED_MODEL` | Fine-tuned Ollama tag (M8) |
| `EMBEDDING_MODEL` | Embedding model identifier |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Dataset generation and evaluation |

---

## 11. Build order and gates

```
M0 → M1 → M2 → M3 → M4     RAG working end-to-end (no fine-tune)
        → M5               Local Ollama answers in Playground
        → M6 → M7 → M8     Fine-tuning layered on top
```

| Gate | Rule |
|---|---|
| After M4 | Verify RAG MVP (correct chunk + relevant answer) before M6. |
| After M5 | Confirm Playground answers are from Ollama, not a leftover cloud path. |
| After M6 | All five example types exist and can be approved. |
| After M7 | JSONL + job start + status in one admin flow. |
| After M8 | Base vs fine-tuned comparison is visible in Playground. |

---

## 12. Acceptance checklist (product-level)

- [ ] Admin can log in and use a sidebar shell.
- [ ] Class → Subject → Chapter cascade works.
- [ ] Pasted topic text is chunked (300–500 tokens, topic prefix) and stored.
- [ ] Chunks are embedded in pgvector with curriculum metadata.
- [ ] Playground retrieves the right chunk and shows a relevant RAG answer.
- [ ] Full AI answer is served by local Ollama.
- [ ] A Topic yields five approved-capable example types, including evaluation and multi-explain.
- [ ] Approved examples export to instruction JSONL and can start a training job with visible status/logs.
- [ ] Playground compares base vs fine-tuned answers side by side, with regression notes.

---

## 13. Traceability: target capabilities → data

| Target capability | Trained mainly by | Verified in |
|---|---|---|
| Generate MCQ + srijonsil questions | `mcq`, `srijonsil` (+ `qna`) | Playground / comparison (M8) |
| Mark answers + explain mistakes + improvement | `evaluation` | Playground / comparison (M8) |
| Explain a topic multiple ways + real-life examples | `multi_explain` | Playground / comparison (M8) |
| Ground answers in curriculum | RAG (M3–M5) + topic-grounded generation (M6) | Playground (M4) |

RAG is the retrieval layer. Fine-tuning is the behavior layer (question generation, marking, multi-explanation). Both are required for the product goal; neither replaces the other.
