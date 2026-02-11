import { NextResponse } from 'next/server';
import { countDocuments } from '@/lib/typesense';

export async function GET() {
  try {
    const count = await countDocuments();
    return NextResponse.json({ count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
