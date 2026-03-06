import { generateCNPJPool } from './cnpj.generator';
import { generateIE, randomFrom } from './helpers';
import { COMPANY_NAMES, TRADE_NAMES, UF_WEIGHTS } from '../config/constants';
import { v4 as uuid } from 'uuid';

export interface GeneratedTenant {
  id: string;
  data: Record<string, any>;
  cnpjs: GeneratedCNPJ[];
  users: GeneratedUser[];
}

export interface GeneratedCNPJ {
  cnpj: string;
  tenantId: string;
  companyName: string;
  tradeName: string;
  ie: string;
  uf: string;
}

export interface GeneratedUser {
  id: string;
  tenantId: string;
  data: Record<string, any>;
}

function pickUF(): string {
  const r = Math.random();
  let cumulative = 0;
  for (const [uf, weight] of UF_WEIGHTS) {
    cumulative += weight;
    if (r <= cumulative) return uf;
  }
  return 'SP';
}

export function generateTenants(count: number, cnpjsPerTenant: number): GeneratedTenant[] {
  const tenants: GeneratedTenant[] = [];
  let nameIndex = 0;

  for (let t = 0; t < count; t++) {
    const tenantId = uuid();
    const name = COMPANY_NAMES[nameIndex % COMPANY_NAMES.length];
    const tradeName = TRADE_NAMES[nameIndex % TRADE_NAMES.length];
    nameIndex++;

    const cnpjPool = generateCNPJPool(cnpjsPerTenant);
    const cnpjs: GeneratedCNPJ[] = cnpjPool.map((cnpj) => {
      const uf = pickUF();
      return {
        cnpj,
        tenantId,
        companyName: COMPANY_NAMES[(nameIndex++) % COMPANY_NAMES.length],
        tradeName: TRADE_NAMES[nameIndex % TRADE_NAMES.length],
        ie: generateIE(uf),
        uf,
      };
    });

    const users: GeneratedUser[] = [
      {
        id: uuid(),
        tenantId,
        data: {
          tenantId,
          email: `admin@tenant${t + 1}.com.br`,
          displayName: `Admin Tenant ${t + 1}`,
          role: 'admin',
          permissions: ['documents.read', 'documents.download', 'manifest.write', 'settings.write'],
          isActive: true,
          lastLoginAt: new Date(),
          createdAt: new Date(),
        },
      },
      {
        id: uuid(),
        tenantId,
        data: {
          tenantId,
          email: `user@tenant${t + 1}.com.br`,
          displayName: `User Tenant ${t + 1}`,
          role: 'user',
          permissions: ['documents.read', 'documents.download'],
          isActive: true,
          lastLoginAt: new Date(),
          createdAt: new Date(),
        },
      },
    ];

    tenants.push({
      id: tenantId,
      data: {
        name,
        tradeName,
        ownerEmail: `admin@tenant${t + 1}.com.br`,
        plan: randomFrom(['free', 'starter', 'pro', 'enterprise'] as const),
        planStatus: 'active',
        maxCnpjs: cnpjsPerTenant + 5,
        maxUsers: 10,
        billingEmail: `financeiro@tenant${t + 1}.com.br`,
        settings: {
          autoCollect: true,
          collectIntervalMinutes: 60,
          notifyNewDocs: true,
          timezone: 'America/Sao_Paulo',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      cnpjs,
      users,
    });
  }

  return tenants;
}
