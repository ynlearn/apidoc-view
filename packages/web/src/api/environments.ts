import type { Environment, GlobalVariable } from '@bluebull/shared';
import { http } from './http';

export function listEnvironments() {
  return http
    .get<{ items: Environment[]; activeId: string | null }>('/environments')
    .then((r) => r.data);
}

export function createEnvironment(name: string, variables: Record<string, string>) {
  return http.post<Environment>('/environments', { name, variables }).then((r) => r.data);
}

export function updateEnvironment(id: string, patch: { name?: string; variables?: Record<string, string> }) {
  return http.put<Environment>(`/environments/${id}`, patch).then((r) => r.data);
}

export function deleteEnvironment(id: string) {
  return http.delete(`/environments/${id}`);
}

export function activateEnvironment(id: string) {
  return http.post<Environment>(`/environments/${id}/activate`).then((r) => r.data);
}

export function listGlobals() {
  return http.get<GlobalVariable[]>('/globals').then((r) => r.data);
}

export function replaceGlobals(variables: Array<{ key: string; value: string; description?: string }>) {
  return http.put<GlobalVariable[]>('/globals', { variables }).then((r) => r.data);
}
