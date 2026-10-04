import os
import shutil
import logging
from typing import Optional, List
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.config import settings
from backend.services.pdf_service import process_and_chunk_pdf
from backend.services.ollama_service import ollama_service
from backend.services.vector_store import vector_store
from backend.services.rag_service import rag_service
from backend.services.agent_service import agent_service

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("college_knowledge.api")

app = FastAPI(
    title="College Knowledge AI API",
    description="Backend API for College Knowledge AI RAG & LangGraph Agent system",
    version="1.0.0"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local dev (Vite on port 5173/5174, etc.)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Request / Response Models -----------------

class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Question asked by the student")
    top_k: Optional[int] = Field(default=6, ge=1, le=12, description="Number of context chunks to retrieve")
    document_id: Optional[str] = Field(default=None, description="Optional document ID to scope retrieval")

class AgentRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Question or task for the LangGraph agent")
    document_id: Optional[str] = Field(default=None, description="Optional document ID to scope retrieval")

# ----------------- API Endpoints -----------------

@app.get("/health")
async def health_check():
    """
    Checks health of backend, Ollama connection, and Supabase database.
    """
    ollama_status = await ollama_service.check_health()
    db_status = vector_store.check_health()

    overall = "healthy"
    if ollama_status.get("status") != "online" or db_status.get("status") not in ["connected", "warning"]:
        overall = "degraded"

    return {
        "status": overall,
        "application": "College Knowledge AI",
        "ollama": ollama_status,
        "database": db_status,
        "configuration": {
            "model": settings.OLLAMA_MODEL,
            "embed_model": settings.OLLAMA_EMBED_MODEL,
            "dimension": settings.EMBEDDING_DIMENSION,
            "chunk_size": settings.CHUNK_SIZE,
            "chunk_overlap": settings.CHUNK_OVERLAP,
            "similarity_threshold": settings.SIMILARITY_THRESHOLD
        }
    }

@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    1. Uploads PDF notes
    2. Extracts text page-by-page
    3. Splits text into chunks with source and page metadata
    4. Generates embeddings with Ollama
    5. Stores embeddings in Supabase pgvector or SQLite
    """
    filename = file.filename
    if not filename or not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files are supported for college notes."
        )

    # Check content type if supplied
    if file.content_type and "pdf" not in file.content_type.lower() and file.content_type != "application/octet-stream":
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Expected application/pdf."
        )

    # Clean up previous records of the same document to prevent duplicate chunks crowding search
    await vector_store.delete_document_by_filename(filename)

    # Save PDF to documents directory
    dest_path = settings.DOCUMENTS_DIR / filename

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        file_size = dest_path.stat().st_size
    except Exception as e:
        logger.error(f"Failed to save file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    if file_size == 0:
        if dest_path.exists():
            dest_path.unlink()
        raise HTTPException(
            status_code=400,
            detail="The uploaded PDF file is empty (0 bytes)."
        )

    # Process and ingest PDF using pipeline
    try:
        from backend.services.ingestion_service import ingest_pdf_pipeline
        result = await ingest_pdf_pipeline(dest_path, filename=dest_path.name)
        return {
            "message": "Document processed and stored successfully",
            "document": {
                "id": result.get("document_id"),
                "filename": result["filename"],
                "total_pages": result["total_pages"],
                "total_chunks": result["total_chunks"],
                "embedding_model": result["embedding_model"],
                "embeddings_generated": result["embeddings_generated"],
                "database_insertion_succeeded": result["database_insertion_succeeded"],
                "database_mode": result["database_mode"]
            }
        }
    except ValueError as ve:
        if dest_path.exists() and dest_path.resolve() != (settings.DOCUMENTS_DIR / "operating_systems_lecture.pdf").resolve():
            dest_path.unlink()
        raise HTTPException(status_code=400, detail=str(ve))
    except ConnectionError as ce:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama is unreachable. Please ensure local Ollama is running: {str(ce)}"
        )
    except Exception as e:
        logger.error(f"Error during ingestion pipeline: {e}")
        raise HTTPException(status_code=500, detail=f"Ingestion pipeline failed: {str(e)}")

@app.get("/api/documents")
async def list_documents():
    """
    Returns list of all uploaded documents and chunk statistics.
    """
    try:
        docs = await vector_store.list_documents()
        return {"documents": docs}
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: str):
    """
    Deletes an uploaded document and its indexed vector chunks.
    """
    try:
        success = await vector_store.delete_document(document_id)
        if not success:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"message": "Document deleted successfully", "document_id": document_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Standard RAG Query:
    Retrieves relevant document chunks with deduplication, sends context to Ollama,
    and returns answer + citations.
    """
    try:
        result = await rag_service.answer_question(
            query=request.query,
            top_k=request.top_k or 6,
            document_id=request.document_id
        )
        return {
            "query": request.query,
            "answer": result["answer"],
            "sources": result["sources"],
            "chunks_found": result["chunks_found"],
            "mode": "rag"
        }
    except ConnectionError as ce:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama connection error: {str(ce)}"
        )
    except RuntimeError as re:
        raise HTTPException(
            status_code=500,
            detail=str(re)
        )
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"RAG execution failed: {str(e)}")

@app.post("/api/agent")
async def agent_endpoint(request: AgentRequest):
    """
    LangGraph Multi-Step Agent:
    Evaluates student question, decides whether document retrieval is required,
    searches vector store if needed, and synthesizes answer with reasoning trace.
    """
    try:
        result = await agent_service.run(
            question=request.query,
            document_id=request.document_id
        )
        return {
            "query": request.query,
            "answer": result["answer"],
            "sources": result["sources"],
            "steps": result["steps"],
            "decision": result["decision"],
            "reasoning": result["reasoning"],
            "mode": "agent"
        }
    except ConnectionError as ce:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama connection error: {str(ce)}"
        )
    except RuntimeError as re:
        raise HTTPException(
            status_code=500,
            detail=str(re)
        )
    except Exception as e:
        logger.error(f"Agent error: {e}")
        raise HTTPException(status_code=500, detail=f"LangGraph Agent execution failed: {str(e)}")

# ----------------- Serve Unified Frontend (Single Port Access) -----------------
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

dist_dir = settings.PROJECT_ROOT / "frontend" / "dist"
assets_dir = dist_dir / "assets"

if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """
    Serves the compiled frontend React app on the same port as the backend.
    Enables single-link access for the entire application.
    """
    if full_path.startswith("api/") or full_path in ["health", "docs", "redoc", "openapi.json"]:
        raise HTTPException(status_code=404, detail="API route not found")

    file_candidate = dist_dir / full_path
    if full_path and file_candidate.is_file():
        return FileResponse(file_candidate)

    index_html = dist_dir / "index.html"
    if index_html.exists():
        return FileResponse(index_html)

    return {"message": "Backend is active. Run 'npm run build' inside frontend/ to compile the frontend assets."}

