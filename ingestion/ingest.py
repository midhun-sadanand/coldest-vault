#!/usr/bin/env python3
"""
Main ingestion script for processing Google Drive documents.
"""

import argparse
import csv
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from tqdm import tqdm

from config import get_settings
from google_drive import GoogleDriveClient, DriveFile
from ocr import TesseractOCR, GoogleVisionOCR, process_document
from entity_extraction import EntityExtractor
from embeddings import EmbeddingsClient, build_text_for_embedding
from typesense_client import TypeSenseClient


# Supported file types
SUPPORTED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/gif',
    'image/webp'
]

# Files to skip by exact name (case-sensitive)
EXCLUDED_FILE_NAMES = {
    "MG unpublished manuscript - New Cold War.docx",
    "Sadanand, Midhun - MG unpublished manuscript review",
    "MG writings & early research guidance.docx",
    "Ike, Truman Library Research Questions",
    "Dissertation_Compiled_12.17.15.docx",
}

# folder_path label assigned to all documents ingested by this script
FOLDER_LABEL = "MG Assorted Documents"

# Folders whose documents are secondary sources (academic papers, analysis)
SECONDARY_FOLDERS = {"MG Assorted Documents"}


def process_file(
    drive_client: GoogleDriveClient,
    file: DriveFile,
    ocr_engine,
    entity_extractor: EntityExtractor,
    embeddings_client: EmbeddingsClient,
    verbose: bool = False
) -> Optional[Dict[str, Any]]:
    """
    Process a single file through the ingestion pipeline.
    
    Returns:
        Document dict ready for indexing, or None on failure
    """
    try:
        # Download file
        if verbose:
            print(f"  📥 Downloading {file.name}...")
        content = drive_client.download_file(file.id)
        
        # OCR
        if verbose:
            print(f"  🔍 Running OCR...")
        ocr_text = process_document(content, file.mime_type, ocr_engine)
        
        if not ocr_text.strip():
            print(f"  ⚠️ No text extracted from {file.name}")
            ocr_text = "(No text could be extracted)"
        
        # Entity extraction
        if verbose:
            print(f"  🏷️  Extracting entities...")
        entities = entity_extractor.extract(ocr_text)
        
        # Build text for embedding
        text_for_embedding = build_text_for_embedding(
            ocr_content=ocr_text,
            summary=entities['summary'],
            people=entities['people'],
            locations=entities['locations'],
            dates=entities['dates']
        )
        
        # Generate embedding
        if verbose:
            print(f"  🧠 Generating embedding...")
        embedding = embeddings_client.generate(text_for_embedding)
        
        # Build text for search (combines everything for fuzzy search)
        text_for_search = f"{file.name} {entities['summary']} {' '.join(entities['people'])} {' '.join(entities['locations'])} {' '.join(entities['dates'])} {ocr_text[:5000]}"
        
        # Create document
        now = int(datetime.now().timestamp())
        document = {
            "file_path": f"gdrive://{file.id}/{file.name}",
            "file_name": file.name,
            "drive_file_id": file.id,
            "web_view_link": file.web_view_link or "",
            "folder_path": FOLDER_LABEL,
            "source_type": "secondary" if FOLDER_LABEL in SECONDARY_FOLDERS else "primary",
            "people": entities['people'],
            "locations": entities['locations'],
            "dates": entities['dates'],
            "publication_date": entities.get('publication_date', ''),
            "summary": entities['summary'],
            "ocr_content": ocr_text,
            "text_for_search": text_for_search,
            "embedding": embedding,
            "created_at": now,
            "updated_at": now
        }
        
        if verbose:
            print(f"  ✅ Processed: {file.name}")
            print(f"     People: {', '.join(entities['people'][:3])}{'...' if len(entities['people']) > 3 else ''}")
            print(f"     Summary: {entities['summary'][:100]}...")
        
        return document
        
    except Exception as e:
        print(f"  ❌ Error processing {file.name}: {e}")
        return None


def export_to_csv(documents: List[Dict[str, Any]], output_path: str) -> None:
    """Export processed documents to CSV (without embeddings)."""
    if not documents:
        return
    
    # Fields to export (excluding embedding)
    fields = ['file_path', 'file_name', 'drive_file_id', 'web_view_link',
              'people', 'locations', 'dates', 'summary', 'ocr_content']
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        
        for doc in documents:
            row = {k: doc.get(k, '') for k in fields}
            # Convert lists to strings
            for key in ['people', 'locations', 'dates']:
                if isinstance(row[key], list):
                    row[key] = '; '.join(row[key])
            writer.writerow(row)
    
    print(f"📄 Exported {len(documents)} documents to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Ingest documents from Google Drive")
    parser.add_argument('--folder-id', type=str, help="Google Drive folder ID to ingest from (overrides GOOGLE_DRIVE_FOLDER_ID in .env)")
    parser.add_argument('--limit', type=int, help="Maximum number of files to process")
    parser.add_argument('--reprocess', action='store_true', help="Reprocess files even if already indexed")
    parser.add_argument('--dry-run', action='store_true', help="List files without processing")
    parser.add_argument('--ocr-engine', choices=['tesseract', 'vision'], default='tesseract',
                        help="OCR engine to use (default: tesseract)")
    parser.add_argument('--batch-size', type=int, default=10, help="Batch size for indexing")
    parser.add_argument('--verbose', '-v', action='store_true', help="Verbose output")
    parser.add_argument('--export-csv', type=str, help="Export results to CSV file")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("📚 DOCUMENT INGESTION PIPELINE")
    print("=" * 60)
    
    # Initialize clients
    print("\n🔧 Initializing clients...")
    
    drive_client = GoogleDriveClient(credentials_path="../data/credentials.json")
    drive_client.token_path = "../data/token.json"
    drive_client.authenticate()
    
    # OCR engine
    if args.ocr_engine == 'vision':
        ocr_engine = GoogleVisionOCR()
        print("   OCR Engine: Google Cloud Vision")
    else:
        ocr_engine = TesseractOCR()
        print("   OCR Engine: tesseract")
    
    # TypeSense
    typesense_client = TypeSenseClient()
    typesense_client.create_collection()
    
    # Get existing file paths (to skip already processed)
    existing_paths = set()
    if not args.reprocess:
        existing_paths = typesense_client.get_existing_file_paths()
        print(f"   Existing documents: {len(existing_paths)}")
    
    # Entity extractor and embeddings (only if not dry run)
    entity_extractor = None
    embeddings_client = None
    if not args.dry_run:
        entity_extractor = EntityExtractor()
        embeddings_client = EmbeddingsClient()
    
    # List files (non-recursive: the only subfolder contains already-scanned docs)
    print("\n📁 Listing files from Google Drive...")
    all_files: List[DriveFile] = list(
        drive_client.list_files(
            folder_id=args.folder_id or None,
            mime_types=SUPPORTED_MIME_TYPES,
            recursive=False
        )
    )
    
    print(f"   Total files in folder: {len(all_files)}")
    
    # Filter out excluded file names and already-processed files
    files_to_process = []
    for f in all_files:
        if f.name in EXCLUDED_FILE_NAMES:
            print(f"   ⏭️  Skipping excluded file: {f.name}")
            continue
        file_path = f"gdrive://{f.id}/{f.name}"
        if file_path not in existing_paths:
            files_to_process.append(f)
    
    if args.limit:
        files_to_process = files_to_process[:args.limit]
    
    print(f"   Files to process: {len(files_to_process)}")
    
    # Dry run - just list files
    if args.dry_run:
        print("\n🔍 DRY RUN - Files that would be processed:")
        for f in files_to_process[:20]:  # Show first 20
            print(f"   📄 {f.name} ({f.mime_type})")
        if len(files_to_process) > 20:
            print(f"   ... and {len(files_to_process) - 20} more")
        return
    
    # Process files
    print(f"\n🚀 Processing {len(files_to_process)} files...")
    
    processed_documents = []
    failed_count = 0
    
    with tqdm(total=len(files_to_process), unit="file") as pbar:
        for file in files_to_process:
            pbar.set_postfix_str(file.name[:40] + "..." if len(file.name) > 40 else file.name)
            
            doc = process_file(
                drive_client=drive_client,
                file=file,
                ocr_engine=ocr_engine,
                entity_extractor=entity_extractor,
                embeddings_client=embeddings_client,
                verbose=args.verbose
            )
            
            if doc:
                processed_documents.append(doc)
                
                # Index in batches
                if len(processed_documents) >= args.batch_size:
                    typesense_client.index_documents(processed_documents)
                    processed_documents = []
            else:
                failed_count += 1
            
            pbar.update(1)
    
    # Index remaining documents
    if processed_documents:
        typesense_client.index_documents(processed_documents)
    
    # Export to CSV if requested
    if args.export_csv and processed_documents:
        export_to_csv(processed_documents, args.export_csv)
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    success_count = len(files_to_process) - failed_count
    print(f"   ✅ Successfully indexed: {success_count}")
    print(f"   ❌ Failed: {failed_count}")
    print(f"   📊 Total documents in collection: {typesense_client.count_documents()}")


if __name__ == "__main__":
    main()
