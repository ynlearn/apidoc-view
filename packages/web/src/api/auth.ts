import type { AuthStatus, LoginDto, LoginResult } from '@openapi-view/shared';
import { http } from './http';

export function getAuthStatus() {
  return http.get<AuthStatus>('/auth/status').then((r) => r.data);
}

export function login(dto: LoginDto) {
  return http.post<LoginResult>('/auth/login', dto).then((r) => r.data);
}
