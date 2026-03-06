export interface Tenant {
  name: string;
  tradeName: string;
  ownerEmail: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  planStatus: 'active' | 'trial' | 'suspended' | 'cancelled';
  maxCnpjs: number;
  maxUsers: number;
  billingEmail: string;
  settings: {
    autoCollect: boolean;
    collectIntervalMinutes: number;
    notifyNewDocs: boolean;
    timezone: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  tenantId: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: string[];
  isActive: boolean;
  lastLoginAt: Date;
  createdAt: Date;
}

export interface CNPJRegistry {
  tenantId: string;
  companyName: string;
  ie: string;
  uf: string;
  isActive: boolean;
  collectEnabled: boolean;
  createdAt: Date;
}
