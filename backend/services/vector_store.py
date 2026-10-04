import json
import logging
import sqlite3
import uuid
import math
from pathlib import Path
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from pgvector.psycopg2 import register_vector
from supabase import create_client, Client
from backend.config import settings

logger = logging.getLogger("college_knowledge.vector_store")

class SupabaseVectorStore:
    """
    Manages vector storage and cosine similarity retrieval using Supabase PostgreSQL + pgvector.
    Supports either direct PostgreSQL connection URI (DATABASE_URL) or Supabase client (URL + Key).
    Includes automatic local SQLite storage for offline development when Supabase credentials are not set.
    """

    def __init__(self):
        self._supabase_client: Optional[Client] = None
        self.sqlite_path = settings.PROJECT_ROOT / "database" / "local_college_knowledge.db"
        self._init_sqlite()
        self._init_supabase()

    def _init_sqlite(self):
        try:
            self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(self.sqlite_path))
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    file_path TEXT,
                    file_size INTEGER,
                    total_pages INTEGER DEFAULT 0,
                    total_chunks INTEGER DEFAULT 0,
                    metadata TEXT DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
                    content TEXT NOT NULL,
                    metadata TEXT DEFAULT '{}',
                    embedding TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to initialize SQLite vector store: {e}")

    def _init_supabase(self):
        if settings.has_supabase_creds:
            try:
                self._supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
                logger.info("Supabase client initialized.")
            except Exception as e:
                logger.error(f"Failed to initialize Supabase client: {e}")
                self._supabase_client = None

    def get_pg_connection(self):
        """Connects directly to PostgreSQL using DATABASE_URL and registers pgvector."""
        if not settings.has_postgres_url:
            return None
        conn = psycopg2.connect(settings.DATABASE_URL)
        register_vector(conn)
        return conn

    def check_health(self) -> Dict[str, Any]:
        """Verify Supabase / pgvector connection and check table existence."""
        # 1. Check direct PostgreSQL connection if configured
        if settings.has_postgres_url:
            try:
                conn = self.get_pg_connection()
                if conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector';")
                        has_vector = cur.fetchone() is not None
                        cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_name = 'document_chunks';")
                        tables_exist = (cur.fetchone()[0] > 0)
                    conn.close()
                    return {
                        "status": "connected",
                        "mode": "postgresql_direct",
                        "pgvector_extension": has_vector,
                        "schema_ready": tables_exist
                    }
            except Exception as e:
                return {
                    "status": "error",
                    "mode": "postgresql_direct",
                    "error": str(e)
                }

        # 2. Check Supabase REST client if configured
        if self._supabase_client:
            try:
                # Simple query to check connectivity
                res = self._supabase_client.table("documents").select("id").limit(1).execute()
                return {
                    "status": "connected",
                    "mode": "supabase_rest",
                    "schema_ready": True
                }
            except Exception as e:
                return {
                    "status": "warning",
                    "mode": "supabase_rest",
                    "error": f"Connected to client but table query failed: {e}. Did you run database/schema.sql?"
                }

        return {
            "status": "connected",
            "mode": "sqlite_local_dev",
            "message": "Local development SQLite vector store active. (Set SUPABASE_URL & KEY or DATABASE_URL in .env to connect Supabase pgvector)",
            "schema_ready": True
        }

    async def save_document(
        self,
        filename: str,
        total_pages: int,
        total_chunks: int,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        file_path: Optional[str] = None,
        file_size: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Stores document record and all embedded chunks in pgvector or local SQLite store.
        """
        # A) Use direct PostgreSQL if available
        if settings.has_postgres_url:
            return self._save_via_postgres(filename, total_pages, total_chunks, chunks, embeddings, file_path, file_size)

        # B) Use Supabase client if available
        if self._supabase_client:
            return self._save_via_supabase_client(filename, total_pages, total_chunks, chunks, embeddings, file_path, file_size)

        # C) Use local SQLite store for development and testing
        return self._save_via_sqlite(filename, total_pages, total_chunks, chunks, embeddings, file_path, file_size)

    def _save_via_postgres(
        self,
        filename: str,
        total_pages: int,
        total_chunks: int,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        file_path: Optional[str],
        file_size: Optional[int]
    ) -> Dict[str, Any]:
        conn = self.get_pg_connection()
        if not conn:
            raise ConnectionError("Could not establish PostgreSQL connection.")

        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Insert document
                cur.execute(
                    """
                    INSERT INTO documents (filename, file_path, file_size, total_pages, total_chunks)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, filename, total_pages, total_chunks, created_at;
                    """,
                    (filename, file_path, file_size, total_pages, total_chunks)
                )
                doc_record = cur.fetchone()
                doc_id = str(doc_record["id"])

                # Insert chunks
                chunk_records = []
                for chunk, emb in zip(chunks, embeddings):
                    chunk_records.append((
                        doc_id,
                        chunk["content"],
                        json.dumps(chunk["metadata"]),
                        emb
                    ))

                cur.executemany(
                    """
                    INSERT INTO document_chunks (document_id, content, metadata, embedding)
                    VALUES (%s, %s, %s, %s);
                    """,
                    chunk_records
                )
                conn.commit()

                return {
                    "document_id": doc_id,
                    "filename": filename,
                    "total_pages": total_pages,
                    "total_chunks": total_chunks,
                    "created_at": str(doc_record["created_at"])
                }
        finally:
            conn.close()

    def _save_via_supabase_client(
        self,
        filename: str,
        total_pages: int,
        total_chunks: int,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        file_path: Optional[str],
        file_size: Optional[int]
    ) -> Dict[str, Any]:
        # Insert document row
        doc_data = {
            "filename": filename,
            "file_path": file_path,
            "file_size": file_size,
            "total_pages": total_pages,
            "total_chunks": total_chunks
        }
        res = self._supabase_client.table("documents").insert(doc_data).execute()
        if not res.data:
            raise RuntimeError("Failed to insert document record into Supabase.")

        doc_record = res.data[0]
        doc_id = doc_record["id"]

        # Insert chunks in batches of 50
        batch_size = 50
        chunk_rows = []
        for chunk, emb in zip(chunks, embeddings):
            chunk_rows.append({
                "document_id": doc_id,
                "content": chunk["content"],
                "metadata": chunk["metadata"],
                "embedding": emb
            })

        for i in range(0, len(chunk_rows), batch_size):
            batch = chunk_rows[i:i + batch_size]
            self._supabase_client.table("document_chunks").insert(batch).execute()

        return {
            "document_id": doc_id,
            "filename": filename,
            "total_pages": total_pages,
            "total_chunks": total_chunks,
            "created_at": doc_record.get("created_at")
        }

    def _save_via_sqlite(
        self,
        filename: str,
        total_pages: int,
        total_chunks: int,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        file_path: Optional[str],
        file_size: Optional[int]
    ) -> Dict[str, Any]:
        """Saves document and chunks to local SQLite store with 1-to-1 schema matching PostgreSQL."""
        conn = sqlite3.connect(str(self.sqlite_path))
        try:
            cur = conn.cursor()
            doc_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO documents (id, filename, file_path, file_size, total_pages, total_chunks)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                (doc_id, filename, file_path, file_size, total_pages, total_chunks)
            )

            chunk_records = []
            for chunk, emb in zip(chunks, embeddings):
                chunk_id = str(uuid.uuid4())
                chunk_records.append((
                    chunk_id,
                    doc_id,
                    chunk["content"],
                    json.dumps(chunk.get("metadata", {})),
                    json.dumps(emb)
                ))

            cur.executemany(
                """
                INSERT INTO document_chunks (id, document_id, content, metadata, embedding)
                VALUES (?, ?, ?, ?, ?);
                """,
                chunk_records
            )
            conn.commit()

            cur.execute("SELECT created_at FROM documents WHERE id = ?;", (doc_id,))
            row = cur.fetchone()
            created_at = row[0] if row else ""

            return {
                "document_id": doc_id,
                "filename": filename,
                "total_pages": total_pages,
                "total_chunks": total_chunks,
                "created_at": str(created_at)
            }
        finally:
            conn.close()

    async def list_documents(self) -> List[Dict[str, Any]]:
        """List all uploaded documents."""
        # 1. Direct PostgreSQL if configured
        if settings.has_postgres_url:
            conn = self.get_pg_connection()
            if conn:
                try:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(
                            """
                            SELECT id, filename, total_pages, total_chunks, file_size, created_at
                            FROM documents
                            ORDER BY created_at DESC;
                            """
                        )
                        rows = cur.fetchall()
                        return [dict(r) for r in rows]
                finally:
                    conn.close()

        # 2. Supabase REST client if configured
        if self._supabase_client:
            try:
                res = self._supabase_client.table("documents").select("*").order("created_at", desc=True).execute()
                return res.data or []
            except Exception as e:
                logger.error(f"Error fetching documents from Supabase: {e}")
                return []

        # 3. Local SQLite fallback
        try:
            conn = sqlite3.connect(str(self.sqlite_path))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                """
                SELECT id, filename, total_pages, total_chunks, file_size, created_at
                FROM documents
                ORDER BY created_at DESC;
                """
            )
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return rows
        except Exception as e:
            logger.error(f"Error listing documents from SQLite: {e}")
            return []

    async def delete_document(self, document_id: str) -> bool:
        """Deletes a document and its cascading chunks from database and disk."""
        # 1. PostgreSQL
        if settings.has_postgres_url:
            conn = self.get_pg_connection()
            if conn:
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT file_path FROM documents WHERE id = %s;", (document_id,))
                        row = cur.fetchone()
                        if row and row[0]:
                            p = Path(row[0])
                            if p.exists() and p.resolve() != (settings.DOCUMENTS_DIR / "operating_systems_lecture.pdf").resolve():
                                try:
                                    p.unlink()
                                except Exception:
                                    pass
                        cur.execute("DELETE FROM document_chunks WHERE document_id = %s;", (document_id,))
                        cur.execute("DELETE FROM documents WHERE id = %s;", (document_id,))
                    conn.commit()
                finally:
                    conn.close()

        # 2. Supabase client
        if self._supabase_client:
            try:
                self._supabase_client.table("documents").delete().eq("id", document_id).execute()
            except Exception as e:
                logger.error(f"Error deleting from Supabase: {e}")

        # 3. Local SQLite
        try:
            conn = sqlite3.connect(str(self.sqlite_path))
            cur = conn.cursor()
            cur.execute("SELECT file_path FROM documents WHERE id = ?;", (document_id,))
            row = cur.fetchone()
            if row and row[0]:
                p = Path(row[0])
                if p.exists() and p.resolve() != (settings.DOCUMENTS_DIR / "operating_systems_lecture.pdf").resolve():
                    try:
                        p.unlink()
                    except Exception:
                        pass
            cur.execute("DELETE FROM document_chunks WHERE document_id = ?;", (document_id,))
            cur.execute("DELETE FROM documents WHERE id = ?;", (document_id,))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Error deleting document {document_id}: {e}")
            return False

    async def delete_document_by_filename(self, filename: str) -> bool:
        """Deletes existing document records with the given filename to avoid duplicate chunks."""
        try:
            conn = sqlite3.connect(str(self.sqlite_path))
            cur = conn.cursor()
            cur.execute("SELECT id FROM documents WHERE filename = ?;", (filename,))
            rows = cur.fetchall()
            for r in rows:
                doc_id = r[0]
                cur.execute("DELETE FROM document_chunks WHERE document_id = ?;", (doc_id,))
                cur.execute("DELETE FROM documents WHERE id = ?;", (doc_id,))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Error deleting by filename {filename}: {e}")
            return False

    async def similarity_search(
        self,
        query_embedding: List[float],
        top_k: int = 6,
        threshold: float = 0.35,
        document_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Performs vector cosine similarity search in Supabase PostgreSQL pgvector or local store.
        Automatically deduplicates content across multiple uploads and returns top relevant chunks.
        """
        # A) Via PostgreSQL direct connection
        if settings.has_postgres_url:
            conn = self.get_pg_connection()
            if conn:
                try:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        if document_id:
                            cur.execute(
                                """
                                SELECT 
                                    dc.id,
                                    dc.document_id,
                                    dc.content,
                                    dc.metadata,
                                    1 - (dc.embedding <=> %s) AS similarity
                                FROM document_chunks dc
                                WHERE dc.embedding IS NOT NULL AND dc.document_id = %s
                                ORDER BY dc.embedding <=> %s
                                LIMIT %s;
                                """,
                                (query_embedding, document_id, query_embedding, top_k * 3)
                            )
                        else:
                            cur.execute(
                                """
                                SELECT 
                                    dc.id,
                                    dc.document_id,
                                    dc.content,
                                    dc.metadata,
                                    1 - (dc.embedding <=> %s) AS similarity
                                FROM document_chunks dc
                                WHERE dc.embedding IS NOT NULL
                                ORDER BY dc.embedding <=> %s
                                LIMIT %s;
                                """,
                                (query_embedding, query_embedding, top_k * 3)
                            )
                        results = cur.fetchall()
                        seen_signatures = set()
                        filtered = []
                        for r in results:
                            sim = float(r["similarity"])
                            if sim >= threshold:
                                sig = "".join(r["content"].lower().split())[:120]
                                if sig in seen_signatures:
                                    continue
                                seen_signatures.add(sig)
                                filtered.append({
                                    "id": str(r["id"]),
                                    "document_id": str(r["document_id"]),
                                    "content": r["content"],
                                    "metadata": r["metadata"] if isinstance(r["metadata"], dict) else json.loads(r["metadata"]),
                                    "similarity": round(sim, 4)
                                })
                                if len(filtered) >= top_k:
                                    break
                        return filtered
                finally:
                    conn.close()

        # B) Via Supabase Client RPC 'match_documents'
        if self._supabase_client:
            try:
                rpc_res = self._supabase_client.rpc(
                    "match_documents",
                    {
                        "query_embedding": query_embedding,
                        "match_count": top_k * 2
                    }
                ).execute()

                seen_signatures = set()
                filtered = []
                for item in (rpc_res.data or []):
                    sim = float(item.get("similarity", 0.0))
                    if document_id and str(item.get("document_id")) != str(document_id):
                        continue
                    if sim >= threshold:
                        sig = "".join(item.get("content", "").lower().split())[:120]
                        if sig in seen_signatures:
                            continue
                        seen_signatures.add(sig)
                        filtered.append({
                            "id": item.get("id"),
                            "document_id": item.get("document_id"),
                            "content": item.get("content"),
                            "metadata": item.get("metadata", {}),
                            "similarity": round(sim, 4)
                        })
                        if len(filtered) >= top_k:
                            break
                return filtered
            except Exception as e:
                logger.error(f"Supabase RPC match_documents error: {e}")
                raise RuntimeError(f"Vector search failed in Supabase: {e}")

        # C) Via Local SQLite with cosine similarity and deduplication
        try:
            conn = sqlite3.connect(str(self.sqlite_path))
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            if document_id:
                cur.execute(
                    "SELECT id, document_id, content, metadata, embedding FROM document_chunks WHERE document_id = ?;",
                    (document_id,)
                )
            else:
                cur.execute("SELECT id, document_id, content, metadata, embedding FROM document_chunks;")
            rows = cur.fetchall()
            conn.close()

            results = []
            for r in rows:
                if not r["embedding"]:
                    continue
                emb = json.loads(r["embedding"])
                dot = sum(a * b for a, b in zip(query_embedding, emb))
                norm_q = math.sqrt(sum(a * a for a in query_embedding))
                norm_e = math.sqrt(sum(b * b for b in emb))
                sim = dot / (norm_q * norm_e) if (norm_q > 0 and norm_e > 0) else 0.0

                if sim >= threshold:
                    meta = json.loads(r["metadata"]) if isinstance(r["metadata"], str) else (r["metadata"] or {})
                    results.append({
                        "id": str(r["id"]),
                        "document_id": str(r["document_id"]),
                        "content": r["content"],
                        "metadata": meta,
                        "similarity": round(float(sim), 4)
                    })

            # Sort by highest similarity
            results.sort(key=lambda x: x["similarity"], reverse=True)

            # Deduplicate chunks: identical text from multiple uploads shouldn't crowd out other pages
            seen_signatures = set()
            deduped = []
            for item in results:
                sig = "".join(item["content"].lower().split())[:120]
                if sig in seen_signatures:
                    continue
                seen_signatures.add(sig)
                deduped.append(item)
                if len(deduped) >= top_k:
                    break

            return deduped
        except Exception as e:
            logger.error(f"Error in SQLite similarity search: {e}")
            return []

# Global vector store singleton
vector_store = SupabaseVectorStore()
