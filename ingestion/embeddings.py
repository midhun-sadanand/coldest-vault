"""
Embedding generation using OpenAI.
"""

from typing import List
from openai import OpenAI
import time

from config import get_settings


class EmbeddingsClient:
    """Client for generating embeddings using OpenAI."""
    
    def __init__(self):
        settings = get_settings()
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_embedding_model
        self.dimension = settings.embedding_dimension
    
    def generate(self, text: str, max_retries: int = 3) -> List[float]:
        """
        Generate embedding for text.
        
        Args:
            text: Text to embed
            max_retries: Number of retries on failure
            
        Returns:
            Embedding vector as list of floats
        """
        # Truncate if too long (roughly 8k tokens limit)
        max_chars = 30000
        if len(text) > max_chars:
            text = text[:max_chars]
        
        for attempt in range(max_retries):
            try:
                response = self.client.embeddings.create(
                    model=self.model,
                    input=text
                )
                return response.data[0].embedding
                
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    print(f"  ⚠️ Embedding error, retrying in {wait}s: {e}")
                    time.sleep(wait)
                else:
                    raise


def build_text_for_embedding(
    ocr_content: str,
    summary: str,
    people: List[str],
    locations: List[str],
    dates: List[str]
) -> str:
    """
    Build text optimized for embedding generation.
    
    Combines summary, entities, and OCR content in a way that
    captures the document's semantic meaning.
    """
    parts = []
    
    if summary:
        parts.append(f"Summary: {summary}")
    
    if people:
        parts.append(f"People mentioned: {', '.join(people)}")
    
    if locations:
        parts.append(f"Locations: {', '.join(locations)}")
    
    if dates:
        parts.append(f"Dates: {', '.join(dates)}")
    
    if ocr_content:
        # Take first portion of OCR content
        ocr_preview = ocr_content[:5000]
        parts.append(f"Content: {ocr_preview}")
    
    return "\n\n".join(parts)
