# RAG System Completion Plan

## Goal

Complete the project as an authenticated JavaScript/TypeScript RAG application without introducing a Python service. The MVP will let users upload documents, index them, ask questions, receive streamed answers with citations, and keep each user's data isolated.

## Current State

- The frontend is primarily the default Next.js starter screen.
- Clerk is partially configured, but the root layout renders `children` twice and places content outside the `<body>` element.
- The Express server exposes only a basic status endpoint.
- Document ingestion, parsing, embeddings, retrieval, persistence, chat, tests, and deployment configuration are not implemented.
- Only `client/rag` is currently a Git repository; the server sits outside that repository.
- Package management is split between npm and pnpm.
- The frontend lint command currently fails because the installed dependency tree is incomplete (`debug` is missing).

## Recommended Architecture

```text
Next.js web application
        | Clerk token
        v
Express API ----------------> PostgreSQL + pgvector
    |                          documents, chunks,
    |                          conversations, vectors
    |
    +-- ingestion worker
    |      +-- PDF/DOCX/TXT/Markdown extraction
    |
    +-- embedding provider
    |
    +-- generation provider
           +-- streamed grounded answer + citations
```

Use TypeScript throughout. It remains a Node.js/JavaScript environment while providing safer API contracts and data structures.

Suggested repository layout:

```text
apps/
  web/                 Next.js 16, Clerk, Tailwind
  api/                 Express API
  worker/              Background ingestion jobs
packages/
  shared/              Zod schemas and shared types
  rag-core/            Chunking, retrieval and prompting
infra/
  docker-compose.yml   PostgreSQL/pgvector for local development
```

Use one root pnpm workspace and one lockfile.

## Phase 1: Stabilize the Foundation

- Preserve the existing frontend Git history and make `Rag System` the repository root so the client and server are tracked together.
- Consolidate npm and pnpm configuration into one pnpm workspace.
- Pin the Node.js version and create `.env.example` files.
- Repair the frontend dependency installation.
- Correct the Next.js root layout and metadata.
- Add root commands for `dev`, `build`, `lint`, `typecheck`, and `test`.
- Convert the API to TypeScript and organize it into configuration, routes, middleware, services, and repositories.

### Acceptance Criteria

- A fresh clone installs with one command.
- The web application and API start together with one command.
- Linting, type checking, and production builds pass.

## Phase 2: Authentication and API Boundaries

- Finish the Clerk frontend configuration.
- Add `@clerk/express` to the API.
- Validate the Clerk session on every private API endpoint.
- Attach the authenticated `userId` to all documents, chunks, conversations, and messages.
- Replace unrestricted CORS with an explicit origin allowlist.
- Add `/health` and `/ready` endpoints.
- Define shared Zod request/response schemas.
- Add a consistent API error response format.

### Acceptance Criteria

- Anonymous requests to protected routes return `401`.
- Signed-in users can access only their own records.
- Invalid request payloads return structured validation errors.

## Phase 3: Persistence

Use PostgreSQL with pgvector so metadata, transactional records, full-text search, and vectors remain in one system.

Create these tables:

- `documents`: owner, name, MIME type, size, checksum, status, storage key, and error.
- `document_chunks`: document ID, content, page/section metadata, token count, and embedding.
- `conversations`: owner, title, and timestamps.
- `messages`: conversation, role, content, citations, model, and usage metadata.
- `ingestion_jobs`: document, state, attempts, timestamps, and error.

Keep vector-store access behind an interface so Qdrant or another provider can be introduced later.

### Acceptance Criteria

- Migrations create the database from an empty state.
- All queries enforce user ownership.
- Document deletion removes its chunks and stored file consistently.

## Phase 4: Document Ingestion

Initially support PDF, DOCX, TXT, and Markdown:

1. Authenticate the request.
2. Validate file signature, MIME type, extension, and size.
3. Calculate a checksum to detect duplicate uploads.
4. Save the original file locally during development and in S3-compatible object storage in production.
5. Create a pending document record.
6. Process the document through a background worker.
7. Extract and normalize text while retaining page and heading metadata.
8. Split text into approximately 600-900-token chunks with controlled overlap.
9. Generate embeddings in batches.
10. Insert chunks and embeddings transactionally.
11. Mark the document ready or preserve a useful failure message.

Do not include OCR in the first release. Add scanned-PDF support after ordinary PDF ingestion is reliable.

### Acceptance Criteria

- Supported files move through `pending`, `processing`, and `ready` states.
- Unsupported or oversized files are rejected safely.
- Failed jobs can be retried without producing duplicate chunks.
- Extracted chunks retain usable page or section citations.

## Phase 5: Retrieval and Answer Generation

For each question:

1. Validate the authenticated conversation and document scope.
2. Generate an embedding for the question.
3. Retrieve candidate chunks using vector similarity and PostgreSQL full-text search.
4. Merge and deduplicate the results.
5. Select a final context set within a defined token budget.
6. Ask the model to answer only from the retrieved context.
7. Require an explicit insufficient-evidence response when the context cannot answer the question.
8. Stream the answer to the browser with Server-Sent Events.
9. Return structured citations containing the document ID, filename, page or section, excerpt, and relevance score.
10. Store the question, answer, citations, usage, and latency.

Place model access behind interfaces such as:

```ts
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

interface GenerationProvider {
  streamAnswer(input: GenerationInput): AsyncIterable<GenerationEvent>;
}
```

The initial implementation can use the OpenAI JavaScript SDK's embeddings endpoint and Responses API while remaining replaceable by another provider.

### Acceptance Criteria

- Answers stream incrementally.
- Every factual answer includes one or more valid citations.
- Citation links open the correct document location or excerpt.
- The system abstains when retrieved evidence is insufficient.
- Retrieval never crosses user boundaries.

## Phase 6: Frontend Product Experience

Build these primary experiences:

- Public landing page with sign-in and sign-up.
- Authenticated workspace shell.
- Document library with upload progress, status, retry, and deletion.
- Conversation interface with streamed output and clickable citations.

Cover these UI states:

- No documents uploaded.
- Upload rejected.
- Document indexing in progress.
- Indexing failed.
- No relevant evidence found.
- API or model unavailable.
- Responsive and keyboard-accessible layouts.

### Acceptance Criteria

- A new user can complete the full upload-to-answer flow without developer assistance.
- Refreshing the application preserves documents and conversations.
- Loading, empty, success, and failure states are clear.
- Core flows work on desktop and mobile layouts.

## Phase 7: Security and Reliability

- Enforce user ownership in every database query, not only in the UI.
- Add rate limits, security headers, request IDs, and structured logs.
- Limit request bodies and uploaded files.
- Treat retrieved document content as untrusted data.
- Instruct the model not to follow instructions embedded inside documents.
- Keep model, database, Clerk, and storage credentials server-side.
- Validate environment variables during startup.
- Avoid logging document text, authentication headers, or secrets.
- Add external-request timeouts and retries with backoff.
- Make ingestion jobs idempotent.
- Define data deletion and retention behavior.

### Acceptance Criteria

- Cross-user access attempts fail in automated tests.
- Secrets never appear in browser bundles or application logs.
- A failed model, embedding, or storage request returns a controlled error.
- Retried ingestion does not duplicate vectors.

## Phase 8: Testing and RAG Evaluation

Add the following testing layers:

- Unit tests for parsers, normalization, chunk boundaries, citation mapping, and prompt construction.
- Integration tests for authentication, upload lifecycle, ownership filters, database operations, and retrieval.
- End-to-end tests covering sign-in, file upload, indexing, questioning, and citation verification.
- Mocked model contract tests for deterministic CI runs.
- A RAG evaluation set containing 30-50 questions with expected documents and answers.

Track these quality metrics:

- Retrieval recall at `k`.
- Citation correctness.
- Grounded-answer rate.
- Abstention accuracy.
- Time to first token and total latency.
- Tokens and estimated cost per question.

### Acceptance Criteria

- Critical tests run automatically in CI.
- The evaluation suite has documented baseline results.
- Retrieval or prompt changes cannot be merged if they cause an agreed quality regression.

## Phase 9: Automation and Deployment

- Add CI for dependency installation, linting, type checking, tests, and production builds.
- Containerize the API and worker.
- Deploy the web application, API, worker, PostgreSQL/pgvector, and object storage.
- Run migrations as a controlled release step.
- Add database backups, log aggregation, error monitoring, and health checks.
- Document local setup, environment variables, API routes, architecture, and deployment procedures.

### Acceptance Criteria

- A documented production deployment can be recreated.
- Health checks detect unavailable API, database, or worker services.
- Database backups and restoration have been tested.
- Deployment does not require editing source files or committing secrets.

## Suggested API Surface

```text
GET    /health
GET    /ready

POST   /v1/documents
GET    /v1/documents
GET    /v1/documents/:documentId
DELETE /v1/documents/:documentId
POST   /v1/documents/:documentId/retry

POST   /v1/conversations
GET    /v1/conversations
GET    /v1/conversations/:conversationId
DELETE /v1/conversations/:conversationId

POST   /v1/conversations/:conversationId/messages
GET    /v1/conversations/:conversationId/messages
```

The message creation endpoint should return an SSE stream containing status, text delta, citation, completion, and error events.

## Delivery Schedule

| Milestone | Result | Estimate |
| --- | --- | ---: |
| Foundation | Clean monorepo, working builds, corrected Clerk layout | 1 day |
| Authentication and database | Secured API and user-owned records | 1-2 days |
| Ingestion | Upload through indexed chunks | 2-3 days |
| RAG API | Retrieval, streaming answers, and citations | 2-3 days |
| Product UI | Document management and complete chat flow | 2-3 days |
| Quality and deployment | Tests, evaluations, CI, and production configuration | 2-4 days |

A realistic MVP should take approximately 10-15 focused working days. OCR, organization sharing, reranking, external data connectors, and administrative analytics should be follow-up milestones.

## Definition of Done

The MVP is complete when:

- A user can sign up and sign in.
- A user can upload a supported document.
- The document is parsed, chunked, embedded, and made searchable.
- The user can ask questions and receive streamed, grounded answers.
- Answers contain working citations to the user's documents.
- Users cannot access one another's documents or conversations.
- Core unit, integration, and end-to-end tests pass.
- Linting, type checking, and production builds pass in CI.
- The application is deployed with documented configuration, monitoring, and backup procedures.

## Reference Documentation

- [Clerk Express quickstart](https://clerk.com/docs/expressjs/getting-started/quickstart)
- [Next.js Proxy documentation](https://nextjs.org/docs/app/getting-started/proxy)
- [OpenAI embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)
- [OpenAI Responses API migration guide](https://developers.openai.com/api/docs/guides/migrate-to-responses?lang=javascript)
- [Qdrant JavaScript interface](https://qdrant.tech/documentation/interfaces/)

