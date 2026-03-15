export interface QueryLog {
  event: 'query_result';
  suite: string;
  queryName: string;
  filters: Record<string, unknown>;
  docsReturned: number;
  latencyMs: number;
  indexUsed: boolean;
  status: 'success' | 'index_required' | 'error';
  indexCreationUrl?: string;
  errorMessage?: string;
}

export function logQuery(entry: QueryLog): void {
  if (process.env.STRUCTURED_LOGGING === 'true') {
    console.log(JSON.stringify(entry));
  }
}

export function extractIndexUrl(errorMessage: string): string {
  // Firestore FAILED_PRECONDITION errors include a URL to create the missing index
  const match = errorMessage.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
  return match ? match[0] : '';
}
