"""
TypeSense client for indexing documents.
"""

from typing import List, Dict, Any, Set
import typesense

from config import get_settings


class TypeSenseClient:
    """Client for interacting with TypeSense."""
    
    SCHEMA = {
        "fields": [
            {"name": "file_path", "type": "string"},
            {"name": "file_name", "type": "string"},
            {"name": "drive_file_id", "type": "string"},
            {"name": "web_view_link", "type": "string", "optional": True},
            {"name": "folder_path", "type": "string", "facet": True, "optional": True},
            {"name": "people", "type": "string[]", "facet": True},
            {"name": "locations", "type": "string[]", "facet": True},
            {"name": "dates", "type": "string[]", "facet": True},
            {"name": "summary", "type": "string"},
            {"name": "ocr_content", "type": "string"},
            {"name": "text_for_search", "type": "string"},
            {"name": "embedding", "type": "float[]", "num_dim": 1536},
            {"name": "created_at", "type": "int64"},
            {"name": "updated_at", "type": "int64"}
        ]
    }
    
    def __init__(self):
        settings = get_settings()
        self.client = typesense.Client({
            'nodes': [{
                'host': settings.typesense_host,
                'port': settings.typesense_port,
                'protocol': settings.typesense_protocol
            }],
            'api_key': settings.typesense_api_key,
            'connection_timeout_seconds': 10
        })
        self.collection_name = settings.typesense_collection_name
    
    def create_collection(self) -> None:
        """Create the documents collection if it doesn't exist."""
        try:
            self.client.collections[self.collection_name].retrieve()
            print(f"✅ Collection '{self.collection_name}' already exists")
        except typesense.exceptions.ObjectNotFound:
            schema = {
                "name": self.collection_name,
                **self.SCHEMA
            }
            self.client.collections.create(schema)
            print(f"✅ Created collection '{self.collection_name}'")
    
    def add_field_to_schema(self, field: dict) -> bool:
        """Add a new field to the collection schema."""
        try:
            self.client.collections[self.collection_name].update({
                "fields": [field]
            })
            print(f"✅ Added field '{field['name']}' to schema")
            return True
        except Exception as e:
            print(f"⚠️ Could not add field: {e}")
            return False
    
    def count_documents(self) -> int:
        """Get the number of documents in the collection."""
        try:
            info = self.client.collections[self.collection_name].retrieve()
            return info.get('num_documents', 0)
        except typesense.exceptions.ObjectNotFound:
            return 0
    
    def get_existing_file_paths(self) -> Set[str]:
        """Get all file paths already in the collection."""
        existing = set()
        
        try:
            # Search for all documents, just get file_path
            page = 1
            per_page = 250
            
            while True:
                results = self.client.collections[self.collection_name].documents.search({
                    'q': '*',
                    'query_by': 'file_name',
                    'per_page': per_page,
                    'page': page,
                    'include_fields': 'file_path'
                })
                
                hits = results.get('hits', [])
                if not hits:
                    break
                
                for hit in hits:
                    doc = hit.get('document', {})
                    if 'file_path' in doc:
                        existing.add(doc['file_path'])
                
                if len(hits) < per_page:
                    break
                    
                page += 1
                
        except typesense.exceptions.ObjectNotFound:
            pass
        
        return existing
    
    def index_document(self, document: Dict[str, Any]) -> None:
        """Index a single document."""
        self.client.collections[self.collection_name].documents.create(document)
    
    def index_documents(self, documents: List[Dict[str, Any]], batch_size: int = 40) -> int:
        """
        Index multiple documents in batches.
        
        Returns:
            Number of successfully indexed documents
        """
        success_count = 0
        
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            
            try:
                results = self.client.collections[self.collection_name].documents.import_(
                    batch,
                    {'action': 'upsert'}
                )
                
                for result in results:
                    if result.get('success', False):
                        success_count += 1
                    else:
                        print(f"  ⚠️ Failed to index: {result.get('error', 'Unknown error')}")
                        
            except Exception as e:
                print(f"  ⚠️ Batch indexing error: {e}")
        
        return success_count
    
    def update_document(self, doc_id: str, updates: Dict[str, Any]) -> bool:
        """Update specific fields of a document."""
        try:
            self.client.collections[self.collection_name].documents[doc_id].update(updates)
            return True
        except Exception as e:
            print(f"  ⚠️ Update error for {doc_id}: {e}")
            return False
    
    def get_all_documents(self, fields: List[str] = None) -> List[Dict[str, Any]]:
        """Get all documents from the collection."""
        documents = []
        page = 1
        per_page = 250
        
        include_fields = ','.join(fields) if fields else '*'
        
        while True:
            try:
                results = self.client.collections[self.collection_name].documents.search({
                    'q': '*',
                    'query_by': 'file_name',
                    'per_page': per_page,
                    'page': page,
                    'include_fields': include_fields
                })
                
                hits = results.get('hits', [])
                if not hits:
                    break
                
                for hit in hits:
                    doc = hit.get('document', {})
                    documents.append(doc)
                
                if len(hits) < per_page:
                    break
                    
                page += 1
                
            except Exception as e:
                print(f"  ⚠️ Error fetching documents: {e}")
                break
        
        return documents
    
    def get_facet_counts(self, facet_field: str) -> Dict[str, int]:
        """Get counts for each value of a faceted field."""
        try:
            results = self.client.collections[self.collection_name].documents.search({
                'q': '*',
                'query_by': 'file_name',
                'facet_by': facet_field,
                'max_facet_values': 1000,
                'per_page': 0
            })
            
            facet_counts = {}
            for facet in results.get('facet_counts', []):
                if facet.get('field_name') == facet_field:
                    for value in facet.get('counts', []):
                        facet_counts[value['value']] = value['count']
            
            return facet_counts
            
        except Exception as e:
            print(f"  ⚠️ Error getting facets: {e}")
            return {}
