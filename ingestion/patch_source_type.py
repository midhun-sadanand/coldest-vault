#!/usr/bin/env python3
"""
One-off script to backfill source_type on all existing documents.
  - "MG Assorted Documents" folder → secondary
  - Everything else → primary
"""

import typesense
from config import get_settings

SECONDARY_FOLDER = "MG Assorted Documents"


def main():
    settings = get_settings()
    client = typesense.Client({
        'nodes': [{'host': settings.typesense_host,
                   'port': settings.typesense_port,
                   'protocol': settings.typesense_protocol}],
        'api_key': settings.typesense_api_key,
        'connection_timeout_seconds': 10
    })
    collection = settings.typesense_collection_name

    # First ensure the field exists in the schema
    try:
        client.collections[collection].update({
            "fields": [{"name": "source_type", "type": "string", "facet": True, "optional": True}]
        })
        print("✅ source_type field added/confirmed in schema")
    except Exception as e:
        print(f"  ℹ️  Schema update: {e}")

    # Fetch all documents
    print("\nFetching all documents...")
    all_docs = []
    page = 1
    while True:
        results = client.collections[collection].documents.search({
            'q': '*',
            'query_by': 'file_name',
            'per_page': 250,
            'page': page,
            'include_fields': 'id,file_name,folder_path',
        })
        hits = results.get('hits', [])
        if not hits:
            break
        for hit in hits:
            all_docs.append(hit['document'])
        if len(hits) < 250:
            break
        page += 1

    print(f"Loaded {len(all_docs)} documents.\n")

    primary_count = 0
    secondary_count = 0
    failed = 0

    for doc in all_docs:
        folder = doc.get('folder_path', '')
        source_type = 'secondary' if folder == SECONDARY_FOLDER else 'primary'
        try:
            client.collections[collection].documents[doc['id']].update(
                {'source_type': source_type}
            )
            if source_type == 'secondary':
                secondary_count += 1
            else:
                primary_count += 1
        except Exception as e:
            print(f"  ❌ Failed to update {doc['file_name']}: {e}")
            failed += 1

    print(f"{'='*50}")
    print(f"Primary:   {primary_count}")
    print(f"Secondary: {secondary_count}")
    print(f"Failed:    {failed}")


if __name__ == '__main__':
    main()
