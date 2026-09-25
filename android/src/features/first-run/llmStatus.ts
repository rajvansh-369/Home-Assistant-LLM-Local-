// 1.4 Home LLM server: the field's warning and the Test result line (plan §4.4).
import type { FieldStatus } from '@/components';
import type { LlmHealth } from '@/services/api/types';

import { setHome as copy } from './copy';
import type { LlmUrlResult } from './validators';

const blockedText = (homeLlmHost: string | null) =>
  homeLlmHost ? copy.llmBlocked(homeLlmHost) : copy.llmBlockedAll;

/** Warning under the field for a valid address, if any. */
export function llmFieldStatus(
  result: LlmUrlResult,
  homeLlmHost: string | null,
): FieldStatus | undefined {
  if (!result.ok || !result.warning) return undefined;
  return result.warning === 'blocked'
    ? { tone: 'danger', text: blockedText(homeLlmHost) }
    : { tone: 'warning', text: copy.publicLlm };
}

/** The line that replaces "Test works only on home Wi-Fi" after a test. */
export function healthStatus(result: LlmHealth, homeLlmHost: string | null): FieldStatus {
  switch (result.kind) {
    case 'ready':
      return {
        tone: 'accent',
        icon: 'check',
        text: result.model
          ? copy.llmReady(result.model, result.ms)
          : copy.llmReadyNoModel(result.ms),
      };
    case 'loading':
      return { tone: 'warning', text: copy.llmLoading };
    case 'failed':
      return { tone: 'danger', text: copy.llmFailed(result.error) };
    case 'no-reply':
      return { tone: 'danger', text: copy.llmNoReply };
    case 'blocked':
      return { tone: 'danger', text: blockedText(homeLlmHost) };
    case 'unexpected':
      return { tone: 'danger', text: copy.llmUnexpected(result.status) };
  }
}
