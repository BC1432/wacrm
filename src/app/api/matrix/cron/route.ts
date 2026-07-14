import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { processMatrixOutbox } from '@/lib/matrix/outbox';
import { syncAllMatrixAccounts } from '@/lib/matrix/sync';

function authorized(request: Request): boolean {
  const expected = process.env.MATRIX_CRON_SECRET;
  const supplied = request.headers.get('x-cron-secret') ?? '';
  if (!expected) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

async function run(request: Request) {
  if (!process.env.MATRIX_CRON_SECRET) {
    return NextResponse.json(
      { error: 'Matrix cron is not configured' },
      { status: 503 }
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const [sync, outbox] = await Promise.all([
      syncAllMatrixAccounts(),
      processMatrixOutbox(50),
    ]);
    return NextResponse.json({ sync, outbox });
  } catch (error) {
    console.error('[matrix-cron] failed:', error);
    return NextResponse.json(
      { error: 'Matrix processing failed' },
      { status: 500 }
    );
  }
}

export const GET = run;
export const POST = run;
