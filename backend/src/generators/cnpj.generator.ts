import { randomDigits } from './helpers';

function computeCheckDigits(base12: string): string {
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base12[i]) * weights1[i];
  }
  const d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);

  const base13 = base12 + d1.toString();
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(base13[i]) * weights2[i];
  }
  const d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);

  return d1.toString() + d2.toString();
}

export function generateCNPJ(branch = '0001'): string {
  const base8 = randomDigits(8);
  const base12 = base8 + branch;
  const checkDigits = computeCheckDigits(base12);
  return base12 + checkDigits;
}

export function validateCNPJ(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  const base12 = cnpj.substring(0, 12);
  const expected = computeCheckDigits(base12);
  return cnpj.substring(12) === expected;
}

export function generateCNPJPool(count: number): string[] {
  const pool: string[] = [];
  const seen = new Set<string>();
  while (pool.length < count) {
    const cnpj = generateCNPJ();
    if (!seen.has(cnpj)) {
      seen.add(cnpj);
      pool.push(cnpj);
    }
  }
  return pool;
}
