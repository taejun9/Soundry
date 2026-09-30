/** JSON-only boundary: neither app may import server runtime through this file. */
export interface HealthResponse {
  status: 'ok';
  service: 'soundry-api';
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DeleteResult {
  deleted: true;
  cleanupPending: boolean;
}
