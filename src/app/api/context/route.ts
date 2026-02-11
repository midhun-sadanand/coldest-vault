import { NextRequest, NextResponse } from 'next/server';
import { generateContext } from '@/lib/openai';
import type { ResultContextRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: ResultContextRequest = await request.json();
    const { query, result_metadata, conversation_history = [] } = body;

    if (!query || !result_metadata) {
      return NextResponse.json(
        { error: 'Query and result_metadata are required' },
        { status: 400 }
      );
    }

    const result = await generateContext(query, result_metadata, conversation_history);

    return NextResponse.json({
      response: result.response,
      token_usage: result.usage
    });

  } catch (error: any) {
    console.error('Context generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Context generation failed' },
      { status: 500 }
    );
  }
}
