import { NextResponse } from 'next/server';
import { jobsQueue } from '@/lib/queue';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { targetUrl, gameMode, config } = body;

    if (!targetUrl || !gameMode || !config) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const jobId = randomUUID();

    const job = await jobsQueue.add('sqa-task', {
      jobId,
      targetUrl,
      gameMode,
      config,
    }, {
      jobId,
      removeOnComplete: true,
      removeOnFail: false,
    });

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error: any) {
    console.error('Error queuing job:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
