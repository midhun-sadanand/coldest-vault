import { NextResponse } from 'next/server';
import { countDocuments } from '@/lib/typesense';

export async function GET() {
  try {
    const count = await countDocuments();
    
    return NextResponse.json({
      status: 'healthy',
      document_count: count,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
