export interface HistoryEntry {
  id: string;
  method: string;
  urlTemplate?: string;
  urlActual: string;
  /** 脱敏后的请求头 */
  requestHeaders: Record<string, string>;
  requestBody?: string;
  statusCode?: number | null;
  durationMs?: number | null;
  responseSize?: number | null;
  responsePreview?: string;
  error?: string;
  createdAt: number;
}
