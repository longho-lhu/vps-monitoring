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
          // Invalidate the agents list query
          mutate('/api/agents');

          // If we are on a specific agent's page, invalidate detail and graph metrics queries
          if (agentId && data.agentId === agentId) {
            mutate(`/api/agents/${agentId}`);
            
            // Invalidate metrics charts (all ranges for this agent)
            mutate(
              (key: any) =>
                typeof key === 'string' &&
                key.startsWith(`/api/agents/${agentId}/metrics`)
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
