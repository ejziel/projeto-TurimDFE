export function weightedRandom<T>(items: [T, number][]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [item, weight] of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number, decimals = 2): number {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

export function logNormalValue(median: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(Math.log(median) + sigma * z);
}

export function randomDateInRange(startMonthsAgo: number, endMonthsAgo: number): Date {
  const now = Date.now();
  const start = now - startMonthsAgo * 30 * 24 * 60 * 60 * 1000;
  const end = now - endMonthsAgo * 30 * 24 * 60 * 60 * 1000;
  return new Date(start + Math.random() * (end - start));
}

export function padLeft(value: number | string, length: number, char = '0'): string {
  return String(value).padStart(length, char);
}

export function randomDigits(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

export function generateProtocol(): string {
  return randomDigits(15);
}

export function generateDigestValue(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < 28; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function generateIE(uf: string): string {
  const lengths: Record<string, number> = {
    SP: 12, MG: 13, RJ: 8, PR: 10, RS: 10, SC: 9, BA: 9,
    GO: 9, PE: 9, CE: 9, ES: 9, MT: 11, MS: 9, PA: 9,
    DF: 13, AM: 9, MA: 9, RN: 9, PB: 9, PI: 9, SE: 9,
    AL: 9, TO: 11, RO: 14, AC: 13, AP: 9, RR: 9,
  };
  return randomDigits(lengths[uf] || 9);
}
