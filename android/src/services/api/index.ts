// The API the app uses: the real Laravel server, or the in-app mock with EXPO_PUBLIC_USE_MOCK_API=1.
import { realApi } from './client';
import { mockApi } from './mock';
import type { AsterApi } from './types';

export const useMockApi = process.env.EXPO_PUBLIC_USE_MOCK_API === '1';

export const api: AsterApi = useMockApi ? mockApi : realApi;

export { ApiError, DEFAULT_ENGINES } from './types';
export type {
  ActivityEventBody,
  AsterApi,
  Conversation,
  CreateProfileBody,
  EngineOption,
  FinishReason,
  LlmEngine,
  HealthServer,
  LlmHealth,
  LocationDay,
  LocationEvent,
  LocationPoint,
  LocationPointBody,
  LocationSettings,
  LoginBody,
  Message,
  MessageBody,
  Place,
  Profile,
  ProfileRole,
  RegisterBody,
  Reminder,
  ReminderStatus,
  ReminderTrigger,
  Source,
  TokenResponse,
  UnlockResponse,
  UpdateProfileBody,
} from './types';
