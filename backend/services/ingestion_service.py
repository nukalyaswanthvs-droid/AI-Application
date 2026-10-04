import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional

from backend.config import settings
from backend.services.pdf_service import process_and_chunk_pdf
from backend.services.ollama_service import ollama_service
from backend.services.vector_store import vector_store

logger = logging.getLogger("college_knowledge.ingestion")

async def ingest_pdf_pipeline(
    file_path: Path | str,
    filename: Optional[str] = None
) -> Dict[str, Any]:
    """
    Ingestion pipeline:
    1. Reads PDF using pypdf
    2. Extracts text from every page, preserving 1-indexed page numbers
    3. Splits the text into smaller overlapping chunks
    4. Generates 768-dim embeddings using Ollama (nomic-embed-text)
    5. Stores document metadata and chunk embeddings into the database (Supabase pgvector / SQLite store)
    """
    path_obj = Path(file_path).resolve()
    if not path_obj.exists():
        raise FileNotFoundError(f"PDF file not found at: {path_obj}")

    doc_name = filename or path_obj.name
    file_size = path_obj.stat().st_size

    logger.info(f"Starting ingestion pipeline for '{doc_name}' ({file_size} bytes)")

    # 1-3: Extract text from each page preserving page numbers and chunk text
    chunk_result = process_and_chunk_pdf(path_obj, doc_name)
    chunks = chunk_result["chunks"]
    total_pages = chunk_result["total_pages"]
    total_chunks = chunk_result["total_chunks"]

    # 4: Generate embeddings with Ollama
    embed_model_name = ollama_service.embed_model
    logger.info(f"Generating embeddings using Ollama model '{embed_model_name}' for {total_chunks} chunks...")

    texts_to_embed = [c["content"] for c in chunks]
    embeddings = await ollama_service.get_batch_embeddings(texts_to_embed)
    embeddings_generated = (
        len(embeddings) == total_chunks and
        all(isinstance(e, list) and len(e) > 0 for e in embeddings)
    )

    if not embeddings_generated:
        raise RuntimeError(
            f"Failed to generate embeddings: expected {total_chunks}, got {len(embeddings)}"
        )

    # 5: Store in vector database (Supabase PostgreSQL + pgvector / SQLite fallback)
    logger.info(f"Saving document record and {total_chunks} chunk embeddings to vector database...")
    saved_doc = await vector_store.save_document(
        filename=doc_name,
        total_pages=total_pages,
        total_chunks=total_chunks,
        chunks=chunks,
        embeddings=embeddings,
        file_path=str(path_obj),
        file_size=file_size
    )

    db_success = bool(saved_doc and saved_doc.get("document_id"))
    health = vector_store.check_health()
    db_mode = health.get("mode", "unknown")

    result = {
        "filename": doc_name,
        "total_pages": total_pages,
        "total_chunks": total_chunks,
        "embedding_model": embed_model_name,
        "embeddings_generated": embeddings_generated,
        "database_insertion_succeeded": db_success,
        "document_id": saved_doc.get("document_id") if saved_doc else None,
        "database_mode": db_mode,
        "chunks": chunks,
        "embeddings_sample": {
            "dimension": len(embeddings[0]) if embeddings else 0,
            "sample_vector": embeddings[0][:5] if embeddings else []
        }
    }

    logger.info(
        f"Ingestion completed: '{doc_name}' ({total_pages} pages, {total_chunks} chunks, "
        f"model: {embed_model_name}, db_success: {db_success})"
    )

    return result
