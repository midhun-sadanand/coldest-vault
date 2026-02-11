"""
Standardize people names across all documents using GPT.

This script:
1. Fetches all unique people names from TypeSense
2. Uses GPT to suggest standardized names (proper case, merge duplicates)
3. Updates documents with standardized names
"""

import os
import sys
import json
from typing import Dict, List, Set
from openai import OpenAI

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import get_settings
from typesense_client import TypeSenseClient


def get_all_people(client: TypeSenseClient) -> Dict[str, int]:
    """Get all unique people names and their document counts."""
    print("📋 Fetching all people names from TypeSense...")
    return client.get_facet_counts('people')


def standardize_names_with_gpt(names: List[str], openai_client: OpenAI) -> Dict[str, str]:
    """
    Use GPT to standardize a batch of names.
    
    Returns:
        Dict mapping original name -> standardized name
    """
    prompt = f"""You are standardizing names extracted from historical documents (Eisenhower era, 1950s).

Given these names, please:
1. Convert ALL CAPS to proper Title Case (e.g., "JAMES S. LAY" → "James S. Lay")
2. Identify names that refer to the same person and map them to a canonical form
3. Flag any entries that are NOT real people (e.g., organizations, titles without names)
4. Keep middle initials when present
5. For well-known historical figures, use their commonly known name

Here are the names to standardize:
{json.dumps(names, indent=2)}

Respond with a JSON object mapping each original name to its standardized form.
If a name is not a real person, map it to null.
If names are duplicates/variations of the same person, map them to the same canonical name.

Example response format:
{{
  "JAMES S. LAY": "James S. Lay",
  "James Lay": "James S. Lay",
  "J. Lay": "James S. Lay",
  "THE PRESIDENT": null,
  "Dwight D. Eisenhower": "Dwight D. Eisenhower",
  "EISENHOWER": "Dwight D. Eisenhower"
}}

Return ONLY the JSON object, no other text."""

    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        response_format={"type": "json_object"}
    )
    
    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        print("  ⚠️ Failed to parse GPT response")
        return {}


def update_documents_with_standardized_names(
    client: TypeSenseClient,
    name_mapping: Dict[str, str]
) -> int:
    """
    Update all documents with standardized people names.
    
    Returns:
        Number of documents updated
    """
    print("\n📝 Updating documents with standardized names...")
    
    # Get all documents with people
    documents = client.get_all_documents(fields=['id', 'people', 'file_name'])
    
    updated_count = 0
    
    for doc in documents:
        doc_id = doc.get('id')
        original_people = doc.get('people', [])
        
        if not doc_id or not original_people:
            continue
        
        # Map each person to their standardized name
        new_people: List[str] = []
        changed = False
        
        for person in original_people:
            if person in name_mapping:
                standardized = name_mapping[person]
                if standardized is not None:  # None means it's not a real person
                    if standardized != person:
                        changed = True
                    if standardized not in new_people:  # Avoid duplicates
                        new_people.append(standardized)
                else:
                    changed = True  # Removing non-person entries
            else:
                # Keep as-is if not in mapping
                if person not in new_people:
                    new_people.append(person)
        
        if changed:
            success = client.update_document(doc_id, {'people': new_people})
            if success:
                updated_count += 1
                print(f"  ✓ {doc.get('file_name', 'Unknown')[:50]}")
    
    return updated_count


def main():
    """Main entry point."""
    settings = get_settings()
    
    print("=" * 60)
    print("PEOPLE NAME STANDARDIZATION")
    print("=" * 60)
    print("This will use GPT to standardize people names across all documents.\n")
    
    # Initialize clients
    typesense = TypeSenseClient()
    openai_client = OpenAI(api_key=settings.openai_api_key)
    
    # Get all unique people
    people_counts = get_all_people(typesense)
    all_names = list(people_counts.keys())
    
    print(f"  Found {len(all_names)} unique people names\n")
    
    if not all_names:
        print("❌ No people names found in documents")
        return
    
    # Process in batches to avoid token limits
    batch_size = 100
    full_mapping: Dict[str, str] = {}
    
    for i in range(0, len(all_names), batch_size):
        batch = all_names[i:i + batch_size]
        print(f"🔄 Processing batch {i // batch_size + 1} ({len(batch)} names)...")
        
        batch_mapping = standardize_names_with_gpt(batch, openai_client)
        full_mapping.update(batch_mapping)
    
    # Show the mapping
    print("\n📋 Name standardization mapping:")
    changes = 0
    removals = 0
    for original, standardized in sorted(full_mapping.items()):
        if standardized is None:
            print(f"  ✗ \"{original}\" → (removed - not a person)")
            removals += 1
        elif original != standardized:
            print(f"  → \"{original}\" → \"{standardized}\"")
            changes += 1
    
    print(f"\n  {changes} names to change, {removals} non-person entries to remove")
    print(f"  {len(full_mapping) - changes - removals} names unchanged\n")
    
    # Update documents
    updated = update_documents_with_standardized_names(typesense, full_mapping)
    
    print(f"\n✅ Updated {updated} documents with standardized names")
    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
