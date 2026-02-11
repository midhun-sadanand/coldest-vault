"""
Entity extraction using OpenAI GPT.
"""

import json
from typing import Dict, Any, Optional
from openai import OpenAI

from config import get_settings


class EntityExtractor:
    """Extract entities (people, locations, dates, summary) from document text."""
    
    EXTRACTION_PROMPT = """Analyze the following document text and extract:
1. People: Names of individuals mentioned
2. Locations: Places, countries, cities, addresses mentioned  
3. Dates: Any dates or time periods mentioned
4. Summary: A brief 2-3 sentence summary of the document's content

Return your response as a JSON object with these exact keys:
{
    "people": ["name1", "name2", ...],
    "locations": ["location1", "location2", ...],
    "dates": ["date1", "date2", ...],
    "summary": "Brief summary here"
}

If no entities of a type are found, use an empty array [].
Only return valid JSON, no other text.

Document text:
"""

    def __init__(self):
        settings = get_settings()
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_chat_model
    
    def extract(self, text: str, max_chars: int = 15000) -> Dict[str, Any]:
        """
        Extract entities from document text.
        
        Args:
            text: Document text
            max_chars: Maximum characters to send to API
            
        Returns:
            Dictionary with people, locations, dates, summary
        """
        # Truncate if too long
        truncated_text = text[:max_chars]
        if len(text) > max_chars:
            truncated_text += "\n\n[Document truncated...]"
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a document analyst that extracts structured information from historical documents. Always respond with valid JSON only."
                    },
                    {
                        "role": "user",
                        "content": self.EXTRACTION_PROMPT + truncated_text
                    }
                ],
                temperature=0.1,
                max_tokens=1000
            )
            
            content = response.choices[0].message.content.strip()
            
            # Try to parse JSON
            # Handle markdown code blocks if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
                content = content.strip()
            
            result = json.loads(content)
            
            # Ensure all required keys exist
            return {
                "people": result.get("people", []),
                "locations": result.get("locations", []),
                "dates": result.get("dates", []),
                "summary": result.get("summary", "")
            }
            
        except json.JSONDecodeError as e:
            print(f"  ⚠️ JSON parse error: {e}")
            return self._empty_result()
        except Exception as e:
            print(f"⚠️  Entity extraction error: {e}")
            return self._empty_result()
    
    def _empty_result(self) -> Dict[str, Any]:
        """Return empty result structure."""
        return {
            "people": [],
            "locations": [],
            "dates": [],
            "summary": ""
        }
