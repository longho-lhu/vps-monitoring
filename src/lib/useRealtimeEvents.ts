import { useEffect } from 'react';
import { useSWRConfig } from 'swr';

export function useRealtimeEvents(agentId?: string) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const s = new EventSource('/api/agents/events');

    s.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'metric_update') {
          // 1. Cập nhật cục bộ danh sách agents (không fetch lại từ server)
          mutate(
            '/api/agents',
            (currentData: any) => {
              if (!currentData || !currentData.agents) return currentData;
              return {
                ...currentData,
                agents: currentData.agents.map((agent: any) => {
                  if (agent.agentId === data.agentId) {
                    return {
                      ...agent,
                      online: true,
                      lastSeenAt: data.lastSeenAt,
                      latest: data.latest,
                    };
                  }
                  return agent;
                }),
              };
            },
            false // revalidate = false: không gọi HTTP request
          );

          // 2. Nếu đang ở trang chi tiết của agent nhận được update này
          if (agentId && data.agentId === agentId) {
            // Cập nhật thông số chi tiết của Agent
            mutate(
              `/api/agents/${agentId}`,
              (currentData: any) => {
                if (!currentData || !currentData.agent) return currentData;
                return {
                  ...currentData,
                  agent: {
                    ...currentData.agent,
                    online: true,
                    lastSeenAt: data.lastSeenAt,
                    latest: data.latest,
                    pm2: data.pm2 || currentData.agent.pm2,
                  },
                };
              },
              false
            );

            // Cập nhật đồ thị hiệu năng (đẩy thêm 1 điểm dữ liệu mới vào lịch sử đồ thị)
            const newPoint = {
              ts: data.latest.ts,
              cpuPercent: data.latest.cpuPercent,
              memUsedBytes: data.latest.memUsedBytes,
              memTotalBytes: data.latest.memTotalBytes,
              diskUsedBytes: data.latest.diskUsedBytes,
              diskTotalBytes: data.latest.diskTotalBytes,
              netRxBps: data.latest.netRxBps,
              netTxBps: data.latest.netTxBps,
              loadAvg1: data.latest.loadAvg1,
            };

            mutate(
              (key: any) =>
                typeof key === 'string' &&
                key.startsWith(`/api/agents/${agentId}/metrics`),
              (currentData: any) => {
                if (!currentData || !currentData.metrics) return currentData;
                return {
                  ...currentData,
                  metrics: [...currentData.metrics, newPoint],
                };
              },
              false
            );
          }
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    return () => {
      s.close();
    };
  }, [agentId, mutate]);
}
