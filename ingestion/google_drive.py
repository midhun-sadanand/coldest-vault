"""
Google Drive client for listing and downloading files.
"""

import os
import io
from typing import Optional, List, Generator
from dataclasses import dataclass
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from config import get_settings


# Scopes for Google Drive API
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']


@dataclass
class DriveFile:
    """Represents a file from Google Drive."""
    id: str
    name: str
    mime_type: str
    web_view_link: Optional[str] = None
    thumbnail_link: Optional[str] = None
    created_time: Optional[str] = None
    modified_time: Optional[str] = None
    size: Optional[int] = None


class GoogleDriveClient:
    """Client for interacting with Google Drive API."""
    
    def __init__(self, credentials_path: str = "data/credentials.json"):
        self.credentials_path = credentials_path
        self.token_path = "data/token.json"
        self.service = None
        
    def authenticate(self) -> None:
        """Authenticate with Google Drive API."""
        creds = None
        
        # Load existing token
        if os.path.exists(self.token_path):
            creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
        
        # Refresh or get new credentials
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not os.path.exists(self.credentials_path):
                    raise FileNotFoundError(
                        f"Credentials file not found at {self.credentials_path}. "
                        "Download it from Google Cloud Console."
                    )
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_path, SCOPES
                )
                creds = flow.run_local_server(port=0)
            
            # Save token for future use
            os.makedirs(os.path.dirname(self.token_path), exist_ok=True)
            with open(self.token_path, 'w') as token:
                token.write(creds.to_json())
        
        self.service = build('drive', 'v3', credentials=creds)
        print("✅ Authenticated with Google Drive")
    
    def list_files(
        self,
        folder_id: Optional[str] = None,
        page_size: int = 100,
        mime_types: Optional[List[str]] = None,
        recursive: bool = True
    ) -> Generator[DriveFile, None, None]:
        """
        List files in a Google Drive folder.
        
        Args:
            folder_id: ID of the folder to list (None for root)
            page_size: Number of files per page
            mime_types: Filter by MIME types (e.g., ['image/jpeg', 'application/pdf'])
            recursive: If True, also list files in subfolders
            
        Yields:
            DriveFile objects
        """
        if not self.service:
            self.authenticate()
        
        settings = get_settings()
        folder_id = folder_id or settings.google_drive_folder_id
        
        # Track folders to process (for recursive search)
        folders_to_process = [folder_id] if folder_id else [None]
        processed_folders = set()
        total_files = 0
        
        while folders_to_process:
            current_folder = folders_to_process.pop(0)
            
            if current_folder in processed_folders:
                continue
            processed_folders.add(current_folder)
            
            # Build query for this folder
            query_parts = []
            if current_folder:
                query_parts.append(f"'{current_folder}' in parents")
            query_parts.append("trashed = false")
            
            # For files, filter by mime type; for folders, we need a separate query
            if mime_types:
                mime_filter = " or ".join([f"mimeType = '{mt}'" for mt in mime_types])
                file_query = " and ".join(query_parts + [f"({mime_filter})"])
            else:
                file_query = " and ".join(query_parts)
            
            # List files in current folder
            page_token = None
            while True:
                results = self.service.files().list(
                    q=file_query,
                    pageSize=page_size,
                    pageToken=page_token,
                    fields="nextPageToken, files(id, name, mimeType, webViewLink, thumbnailLink, createdTime, modifiedTime, size)"
                ).execute()
                
                files = results.get('files', [])
                
                for file in files:
                    total_files += 1
                    yield DriveFile(
                        id=file['id'],
                        name=file['name'],
                        mime_type=file['mimeType'],
                        web_view_link=file.get('webViewLink'),
                        thumbnail_link=file.get('thumbnailLink'),
                        created_time=file.get('createdTime'),
                        modified_time=file.get('modifiedTime'),
                        size=int(file['size']) if file.get('size') else None
                    )
                
                page_token = results.get('nextPageToken')
                if not page_token:
                    break
            
            # If recursive, find subfolders and add to queue
            if recursive and current_folder:
                folder_query = f"'{current_folder}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
                folder_results = self.service.files().list(
                    q=folder_query,
                    pageSize=100,
                    fields="files(id, name)"
                ).execute()
                
                for subfolder in folder_results.get('files', []):
                    if subfolder['id'] not in processed_folders:
                        print(f"  📂 Found subfolder: {subfolder['name']}")
                        folders_to_process.append(subfolder['id'])
        
        print(f"📁 Found {total_files} files total (across all folders)")
    
    def download_file(self, file_id: str) -> bytes:
        """
        Download a file's content.
        
        Args:
            file_id: The ID of the file to download
            
        Returns:
            File content as bytes
        """
        if not self.service:
            self.authenticate()
        
        request = self.service.files().get_media(fileId=file_id)
        file_handle = io.BytesIO()
        downloader = MediaIoBaseDownload(file_handle, request)
        
        done = False
        while not done:
            _, done = downloader.next_chunk()
        
        return file_handle.getvalue()
    
    def get_file_metadata(self, file_id: str) -> DriveFile:
        """Get metadata for a specific file."""
        if not self.service:
            self.authenticate()
        
        file = self.service.files().get(
            fileId=file_id,
            fields="id, name, mimeType, webViewLink, thumbnailLink, createdTime, modifiedTime, size"
        ).execute()
        
        return DriveFile(
            id=file['id'],
            name=file['name'],
            mime_type=file['mimeType'],
            web_view_link=file.get('webViewLink'),
            thumbnail_link=file.get('thumbnailLink'),
            created_time=file.get('createdTime'),
            modified_time=file.get('modifiedTime'),
            size=int(file['size']) if file.get('size') else None
        )
