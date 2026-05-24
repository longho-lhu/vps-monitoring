import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromCookies } from '@/lib/auth';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all agents, sorted stablely by hostname and agentId
  const agents = db.prepare('SELECT * FROM Agent ORDER BY hostname ASC, agentId ASC').all() as any[];
  
  // Get the latest metric for all agents in one query using a window function
  const latestMetrics = db.prepare(`
    WITH RankedMetrics AS (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY agentId ORDER BY ts DESC) as rn
      FROM Metric
    )
    SELECT *
    FROM RankedMetrics
    WHERE rn = 1
  `).all() as any[];

  const latestMap = new Map<string, any>();
  for (const m of latestMetrics) {
    latestMap.set(m.agentId, m);
  }

  const offlineMs = env.AGENT_OFFLINE_AFTER_SECONDS * 1000;
  const now = Date.now();

  const data = agents.map((a) => {
    const m = latestMap.get(a.agentId);
    
    // SQLite timestamps are stored as ISO text strings
    const online =
      a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() <= offlineMs ? true : false;
      
    let parsedTags: string[] = [];
    try {
      parsedTags = JSON.parse(a.tags || '[]');
    } catch {
      parsedTags = [];
    }

    return {
      agentId: a.agentId,
      hostname: a.hostname,
      label: a.label,
      os: a.os,
      osVersion: a.osVersion,
      kernel: a.kernel,
      arch: a.arch,
      cpuModel: a.cpuModel,
      cpuCores: a.cpuCores,
      totalMemoryBytes: a.totalMemoryBytes,
      totalDiskBytes: a.totalDiskBytes,
      publicIp: a.publicIp,
      privateIp: a.privateIp,
      tags: parsedTags,
      online,
      lastSeenAt: a.lastSeenAt,
      registeredAt: a.registeredAt,
      latest: m
        ? {
            ts: m.ts,
            cpuPercent: m.cpuPercent,
            memUsedBytes: m.memUsedBytes,
            memTotalBytes: m.memTotalBytes,
            diskUsedBytes: m.diskUsedBytes,
            diskTotalBytes: m.diskTotalBytes,
            netRxBytes: m.netRxBytes,
            netTxBytes: m.netTxBytes,
            netRxBps: m.netRxBps,
            netTxBps: m.netTxBps,
            uptimeSeconds: m.uptimeSeconds,
            loadAvg1: m.loadAvg1,
          }
        : null,
    };
  });

  return NextResponse.json({ agents: data });
}
