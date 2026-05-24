import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppSettings } from '@/lib/app-settings';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { sendTelegramOverloadIfNeeded } from '@/lib/telegram-alerts';
import { dbEventEmitter } from '@/lib/events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  agentId: z.string().min(1),
  token: z.string().min(1),
  cpuPercent: z.number().min(0).max(100).default(0),
  loadAvg1: z.number().min(0).default(0),
  loadAvg5: z.number().min(0).default(0),
  loadAvg15: z.number().min(0).default(0),
  memUsedBytes: z.number().min(0).default(0),
  memTotalBytes: z.number().min(0).default(0),
  swapUsedBytes: z.number().min(0).default(0),
  swapTotalBytes: z.number().min(0).default(0),
  diskUsedBytes: z.number().min(0).default(0),
  diskTotalBytes: z.number().min(0).default(0),
  netRxBytes: z.number().min(0).default(0),
  netTxBytes: z.number().min(0).default(0),
  netRxBps: z.number().min(0).default(0),
  netTxBps: z.number().min(0).default(0),
  uptimeSeconds: z.number().min(0).default(0),
  processCount: z.number().int().min(0).default(0),
  pm2: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      cpu: z.number().default(0),
      memory: z.number().default(0),
      restarts: z.number().default(0),
      uptime: z.number().default(0),
    })
  ).optional().default([]),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const agent = db.prepare('SELECT * FROM Agent WHERE agentId = ? AND token = ?').get(
    parsed.data.agentId,
    parsed.data.token
  ) as any;

  if (!agent) {
    return NextResponse.json({ error: 'Unknown agent or invalid token' }, { status: 401 });
  }

  const nowStr = new Date().toISOString();

  // Update lastSeenAt and pm2 telemetry
  db.prepare('UPDATE Agent SET lastSeenAt = ?, pm2 = ? WHERE agentId = ?').run(
    nowStr,
    JSON.stringify(parsed.data.pm2),
    agent.agentId
  );

  // Insert Metric record
  db.prepare(`
    INSERT INTO Metric (
      agentId, ts, cpuPercent, loadAvg1, loadAvg5, loadAvg15,
      memUsedBytes, memTotalBytes, swapUsedBytes, swapTotalBytes,
      diskUsedBytes, diskTotalBytes, netRxBytes, netTxBytes,
      netRxBps, netTxBps, uptimeSeconds, processCount
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    agent.agentId,
    nowStr,
    parsed.data.cpuPercent,
    parsed.data.loadAvg1,
    parsed.data.loadAvg5,
    parsed.data.loadAvg15,
    parsed.data.memUsedBytes,
    parsed.data.memTotalBytes,
    parsed.data.swapUsedBytes,
    parsed.data.swapTotalBytes,
    parsed.data.diskUsedBytes,
    parsed.data.diskTotalBytes,
    parsed.data.netRxBytes,
    parsed.data.netTxBytes,
    parsed.data.netRxBps,
    parsed.data.netTxBps,
    parsed.data.uptimeSeconds,
    parsed.data.processCount
  );

  // Emit event for real-time pushing
  dbEventEmitter.emit('metric_update', { type: 'metric_update', agentId: agent.agentId });

  const appSettings = await getAppSettings();
  
  // Create an agent object compatible with telegram alert evaluation
  const agentForAlert = {
    agentId: agent.agentId,
    hostname: agent.hostname,
    label: agent.label,
    publicIp: agent.publicIp,
    lastTelegramAlertAt: agent.lastTelegramAlertAt,
  };

  const sent = await sendTelegramOverloadIfNeeded(
    agentForAlert,
    {
      cpuPercent: parsed.data.cpuPercent,
      memUsedBytes: parsed.data.memUsedBytes,
      memTotalBytes: parsed.data.memTotalBytes,
      diskUsedBytes: parsed.data.diskUsedBytes,
      diskTotalBytes: parsed.data.diskTotalBytes,
    },
    appSettings,
    env.APP_URL
  );

  if (sent) {
    db.prepare('UPDATE Agent SET lastTelegramAlertAt = ? WHERE agentId = ?').run(
      nowStr,
      agent.agentId
    );
  }

  return NextResponse.json({ ok: true });
}
