// The API the app uses. Mocks until Phase 7 connects the real Laravel server.
import { mockApi } from './mock';
import type { AsterApi } from './types';

export const useMockApi = process.env.EXPO_PUBLIC_USE_MOCK_API === '1';

const notConnected = (): never => {
  throw new Error('The real API client arrives in Phase 7. Set EXPO_PUBLIC_USE_MOCK_API=1.');
};

export const api: AsterApi = useMockApi
  ? mockApi
  : new Proxy({} as AsterApi, { get: () => notConnected });

export { ApiError, DEFAULT_ENGINES } from './types';
export type {
  AsterApi,
  CreateProfileBody,
  EngineOption,
  LlmEngine,
  LlmHealth,
  LoginBody,
  Place,
  Profile,
  ProfileRole,
  RegisterBody,
  TokenResponse,
  UnlockResponse,
  UpdateProfileBody,
} from './types';
