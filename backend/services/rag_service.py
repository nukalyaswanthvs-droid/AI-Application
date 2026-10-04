from typing import Dict, Any, List
from backend.config import settings
from backend.services.ollama_service import ollama_service
from backend.services.vector_store import vector_store

STRICT_SYSTEM_PROMPT = """You are "College Knowledge AI", an accurate, student-focused academic AI assistant.
Your sole job is to answer the student's questions using ONLY the provided document excerpts from their uploaded college notes.

CRITICAL INSTRUCTIONS:
1. Base your answer STRICTLY and EXCLUSIVELY on the provided context excerpts.
2. If the provided context does NOT contain enough information to answer the question accurately, you MUST reply with this EXACT sentence:
   "I could not find this information in the uploaded documents."
3. Do not make up information, do not extrapolate, and do not use outside knowledge beyond the provided excerpts.
4. When answering, mention the source document name and page number when quoting or referencing specific facts.
5. Be structured, concise, and helpful for college study."""

RAG_PROMPT_TEMPLATE = """Student Question: {query}

Uploaded Document Context:
{context}

Answer the student's question based strictly on the context above. If the context does not contain the answer, reply: "I could not find this information in the uploaded documents." """

class RagService:
    async def answer_question(
        self,
        query: str,
        top_k: int = 6,
        document_id: str | None = None
    ) -> Dict[str, Any]:
        """
        Executes standard RAG pipeline:
        1. Embeds question with Ollama
        2. Retrieves relevant chunks from Supabase pgvector (or local vector store)
        3. Formulates prompt with strict fallback instruction
        4. Synthesizes answer using local Ollama model
        5. Extracts source references and page numbers
        """
        # 1. Embed query
        query_embedding = await ollama_service.get_embedding(query)

        # 2. Similarity search with deduplication
        retrieved_chunks = await vector_store.similarity_search(
            query_embedding=query_embedding,
            top_k=top_k or 6,
            threshold=settings.SIMILARITY_THRESHOLD,
            document_id=document_id
        )

        # If vector store returned no relevant chunks above threshold
        if not retrieved_chunks:
            return {
                "answer": "I could not find this information in the uploaded documents.",
                "sources": [],
                "chunks_found": 0,
                "model": settings.OLLAMA_MODEL
            }

        # 3. Format context string with document names and page numbers
        context_parts = []
        sources = []

        for idx, chunk in enumerate(retrieved_chunks, 1):
            metadata = chunk.get("metadata", {})
            doc_name = metadata.get("source", "Unknown Document")
            page_num = metadata.get("page_number", "N/A")
            content = chunk.get("content", "").strip()

            context_parts.append(
                f"[Source: {doc_name} | Page: {page_num}]\n{content}"
            )

            sources.append({
                "document": doc_name,
                "page": page_num,
                "similarity": chunk.get("similarity"),
                "snippet": content[:250] + ("..." if len(content) > 250 else "")
            })

        formatted_context = "\n\n---\n\n".join(context_parts)

        # 4. Generate Answer using Ollama
        prompt = RAG_PROMPT_TEMPLATE.format(
            query=query,
            context=formatted_context
        )

        raw_answer = await ollama_service.generate_response(
            prompt=prompt,
            system_prompt=STRICT_SYSTEM_PROMPT,
            temperature=0.1
        )

        return {
            "answer": raw_answer,
            "sources": sources,
            "chunks_found": len(retrieved_chunks),
            "model": settings.OLLAMA_MODEL
        }

rag_service = RagService()
