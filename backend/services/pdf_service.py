import os
from pathlib import Path
from typing import List, Dict, Any
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from backend.config import settings

import re

def extract_pages_from_pdf(file_path: str | Path) -> List[Dict[str, Any]]:
    """
    Extracts text page-by-page from a PDF file using pypdf.
    Uses layout mode to preserve word boundaries, presentation tables, and bullet points.
    Returns a list of dicts with 1-indexed page_number and extracted text.
    """
    path_obj = Path(file_path)
    if not path_obj.exists():
        raise FileNotFoundError(f"PDF file not found: {file_path}")

    try:
        reader = PdfReader(str(path_obj))
    except Exception as e:
        raise ValueError(f"Invalid or corrupted PDF file: {str(e)}")

    if len(reader.pages) == 0:
        raise ValueError("The PDF document contains 0 pages.")

    pages_data = []

    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        try:
            # 1. Try layout extraction mode first (preserves word boundaries and spacing)
            raw_text = ""
            try:
                raw_text = page.extract_text(extraction_mode="layout") or ""
            except Exception:
                raw_text = page.extract_text() or ""

            # If layout mode returned very little or failed, fallback to standard extraction
            if len(raw_text.strip()) < 10:
                standard_text = page.extract_text() or ""
                if len(standard_text.strip()) > len(raw_text.strip()):
                    raw_text = standard_text

            # 2. Normalize whitespace on each line while preserving lines and paragraphs
            lines = raw_text.splitlines()
            cleaned_lines = []
            for line in lines:
                normalized = re.sub(r'[ \t]+', ' ', line).strip()
                if normalized:
                    cleaned_lines.append(normalized)

            clean_text = "\n".join(cleaned_lines).strip()
            pages_data.append({
                "page_number": page_num,
                "text": clean_text
            })
        except Exception as e:
            # Keep record of page even if empty or failed
            pages_data.append({
                "page_number": page_num,
                "text": "",
                "error": str(e)
            })

    return pages_data

def process_and_chunk_pdf(file_path: str | Path, filename: str | None = None) -> Dict[str, Any]:
    """
    Extracts text from PDF and splits into overlapping chunks with metadata
    including filename and exact page number.
    """
    path_obj = Path(file_path)
    doc_name = filename or path_obj.name

    pages_data = extract_pages_from_pdf(path_obj)
    total_pages = len(pages_data)

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
        length_function=len,
    )

    all_chunks: List[Dict[str, Any]] = []
    chunk_counter = 0

    for page_item in pages_data:
        page_num = page_item["page_number"]
        page_text = page_item["text"]

        if not page_text:
            continue

        page_chunks = text_splitter.split_text(page_text)
        for chunk_text in page_chunks:
            chunk_trimmed = chunk_text.strip()
            if not chunk_trimmed:
                continue

            chunk_counter += 1
            all_chunks.append({
                "chunk_index": chunk_counter,
                "content": chunk_trimmed,
                "metadata": {
                    "source": doc_name,
                    "page_number": page_num,
                    "chunk_index": chunk_counter,
                    "length": len(chunk_trimmed)
                }
            })

    if len(all_chunks) == 0:
        raise ValueError(
            "No readable text found in the PDF. Please ensure the PDF is not an image-only scan or blank document."
        )

    return {
        "filename": doc_name,
        "total_pages": total_pages,
        "total_chunks": len(all_chunks),
        "chunks": all_chunks
    }
