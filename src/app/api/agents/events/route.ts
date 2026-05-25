import { NextResponse } from 'next/server';
import { dbEventEmitter } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const responseStream = new ReadableStream({
    start(controller) {
      const listener = (data: any) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Ignore write errors if connection is closing
        }
      };

      dbEventEmitter.on('metric_update', listener);

      // Send periodic comments to keep connection alive in proxies
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(`: keep-alive\n\n`);
        } catch {
          // Ignore
        }
      }, 20_000);

      req.signal.addEventListener('abort', () => {
        dbEventEmitter.off('metric_update', listener);
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          // Ignore
        }
      });
    },
  });

  return new NextResponse(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
