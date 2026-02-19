import Typesense, { Client } from 'typesense';
import type { SearchResult, TypeSenseDocument } from '@/types';

// Type for internal candidate processing
interface SearchCandidate {
  document: {
    file_path: string;
    file_name: string;
    drive_file_id: string;
    web_view_link: string;
    folder_path: string;
    source_type?: string;
    publication_date?: string;
    people: string[];
    locations: string[];
    dates: string[];
    summary: string;
    ocr_content: string;
  };
  rawSimilarity: number;
  hasFileNameMatch: boolean;
  hasSummaryMatch: boolean;
  textMatchCount: number;
  score: number;
  highlights: Record<string, string[]>;
}

let client: Client | null = null;

export function getTypesenseClient(): Client {
  if (!client) {
    client = new Typesense.Client({
      nodes: [{
        host: process.env.TYPESENSE_HOST || 'localhost',
        port: parseInt(process.env.TYPESENSE_PORT || '443'),
        protocol: process.env.TYPESENSE_PROTOCOL || 'https'
      }],
      apiKey: process.env.TYPESENSE_API_KEY || '',
      connectionTimeoutSeconds: 10
    });
  }
  return client;
}

export function getCollectionName(): string {
  return process.env.TYPESENSE_COLLECTION_NAME || 'documents';
}

export async function countDocuments(): Promise<number> {
  try {
    const client = getTypesenseClient();
    const collection = await client.collections(getCollectionName()).retrieve();
    return collection.num_documents || 0;
  } catch (error) {
    console.error('Error counting documents:', error);
    return 0;
  }
}

// ============================================================================
// Statistical Relevance Detection
// ============================================================================
// Instead of arbitrary score rescaling, we analyze the distribution of 
// similarity scores to determine if results are actually relevant:
// - High variance = Clear separation between relevant and irrelevant docs
// - Low variance = All docs equally distant from query (no real matches)

// Calculate mean of an array
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

// Calculate standard deviation
function standardDeviation(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

// Calculate percentile rank of a value in a sorted array
function percentileRank(value: number, sortedArr: number[]): number {
  if (sortedArr.length === 0) return 0;
  const belowCount = sortedArr.filter(v => v < value).length;
  return belowCount / sortedArr.length;
}

// Check if query terms appear in text (for text-match detection)
function hasTextMatch(query: string, text: string): boolean {
  if (!query || !text) return false;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const textLower = text.toLowerCase();
  return queryTerms.some(term => textLower.includes(term));
}

// Count how many query terms match
function countTextMatches(query: string, text: string): number {
  if (!query || !text) return 0;
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const textLower = text.toLowerCase();
  return queryTerms.filter(term => textLower.includes(term)).length;
}

// Coefficient of variation threshold - below this, results are considered "uniformly distant"
// Higher = stricter (fewer false positives for nonsense queries)
const CV_THRESHOLD = 0.25;

// Absolute minimum raw similarity - if the best result is below this, query is likely nonsense
// OpenAI embeddings: good matches are typically 0.35+, mediocre 0.25-0.35, poor <0.25
const ABSOLUTE_MIN_SIMILARITY = 0.32;

// Minimum MEAN similarity - if average is too low, query is likely unrelated to corpus
const MIN_MEAN_SIMILARITY = 0.20;

// When no clear matches, return zero results (not low-scoring noise)
const RETURN_RESULTS_ON_NO_MATCH = false;

export async function semanticSearch(
  queryEmbedding: number[],
  limit: number = 10,
  queryText?: string,
  filterBy?: string
): Promise<SearchResult[]> {
  const client = getTypesenseClient();
  
  // Fetch a larger candidate pool for statistical analysis
  const fetchLimit = Math.max(100, limit * 5);
  
  // Use multi_search for vector queries to avoid URL length limits
  const searchEntry: Record<string, unknown> = {
    collection: getCollectionName(),
    q: '*',
    vector_query: `embedding:([${queryEmbedding.join(',')}], k:${fetchLimit})`,
    per_page: fetchLimit,
    include_fields: 'file_path,file_name,drive_file_id,web_view_link,folder_path,source_type,publication_date,people,locations,dates,summary,ocr_content'
  };
  if (filterBy) searchEntry.filter_by = filterBy;

  const searchRequests = { searches: [searchEntry] };

  const response = await client.multiSearch.perform(searchRequests, {}) as any;
  const results = response.results?.[0] as any;
  const hits = results?.hits || [];
  
  if (hits.length === 0) return [];

  // Extract raw similarities and map documents
  const candidates: SearchCandidate[] = hits.map((hit: any) => {
    const rawSimilarity = hit.vector_distance !== undefined ? 1 - hit.vector_distance : 0;
    const fileName = hit.document.file_name || '';
    const summary = hit.document.summary || '';
    
    // Check for text matches
    const hasFileNameMatch = queryText ? hasTextMatch(queryText, fileName) : false;
    const hasSummaryMatch = queryText ? hasTextMatch(queryText, summary) : false;
    const textMatchCount = queryText ? 
      countTextMatches(queryText, fileName) + countTextMatches(queryText, summary) : 0;
    
    return {
      document: {
        file_path: hit.document.file_path,
        file_name: fileName,
        drive_file_id: hit.document.drive_file_id,
        web_view_link: hit.document.web_view_link,
        folder_path: hit.document.folder_path || '',
        source_type: hit.document.source_type as 'primary' | 'secondary' | undefined,
        publication_date: hit.document.publication_date,
        people: hit.document.people || [],
        locations: hit.document.locations || [],
        dates: hit.document.dates || [],
        summary: summary,
        ocr_content: hit.document.ocr_content || ''
      },
      rawSimilarity,
      hasFileNameMatch,
      hasSummaryMatch,
      textMatchCount,
      score: 0, // Will be calculated below
      highlights: (hit.highlights || {}) as Record<string, string[]>
    };
  });

  // Get similarity values for statistical analysis
  const similarities = candidates.map((c: SearchCandidate) => c.rawSimilarity);
  const avgSimilarity = mean(similarities);
  const stdDev = standardDeviation(similarities);
  const coeffOfVariation = avgSimilarity > 0 ? stdDev / avgSimilarity : 0;
  const maxSimilarity = Math.max(...similarities);
  
  // EARLY EXIT: Query is likely nonsense if:
  // 1. Best match is below absolute minimum (no good matches exist)
  // 2. OR average similarity is too low (query is unrelated to corpus)
  // This catches "boogaloo", "deez nutz", "asdfasdfas" etc.
  if (maxSimilarity < ABSOLUTE_MIN_SIMILARITY || avgSimilarity < MIN_MEAN_SIMILARITY) {
    return [];
  }
  
  // Separate text-matched results from semantic-only results
  const textMatches = candidates.filter(c => c.hasFileNameMatch || c.hasSummaryMatch);
  const semanticOnly = candidates.filter(c => !c.hasFileNameMatch && !c.hasSummaryMatch);
  
  let finalResults: typeof candidates = [];
  
  // CASE 1: We have text matches - these are definitely relevant
  if (textMatches.length > 0) {
    // Sort text matches by: filename match first, then by text match count, then by similarity
    textMatches.sort((a, b) => {
      if (a.hasFileNameMatch !== b.hasFileNameMatch) return b.hasFileNameMatch ? 1 : -1;
      if (a.textMatchCount !== b.textMatchCount) return b.textMatchCount - a.textMatchCount;
      return b.rawSimilarity - a.rawSimilarity;
    });
    
    // Score text matches highly (70-98%)
    textMatches.forEach((match, idx) => {
      const baseScore = match.hasFileNameMatch ? 0.90 : 0.75;
      const rankPenalty = idx * 0.02; // Small penalty for lower-ranked text matches
      match.score = Math.max(0.60, baseScore - rankPenalty);
    });
    
    finalResults = [...textMatches];
    
    // Add semantic-only results if we have high variance (clear relevance signal)
    if (coeffOfVariation > CV_THRESHOLD && finalResults.length < limit) {
      const threshold = avgSimilarity + (0.5 * stdDev);
      const relevantSemantic = semanticOnly
        .filter(c => c.rawSimilarity > threshold && c.rawSimilarity >= ABSOLUTE_MIN_SIMILARITY)
        .sort((a, b) => b.rawSimilarity - a.rawSimilarity);
      
      // Score semantic results by percentile (50-70%)
      const semanticSimilarities = relevantSemantic.map(c => c.rawSimilarity).sort((a, b) => a - b);
      relevantSemantic.forEach(result => {
        const pctRank = percentileRank(result.rawSimilarity, semanticSimilarities);
        result.score = 0.50 + (pctRank * 0.20); // 50-70% range
      });
      
      finalResults = [...finalResults, ...relevantSemantic];
    }
  }
  // CASE 2: No text matches but high variance - semantic matches are likely real
  else if (coeffOfVariation > CV_THRESHOLD) {
    const threshold = avgSimilarity + (0.5 * stdDev);
    const relevantResults = candidates
      .filter(c => c.rawSimilarity > threshold && c.rawSimilarity >= ABSOLUTE_MIN_SIMILARITY)
      .sort((a, b) => b.rawSimilarity - a.rawSimilarity);
    
    if (relevantResults.length > 0) {
      // Score by percentile rank (60-90%)
      const sortedSimilarities = relevantResults.map(c => c.rawSimilarity).sort((a, b) => a - b);
      relevantResults.forEach(result => {
        const pctRank = percentileRank(result.rawSimilarity, sortedSimilarities);
        result.score = 0.60 + (pctRank * 0.30); // 60-90% range
      });
      
      finalResults = relevantResults;
    }
  }
  // CASE 3: No text matches AND low variance - no real matches
  // Return NOTHING for nonsense queries instead of low-scoring noise
  else if (!RETURN_RESULTS_ON_NO_MATCH) {
    finalResults = [];
  }

  // Final sort by score and limit
  return finalResults
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => ({
      document: {
        ...r.document,
        source_type: r.document.source_type as 'primary' | 'secondary' | undefined
      },
      score: r.score,
      highlights: r.highlights
    }));
}

export async function fuzzySearch(
  query: string,
  limit: number = 10,
  filterBy?: string
): Promise<SearchResult[]> {
  const client = getTypesenseClient();
  
  const searchParameters: Record<string, unknown> = {
    q: query,
    query_by: 'text_for_search,summary,file_name,people,locations,dates',
    per_page: limit,
    include_fields: 'file_path,file_name,drive_file_id,web_view_link,folder_path,source_type,publication_date,people,locations,dates,summary,ocr_content',
    highlight_full_fields: 'summary,ocr_content',
    num_typos: 2
  };
  if (filterBy) searchParameters.filter_by = filterBy;

  const response = await client
    .collections(getCollectionName())
    .documents()
    .search(searchParameters as any);

  return (response.hits || []).map((hit: any) => ({
    document: {
      file_path: hit.document.file_path,
      file_name: hit.document.file_name,
      drive_file_id: hit.document.drive_file_id,
      web_view_link: hit.document.web_view_link,
      folder_path: hit.document.folder_path || '',
      source_type: hit.document.source_type,
      publication_date: hit.document.publication_date,
      people: hit.document.people || [],
      locations: hit.document.locations || [],
      dates: hit.document.dates || [],
      summary: hit.document.summary || '',
      ocr_content: hit.document.ocr_content || ''
    },
    score: hit.text_match_info?.score || 0,
    highlights: hit.highlights?.reduce((acc: any, h: any) => {
      acc[h.field] = h.snippets || [];
      return acc;
    }, {}) || {}
  }));
}

export function combineAndDeduplicate(
  fuzzyResults: SearchResult[],
  semanticResults: SearchResult[],
  maxResults: number = 20
): SearchResult[] {
  const seen = new Set<string>();
  const combined: SearchResult[] = [];

  // Interleave results
  const maxLen = Math.max(fuzzyResults.length, semanticResults.length);
  
  for (let i = 0; i < maxLen && combined.length < maxResults; i++) {
    if (i < fuzzyResults.length) {
      const result = fuzzyResults[i];
      if (!seen.has(result.document.file_path)) {
        seen.add(result.document.file_path);
        combined.push(result);
      }
    }
    
    if (i < semanticResults.length && combined.length < maxResults) {
      const result = semanticResults[i];
      if (!seen.has(result.document.file_path)) {
        seen.add(result.document.file_path);
        combined.push(result);
      }
    }
  }

  return combined;
}

// ============================================================================
// Research Search - Less strict, always returns results for RAG context
// ============================================================================
// For research/chat mode, we want to always provide context to GPT.
// This bypasses the strict statistical filtering used for regular search.

export async function researchSearch(
  queryEmbedding: number[],
  limit: number = 10,
  filterBy?: string
): Promise<SearchResult[]> {
  const client = getTypesenseClient();
  
  const searchEntry: Record<string, unknown> = {
    collection: getCollectionName(),
    q: '*',
    vector_query: `embedding:([${queryEmbedding.join(',')}], k:${limit})`,
    per_page: limit,
    include_fields: 'file_path,file_name,drive_file_id,web_view_link,folder_path,source_type,publication_date,people,locations,dates,summary,ocr_content'
  };
  if (filterBy) searchEntry.filter_by = filterBy;

  const searchRequests = { searches: [searchEntry] };

  const response = await client.multiSearch.perform(searchRequests, {}) as any;
  const results = response.results?.[0] as any;
  const hits = results?.hits || [];

  // Simply return top results by vector similarity - no strict filtering
  // This ensures research mode always has context to work with
  return hits.map((hit: any) => {
    const rawSimilarity = hit.vector_distance !== undefined ? 1 - hit.vector_distance : 0;
    
    return {
      document: {
        file_path: hit.document.file_path,
        file_name: hit.document.file_name,
        drive_file_id: hit.document.drive_file_id,
        web_view_link: hit.document.web_view_link,
        folder_path: hit.document.folder_path || '',
        source_type: hit.document.source_type as 'primary' | 'secondary' | undefined,
        publication_date: hit.document.publication_date,
        people: hit.document.people || [],
        locations: hit.document.locations || [],
        dates: hit.document.dates || [],
        summary: hit.document.summary || '',
        ocr_content: hit.document.ocr_content || ''
      },
      score: rawSimilarity,
      highlights: hit.highlights || {}
    };
  });
}
