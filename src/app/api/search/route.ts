import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding, getSpicyRankings } from '@/lib/openai';
import { fuzzySearch, semanticSearch, combineAndDeduplicate } from '@/lib/typesense';
import type { SearchRequest, SpicyResult, FolderSearchResult } from '@/types';

const MIN_FOLDER_MATCH_COUNT = 3;

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { query, limit = 20, offset = 0, search_type = 'spicy', primaryOnly = false } = body;
    const filterBy = primaryOnly ? 'source_type:=primary' : undefined;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const startTime = Date.now();

    // Fetch more results to support pagination and folder aggregation
    const fetchLimit = Math.max(limit + offset + 10, 50);
    let allResults: SpicyResult[] = [];

    if (search_type === 'fuzzy') {
      const fuzzyResults = await fuzzySearch(query, fetchLimit, filterBy);
      allResults = fuzzyResults.map((r, i) => ({ ...r, spicy_rank: i + 1 }));
    } else if (search_type === 'semantic') {
      const embedding = await getEmbedding(query);
      const semanticResults = await semanticSearch(embedding, fetchLimit, query, filterBy);
      allResults = semanticResults.map((r, i) => ({ ...r, spicy_rank: i + 1 }));
    } else {
      // Hybrid search: combine fuzzy + semantic, then rank by interestingness
      const [fuzzyResults, embedding] = await Promise.all([
        fuzzySearch(query, fetchLimit, filterBy),
        getEmbedding(query)
      ]);
      
      const semanticResults = await semanticSearch(embedding, fetchLimit, query, filterBy);
      const combined = combineAndDeduplicate(fuzzyResults, semanticResults, fetchLimit);
      
      // Rank by "spiciness" using GPT
      allResults = await getSpicyRankings(query, combined);
    }

    // Aggregate results by folder to find folder matches
    // Only include documents that have a real folder_path
    const folderCounts: Record<string, SpicyResult[]> = {};
    for (const result of allResults) {
      const folderPath = result.document.folder_path;
      // Skip documents without a folder path or with placeholder values
      if (!folderPath || folderPath === 'Root' || folderPath === 'Uncategorized' || folderPath.trim() === '') {
        continue;
      }
      if (!folderCounts[folderPath]) {
        folderCounts[folderPath] = [];
      }
      folderCounts[folderPath].push(result);
    }

    // Find folders with MIN_FOLDER_MATCH_COUNT+ matching documents
    const folderResults: FolderSearchResult[] = Object.entries(folderCounts)
      .filter(([_, docs]) => docs.length >= MIN_FOLDER_MATCH_COUNT)
      .map(([path, docs]) => ({
        folder_path: path,
        matching_documents: docs.length,
        sample_documents: docs.slice(0, 3).map(d => ({
          file_name: d.document.file_name,
          summary: d.document.summary
        }))
      }))
      .sort((a, b) => b.matching_documents - a.matching_documents);

    // Apply pagination to document results
    const paginatedResults = allResults.slice(offset, offset + limit);
    const hasMore = allResults.length > offset + limit;

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      results: paginatedResults,
      folder_results: folderResults.length > 0 ? folderResults : undefined,
      total: allResults.length,
      has_more: hasMore,
      query,
      search_type,
      processing_time_ms: processingTime
    });

  } catch (error: any) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  
  if (!query) {
    return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
  }

  // Redirect to POST
  return POST(new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ query, limit: 10 })
  }));
}
