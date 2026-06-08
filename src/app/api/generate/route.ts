import { NextRequest, NextResponse } from 'next/server';
import { generateScript } from '@/lib/ollama';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { testCase, url, errorContext } = body as {
      testCase: string;
      url: string;
      errorContext?: string;
    };

    if (!testCase || !url) {
      return NextResponse.json(
        { error: 'testCase and url are required.' },
        { status: 400 }
      );
    }

    const script = await generateScript(testCase, url, errorContext);

    return NextResponse.json({ script });
  } catch (err: unknown) {
    console.error('[/api/generate] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
