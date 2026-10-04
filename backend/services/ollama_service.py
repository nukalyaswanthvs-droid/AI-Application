import os
import httpx
from typing import List, Dict, Any, Optional
from backend.config import settings

class OllamaService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")
        self.model = settings.OLLAMA_MODEL
        self.embed_model = (
            getattr(settings, "OLLAMA_EMBEDDING_MODEL", None)
            or getattr(settings, "OLLAMA_EMBED_MODEL", None)
            or "nomic-embed-text"
        )

    async def check_health(self) -> Dict[str, Any]:
        """Check if local Ollama daemon is active and list available models."""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [m.get("name") for m in data.get("models", [])]
                    model_found = any(self.model in m for m in models)
                    embed_model_found = any(self.embed_model in m for m in models)
                    return {
                        "status": "online",
                        "base_url": self.base_url,
                        "current_model": self.model,
                        "embed_model": self.embed_model,
                        "model_ready": model_found,
                        "embed_model_ready": embed_model_found,
                        "available_models": models
                    }
                return {
                    "status": "warning",
                    "base_url": self.base_url,
                    "error": f"Ollama returned status code {res.status_code}"
                }
        except httpx.ConnectError:
            return {
                "status": "offline",
                "base_url": self.base_url,
                "error": f"Could not connect to Ollama at {self.base_url}. Ensure Ollama is running ('ollama serve' or open Ollama app)."
            }
        except Exception as e:
            return {
                "status": "error",
                "base_url": self.base_url,
                "error": str(e)
            }

    async def get_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for a single string using Ollama's embedding API.
        Attempts /api/embeddings (standard) or /api/embed (newer Ollama).
        """
        cleaned_text = text.replace("\n", " ").strip()
        if not cleaned_text:
            cleaned_text = " "

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # 1. Try standard /api/embeddings
                payload = {
                    "model": self.embed_model,
                    "prompt": cleaned_text
                }
                res = await client.post(f"{self.base_url}/api/embeddings", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    embedding = data.get("embedding")
                    if embedding:
                        return embedding

                # 2. Try newer /api/embed endpoint
                embed_payload = {
                    "model": self.embed_model,
                    "input": cleaned_text
                }
                res2 = await client.post(f"{self.base_url}/api/embed", json=embed_payload)
                if res2.status_code == 200:
                    data2 = res2.json()
                    embeddings = data2.get("embeddings")
                    if embeddings and len(embeddings) > 0:
                        return embeddings[0]

                # If model not found or error
                error_msg = res.text if res.status_code != 200 else res2.text
                raise RuntimeError(
                    f"Ollama embedding failed ({res.status_code}): {error_msg}. "
                    f"Ensure model '{self.embed_model}' is pulled (run: ollama pull {self.embed_model})."
                )
            except httpx.ConnectError:
                if settings.OLLAMA_BASE_URL and os.getenv("ALLOW_EMBEDDING_FALLBACK", "true").lower() in ["true", "1", "yes"]:
                    import logging
                    logging.getLogger("college_knowledge.ollama").warning(
                        f"Ollama is offline at {self.base_url}. Using local 768-dim deterministic fallback embeddings for development/testing."
                    )
                    return self._generate_fallback_embedding(cleaned_text)
                raise ConnectionError(
                    f"Cannot reach Ollama at {self.base_url}. Please start Ollama with 'ollama serve' or start the Ollama desktop application."
                )

    def _generate_fallback_embedding(self, text: str) -> List[float]:
        """
        Generates a deterministic 768-dimensional unit-length embedding vector
        from text tokens when Ollama daemon is offline during testing.
        """
        import hashlib
        import math
        dim = settings.EMBEDDING_DIMENSION or 768
        vec = [0.0] * dim
        tokens = text.lower().split()
        if not tokens:
            tokens = ["empty"]
        for i, token in enumerate(tokens):
            h = int(hashlib.sha256(f"{token}_{i % 16}".encode("utf-8")).hexdigest(), 16)
            idx = h % dim
            val = ((h >> 8) % 1000 - 500) / 500.0
            vec[idx] += val

        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            return [round(x / norm, 6) for x in vec]
        return [round(1.0 / math.sqrt(dim), 6)] * dim

    async def get_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts using Ollama batch or sequential."""
        if not texts:
            return []

        cleaned_texts = [t.replace("\n", " ").strip() or " " for t in texts]

        # 1. Try Ollama batch embedding endpoint (/api/embed)
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                res = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.embed_model, "input": cleaned_texts}
                )
                if res.status_code == 200:
                    data = res.json()
                    embs = data.get("embeddings", [])
                    if len(embs) == len(cleaned_texts):
                        return embs
            except Exception:
                pass

        # 2. Fallback to sequential get_embedding
        results = []
        for text in cleaned_texts:
            emb = await self.get_embedding(text)
            results.append(emb)
        return results

    async def generate_response(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.1
    ) -> str:
        """
        Generate LLM response using Ollama's /api/generate endpoint.
        """
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                payload = {
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": temperature
                    }
                }
                if system_prompt:
                    payload["system"] = system_prompt

                res = await client.post(f"{self.base_url}/api/generate", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    return data.get("response", "").strip()

                raise RuntimeError(
                    f"Ollama generation failed ({res.status_code}): {res.text}. "
                    f"Ensure model '{self.model}' is installed (run: ollama pull {self.model})."
                )
            except httpx.ConnectError:
                raise ConnectionError(
                    f"Cannot reach Ollama at {self.base_url}. Please ensure Ollama is running."
                )

# Global singleton
ollama_service = OllamaService()
