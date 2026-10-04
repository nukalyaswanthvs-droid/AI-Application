-- ====================================================================
-- COLLEGE KNOWLEDGE AI - Supabase PostgreSQL + pgvector Schema
-- ====================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Documents table (tracks uploaded PDF files)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    file_path TEXT,
    file_size BIGINT,
    total_pages INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Document chunks table (stores extracted text chunks and embeddings)
-- Note: Default embedding dimension is set to 768 (standard for nomic-embed-text).
-- If you use another model (e.g. llama3.2 embeddings at 3072 or OpenAI at 1536),
-- change the vector dimension accordingly.
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,  -- contains page_number, filename, chunk_index
    embedding vector(768),              -- pgvector column
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Indexes
-- Foreign key index for fast lookup and cascade deletes
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id 
    ON document_chunks(document_id);

-- JSONB GIN index for metadata filtering (e.g., filter by filename or page)
CREATE INDEX IF NOT EXISTS idx_document_chunks_metadata 
    ON document_chunks USING gin (metadata);

-- HNSW Vector Index for ultra-fast approximate cosine similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
    ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- 5. RPC Function: match_documents
-- Used by Supabase clients and backend to perform cosine similarity searches
CREATE OR REPLACE FUNCTION match_documents (
    query_embedding vector(768),
    match_count INT DEFAULT 5,
    filter JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY    
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    WHERE 
        (filter = '{}'::jsonb OR dc.metadata @> filter)
        AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 6. Helper View: Document statistics
CREATE OR REPLACE VIEW document_stats AS
SELECT 
    d.id,
    d.filename,
    d.total_pages,
    d.total_chunks,
    d.created_at,
    COUNT(dc.id) as stored_chunks_count
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.filename, d.total_pages, d.total_chunks, d.created_at;
