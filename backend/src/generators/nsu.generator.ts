import { padLeft } from './helpers';

export class NSUSequencer {
  private counters: Map<string, number> = new Map();

  getNext(cnpj: string): string {
    const current = this.counters.get(cnpj) || 0;
    const next = current + 1;
    this.counters.set(cnpj, next);
    return padLeft(next, 15);
  }

  getCurrent(cnpj: string): string {
    return padLeft(this.counters.get(cnpj) || 0, 15);
  }

  getMax(cnpj: string): string {
    return this.getCurrent(cnpj);
  }

  reset(): void {
    this.counters.clear();
  }
}

export function generateNSUControlDoc(tenantId: string, cnpj: string, ultNSU: string, maxNSU: string, totalCollected: number) {
  return {
    tenantId,
    cnpj,
    ultNSU,
    maxNSU,
    lastSyncAt: new Date(),
    lastStatus: 138,
    syncErrors: 0,
    nextSyncAfter: new Date(Date.now() + 60 * 60 * 1000),
    isCollecting: false,
    totalDocumentsCollected: totalCollected,
    gapNSUs: [],
  };
}
