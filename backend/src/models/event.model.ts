import { Timestamp } from 'firebase-admin/firestore';

export interface DFeEvent {
  tenantId: string;
  chaveAcesso: string;
  documentId: string;
  tpEvento: string;
  descEvento: string;
  nSeqEvento: number;
  dhEvento: Timestamp;
  nProt: string;
  xMotivo: string;
  xJust: string | null;
  xCorrecao: string | null;
  cOrgao: number;
  xmlStoragePath: string;
  schemaOrigem: string;
  createdAt: Timestamp;
}
