"""
Configuration settings for the ingestion pipeline.
"""

import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional

# Force load .env first, before pydantic reads anything
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # OpenAI
    openai_api_key: str = Field(..., env="OPENAI_API_KEY")
    openai_embedding_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-4o-mini"
    
    # TypeSense
    typesense_api_key: str = Field(..., env="TYPESENSE_API_KEY")
    typesense_host: str = Field(default="localhost", env="TYPESENSE_HOST")
    typesense_port: int = Field(default=8108, env="TYPESENSE_PORT")
    typesense_protocol: str = Field(default="http", env="TYPESENSE_PROTOCOL")
    typesense_collection_name: str = Field(default="documents", env="TYPESENSE_COLLECTION_NAME")
    
    # Google Drive
    google_client_id: Optional[str] = Field(default=None, env="GOOGLE_CLIENT_ID")
    google_client_secret: Optional[str] = Field(default=None, env="GOOGLE_CLIENT_SECRET")
    google_drive_folder_id: Optional[str] = Field(default=None, env="GOOGLE_DRIVE_FOLDER_ID")
    
    # Google Cloud Vision (optional, for better OCR)
    google_cloud_project_id: Optional[str] = Field(default=None, env="GOOGLE_CLOUD_PROJECT_ID")
    
    # Processing settings
    max_ocr_pages: int = Field(default=50, description="Maximum pages to OCR per document")
    embedding_dimension: int = 1536
    
    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# No caching - always get fresh settings
def get_settings() -> Settings:
    """Get settings instance."""
    return Settings()
