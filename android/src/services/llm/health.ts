// zypherLL health check for the 1.4 Test pill (plan §4.4, §6). The real fetch arrives in Phase 5.
import { useMockApi } from '@/services/api';
import { mockLlmHealth } from '@/services/api/mock';
import type { LlmHealthCheck } from '@/services/api/types';

export const checkLlmHealth: LlmHealthCheck = useMockApi
  ? mockLlmHealth
  : async () => ({ kind: 'no-reply' });
