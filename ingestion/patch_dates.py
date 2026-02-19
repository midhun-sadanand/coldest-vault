#!/usr/bin/env python3
"""
One-off script to correct publication_date values and remove unwanted documents.
"""

import typesense
from config import get_settings

# ---------------------------------------------------------------------------
# Corrections: each entry is (filename_keyword, new_publication_date)
# The keyword is matched case-insensitively against file_name.
# ---------------------------------------------------------------------------
DATE_CORRECTIONS = [
    ("Origins of Overkill",                              "March 1983"),
    ("Hu Yaobang Website Pertaining to the Korean War",  "August 4, 2016"),
    ("Charisma in the 1952 Campaign",                    "December 1954"),
    ("Dingman-AtomicDiplomacyKorean-1988",               "December 1988"),
    ("Edward C. Keefer",                                 "June 1986"),
    ("Eisenhower as an Activist President",              "December 1979"),
    ("Eisenhower the Strategist",                        "June 1987"),
    ("Geoffrey Matthews",                                "July 1982"),
    ("H.W. Brands",                                      "October 1989"),
    ("Henry W. Berger",                                  "June 1975"),
    ("James I. Matray",                                  "July 1992"),
    ("Li Haiqing",                                       "October 28, 2020"),
    ("Michael T. Hayes",                                 "February 2004"),
    ("Partisans_of_the_Old_Republic",                    "May 2024"),
    ("Phil Williams",                                    "January 1982"),
    ("Roger Dingman",                                    "December 1988"),
    ("Rosemary J. Foot",                                 "December 1988"),
    ("Presidential Election of 1952",                    "July 2022"),
    ("SPIRITUAL FACTOR",                                 "December 6, 2011"),
    ("enigma-of-senator-taft",                           "August 5, 2009"),
]

# Documents to delete entirely (matched by filename keyword, case-insensitive)
DELETE_KEYWORDS = [
    "Journal Article_Heritage",
]


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

    # Fetch all documents (id + file_name only for speed)
    print("Fetching all documents...")
    all_docs = []
    page = 1
    while True:
        results = client.collections[collection].documents.search({
            'q': '*',
            'query_by': 'file_name',
            'per_page': 250,
            'page': page,
            'include_fields': 'id,file_name',
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

    # -----------------------------------------------------------------------
    # Apply date corrections
    # -----------------------------------------------------------------------
    updated = 0
    not_found = []

    for keyword, new_date in DATE_CORRECTIONS:
        keyword_lower = keyword.lower()
        matches = [d for d in all_docs if keyword_lower in d['file_name'].lower()]

        if not matches:
            not_found.append(keyword)
            print(f"  ⚠️  NOT FOUND: {keyword!r}")
            continue

        if len(matches) > 1:
            print(f"  ⚠️  Multiple matches for {keyword!r}: {[d['file_name'] for d in matches]}")

        for doc in matches:
            try:
                client.collections[collection].documents[doc['id']].update(
                    {'publication_date': new_date}
                )
                print(f"  ✅ {doc['file_name']}\n     → {new_date}")
                updated += 1
            except Exception as e:
                print(f"  ❌ Failed to update {doc['file_name']}: {e}")

    # -----------------------------------------------------------------------
    # Delete unwanted documents
    # -----------------------------------------------------------------------
    deleted = 0
    for keyword in DELETE_KEYWORDS:
        keyword_lower = keyword.lower()
        matches = [d for d in all_docs if keyword_lower in d['file_name'].lower()]

        if not matches:
            print(f"\n  ⚠️  DELETE target not found: {keyword!r}")
            continue

        for doc in matches:
            try:
                client.collections[collection].documents[doc['id']].delete()
                print(f"\n  🗑️  Deleted: {doc['file_name']}")
                deleted += 1
            except Exception as e:
                print(f"\n  ❌ Failed to delete {doc['file_name']}: {e}")

    print(f"\n{'='*50}")
    print(f"Updated: {updated}  |  Deleted: {deleted}  |  Not found: {len(not_found)}")
    if not_found:
        print(f"Not found keywords: {not_found}")


if __name__ == '__main__':
    main()
