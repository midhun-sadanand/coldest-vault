"""
Lightweight script to capture folder paths from Google Drive
and update existing TypeSense documents.

This script does NOT re-run OCR or entity extraction - it only
captures the folder hierarchy and updates documents with folder_path.
"""

import os
import sys
from typing import Dict, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from config import get_settings
from typesense_client import TypeSenseClient

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']


class FolderPathCapture:
    """Captures folder paths from Google Drive."""
    
    def __init__(self):
        self.settings = get_settings()
        self.service = None
        self.typesense = TypeSenseClient()
        
    def authenticate(self) -> None:
        """Authenticate with Google Drive API."""
        creds = None
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        token_path = os.path.join(base_dir, "data/token.json")
        credentials_path = os.path.join(base_dir, "data/credentials.json")
        
        if os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
        
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
                creds = flow.run_local_server(port=0)
            
            os.makedirs(os.path.dirname(token_path), exist_ok=True)
            with open(token_path, 'w') as token:
                token.write(creds.to_json())
        
        self.service = build('drive', 'v3', credentials=creds)
        print("✅ Authenticated with Google Drive")
    
    def get_folder_name(self, folder_id: str) -> str:
        """Get the name of a folder by ID."""
        result = self.service.files().get(
            fileId=folder_id,
            fields="name"
        ).execute()
        return result.get('name', '')
    
    def build_folder_mapping(self, root_folder_id: str, skip_levels: int = 2) -> Dict[str, str]:
        """
        Traverse Google Drive and build a mapping of file_id -> folder_path.
        
        Args:
            root_folder_id: The root folder to start from
            skip_levels: Number of folder levels to skip from the path (default 2 to skip root + trip folders)
        
        Returns:
            Dict mapping drive_file_id to folder path string
        """
        if not self.service:
            self.authenticate()
        
        file_to_path: Dict[str, str] = {}
        
        # Use " > " as delimiter to avoid conflicts with "/" in folder names
        DELIMITER = " > "
        
        # Queue of (folder_id, current_path, depth)
        # Start with root folder at depth 0
        root_name = self.get_folder_name(root_folder_id)
        folders_to_process = [(root_folder_id, root_name, 0)]
        processed_folders = set()
        
        print(f"📂 Starting traversal from: {root_name}")
        print(f"📂 Skipping first {skip_levels} levels from paths")
        
        while folders_to_process:
            current_folder_id, current_path, depth = folders_to_process.pop(0)
            
            if current_folder_id in processed_folders:
                continue
            processed_folders.add(current_folder_id)
            
            print(f"  📁 Processing (depth {depth}): {current_path}")
            
            # List all items in current folder
            page_token = None
            while True:
                results = self.service.files().list(
                    q=f"'{current_folder_id}' in parents and trashed = false",
                    pageSize=100,
                    pageToken=page_token,
                    fields="nextPageToken, files(id, name, mimeType)"
                ).execute()
                
                files = results.get('files', [])
                
                for file in files:
                    if file['mimeType'] == 'application/vnd.google-apps.folder':
                        # It's a subfolder - add to queue with updated path
                        subfolder_path = f"{current_path}{DELIMITER}{file['name']}" if current_path else file['name']
                        if file['id'] not in processed_folders:
                            folders_to_process.append((file['id'], subfolder_path, depth + 1))
                    else:
                        # It's a file - store the mapping
                        # Skip the first N levels from the path
                        path_parts = current_path.split(DELIMITER) if current_path else []
                        display_path = DELIMITER.join(path_parts[skip_levels:]) if len(path_parts) > skip_levels else ""
                        file_to_path[file['id']] = display_path if display_path else "Root"
                
                page_token = results.get('nextPageToken')
                if not page_token:
                    break
        
        print(f"\n✅ Found {len(file_to_path)} files across {len(processed_folders)} folders")
        return file_to_path
    
    def update_typesense_documents(self, file_to_path: Dict[str, str]) -> None:
        """Update existing TypeSense documents with folder paths."""
        print("\n📝 Fetching existing documents from TypeSense...")
        
        # Get all documents with their drive_file_id
        documents = self.typesense.get_all_documents(
            fields=['id', 'drive_file_id', 'file_name']
        )
        
        print(f"  Found {len(documents)} documents in TypeSense")
        
        updated = 0
        not_found = 0
        
        for doc in documents:
            drive_file_id = doc.get('drive_file_id')
            doc_id = doc.get('id')
            
            if not drive_file_id or not doc_id:
                continue
            
            if drive_file_id in file_to_path:
                folder_path = file_to_path[drive_file_id]
                success = self.typesense.update_document(doc_id, {'folder_path': folder_path})
                if success:
                    updated += 1
                    print(f"  ✓ {doc.get('file_name', 'Unknown')[:40]} → {folder_path}")
            else:
                not_found += 1
                print(f"  ⚠️ No folder found for: {doc.get('file_name', 'Unknown')}")
        
        print(f"\n✅ Updated {updated} documents with folder paths")
        if not_found > 0:
            print(f"⚠️ {not_found} documents had no matching folder")


def main():
    """Main entry point."""
    settings = get_settings()
    
    if not settings.google_drive_folder_id:
        print("❌ GOOGLE_DRIVE_FOLDER_ID not set in environment")
        sys.exit(1)
    
    capture = FolderPathCapture()
    
    print("=" * 60)
    print("FOLDER PATH CAPTURE")
    print("=" * 60)
    print("This will traverse Google Drive and update TypeSense documents")
    print("with folder path information. No OCR or re-processing needed.\n")
    
    # First, ensure the folder_path field exists in the schema
    print("📋 Ensuring folder_path field exists in TypeSense schema...")
    capture.typesense.add_field_to_schema({
        "name": "folder_path",
        "type": "string",
        "facet": True,
        "optional": True
    })
    
    # Build the mapping
    file_to_path = capture.build_folder_mapping(settings.google_drive_folder_id)
    
    # Show some examples
    if file_to_path:
        print("\n📋 Sample mappings:")
        for i, (file_id, path) in enumerate(list(file_to_path.items())[:5]):
            print(f"  {file_id[:20]}... → {path}")
        if len(file_to_path) > 5:
            print(f"  ... and {len(file_to_path) - 5} more")
    
    # Update TypeSense
    capture.update_typesense_documents(file_to_path)
    
    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
