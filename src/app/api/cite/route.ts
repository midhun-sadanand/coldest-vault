import { NextRequest, NextResponse } from 'next/server';
import { generateCitation, findQuotePage } from '@/lib/openai';
import type { CitationRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: CitationRequest = await request.json();
    const { file_name, publication_date, source_type, folder_path, ocr_content, quote, page_number } = body;

    if (!file_name || !ocr_content) {
      return NextResponse.json(
        { error: 'file_name and ocr_content are required' },
        { status: 400 }
      );
    }

    // For primary sources: deterministic draft + GPT refinement pass
    // For secondary sources: GPT extracts author/journal metadata
    const citation = await generateCitation({
      file_name,
      publication_date,
      source_type,
      folder_path,
      ocr_content
    });

    // Direct page number entry — no OCR search needed, always confirmed
    if (page_number && page_number.trim().length > 0) {
      const raw = page_number.trim();
      const formatted = /^\d+$/.test(raw) ? `p. ${raw}` : raw;
      return NextResponse.json({ ...citation, page_number: formatted, page_confirmed: true, page_context: '' });
    }

    // Quote-based fuzzy page lookup
    if (quote && quote.trim().length > 0) {
      const pageResult = await findQuotePage(ocr_content, quote.trim());
      return NextResponse.json({
        ...citation,
        page_number: pageResult.page_number,
        page_confirmed: pageResult.page_confirmed,
        page_context: ''
      });
    }

    return NextResponse.json(citation);

  } catch (error: any) {
    console.error('Citation error:', error);
    return NextResponse.json(
      { error: error.message || 'Citation generation failed' },
      { status: 500 }
    );
  }
}
