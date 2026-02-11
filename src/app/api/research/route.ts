import { NextRequest, NextResponse } from 'next/server';
import { getEmbedding, generateResearchResponse } from '@/lib/openai';
import { researchSearch } from '@/lib/typesense';
import type { ResearchRequest } from '@/types';

// Number of documents to retrieve for context
const CONTEXT_DOCUMENT_COUNT = 10;

export async function POST(request: NextRequest) {
  try {
    const body: ResearchRequest = await request.json();
    const { query, conversation_history = [] } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // 1. Generate embedding for the query
    const embedding = await getEmbedding(query);

    // 2. Research search - always returns results (no strict filtering)
    const searchResults = await researchSearch(embedding, CONTEXT_DOCUMENT_COUNT);

    // 3. Prepare documents for the research response
    const documents = searchResults.map(r => ({
      file_name: r.document.file_name,
      file_path: r.document.file_path,
      web_view_link: r.document.web_view_link || '',
      folder_path: r.document.folder_path,
      summary: r.document.summary,
      ocr_content: r.document.ocr_content
    }));

    // 4. Generate research response with citations
    const result = await generateResearchResponse(
      query,
      documents,
      conversation_history
    );

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      response: result.response,
      sources: result.sources,
      token_usage: result.usage,
      processing_time_ms: processingTime
    });

  } catch (error: any) {
    console.error('Research generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Research generation failed' },
      { status: 500 }
    );
  }
}
