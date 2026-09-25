// The line shown above a screen's button when a server call fails outside any field (plan §6
// Errors). Each one says what to do next.
import { ApiError } from '@/services/api';

import { common, signIn } from './copy';

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return common.somethingWrong;
  if (error.status === 0) return common.noConnection;
  if (error.status === 429) return signIn.tooManyTries(error.retryAfter ?? 30);
  // Laravel's validation message names what to fix.
  if (error.status === 422) return error.message;
  return common.somethingWrong;
}
