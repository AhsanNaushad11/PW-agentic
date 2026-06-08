import { NextRequest, NextResponse } from 'next/server';
import { executeScript } from '@/lib/executor';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { script } = body as { script: string };

    if (!script) {
      return NextResponse.json({ error: 'script is required.' }, { status: 400 });
    }

    const result = await executeScript(script);

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[/api/execute] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
