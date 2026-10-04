import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Locate project root and load .env file
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
ENV_FILE = PROJECT_ROOT / ".env"

if ENV_FILE.exists():
    load_dotenv(dotenv_path=ENV_FILE)
else:
    load_dotenv()

class Settings(BaseSettings):
    # Ollama Configuration
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    OLLAMA_EMBEDDING_MODEL: str = (
        os.getenv("OLLAMA_EMBEDDING_MODEL", "").strip()
        or os.getenv("OLLAMA_EMBED_MODEL", "").strip()
        or "nomic-embed-text"
    )
    OLLAMA_EMBED_MODEL: str = OLLAMA_EMBEDDING_MODEL

    # Supabase / PostgreSQL Database Configuration
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # Vector & RAG Parameters
    EMBEDDING_DIMENSION: int = int(os.getenv("EMBEDDING_DIMENSION", "768"))
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "800"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "150"))
    SIMILARITY_THRESHOLD: float = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))
    TOP_K_CHUNKS: int = int(os.getenv("TOP_K_CHUNKS", "4"))

    # Server Configuration
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))

    # Storage paths
    BASE_DIR: Path = BASE_DIR
    PROJECT_ROOT: Path = PROJECT_ROOT
    DOCUMENTS_DIR: Path = PROJECT_ROOT / "documents"

    @property
    def has_supabase_creds(self) -> bool:
        return bool(self.SUPABASE_URL.strip() and self.SUPABASE_KEY.strip())

    @property
    def has_postgres_url(self) -> bool:
        return bool(self.DATABASE_URL.strip())

    class Config:
        case_sensitive = True

settings = Settings()
settings.DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
