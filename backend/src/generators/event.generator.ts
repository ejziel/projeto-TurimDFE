import { Timestamp } from 'firebase-admin/firestore';
import { EVENT_TYPES, JUSTIFICATIVAS_CANCELAMENTO, CORRECOES_CARTA } from '../config/constants';
import { weightedRandom, generateProtocol, randomFrom, randomInt } from './helpers';

const EVENT_WEIGHTS: [typeof EVENT_TYPES[number], number][] = EVENT_TYPES.map((e) => [e, e.weight]);

export function generateEventData(
  tenantId: string,
  chaveAcesso: string,
  documentId: string,
  baseDate: Date,
  seqNum: number,
): Record<string, any> {
  const eventType = weightedRandom(EVENT_WEIGHTS);
  const dhEvento = new Date(baseDate.getTime() + randomInt(1, 72) * 3600 * 1000);

  const event: Record<string, any> = {
    tenantId,
    chaveAcesso,
    documentId,
    tpEvento: eventType.code,
    descEvento: eventType.desc,
    nSeqEvento: seqNum,
    dhEvento: Timestamp.fromDate(dhEvento),
    nProt: generateProtocol(),
    xMotivo: `Evento registrado com sucesso`,
    cOrgao: parseInt(chaveAcesso.substring(0, 2)),
    xmlStoragePath: `tenants/${tenantId}/eventos/${chaveAcesso}_${eventType.code}_${seqNum}.xml`,
    schemaOrigem: 'procEventoNFe_v1.00.xsd',
    createdAt: Timestamp.fromDate(dhEvento),
  };

  if (eventType.code === '110111') {
    event.xJust = randomFrom(JUSTIFICATIVAS_CANCELAMENTO);
  } else if (eventType.code === '110110') {
    event.xCorrecao = randomFrom(CORRECOES_CARTA);
  } else {
    event.xJust = null;
    event.xCorrecao = null;
  }

  return event;
}

export function generateEventsForDocument(
  tenantId: string,
  chaveAcesso: string,
  documentId: string,
  baseDate: Date,
  count: number,
): Record<string, any>[] {
  const events: Record<string, any>[] = [];
  for (let i = 1; i <= count; i++) {
    events.push(generateEventData(tenantId, chaveAcesso, documentId, baseDate, i));
  }
  return events;
}
