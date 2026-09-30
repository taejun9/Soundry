/** JSON-only boundary: neither app may import server runtime through this file. */
export interface HealthResponse {
  status: 'ok';
  service: 'soundry-api';
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}
