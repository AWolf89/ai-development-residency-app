/**
 * The embedding vector length, in one place. MUST stay equal to:
 *  - the `vector(1536)` columns in the RAG migration, and
 *  - the model in src/lib/llm/config.ts (`embeddingModel`).
 * A mismatch is caught at runtime by assertDim() in src/lib/llm/embed.ts.
 */
export const EMBEDDING_DIM = 1536;
