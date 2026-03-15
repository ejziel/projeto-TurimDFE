import { Timestamp } from 'firebase-admin/firestore';
import { generateChaveAcesso } from './chave-acesso.generator';
import { generateCNPJ } from './cnpj.generator';
import { NSUSequencer } from './nsu.generator';
import {
  weightedRandom, randomFrom, randomInt, logNormalValue,
  randomDateInRange, generateProtocol, generateIE,
} from './helpers';
import {
  COMPANY_NAMES, TRADE_NAMES, NATUREZAS_OPERACAO,
  CFOPS, UF_WEIGHTS,
} from '../config/constants';
import { GeneratedCNPJ } from './tenant.generator';

const TIPO_WEIGHTS: [string, number][] = [
  ['nfe', 0.70], ['cte', 0.15], ['nfse', 0.10], ['cteos', 0.05],
];
const SITUACAO_WEIGHTS: [string, number][] = [
  ['autorizada', 0.92], ['cancelada', 0.06], ['denegada', 0.02],
];
const FINALIDADE_WEIGHTS: [number, number][] = [
  [1, 0.85], [2, 0.08], [3, 0.05], [4, 0.02],
];
const MANIFESTACAO_WEIGHTS: [string | null, number][] = [
  [null, 0.30], ['ciencia', 0.30], ['confirmada', 0.25],
  ['desconhecida', 0.05], ['nao_realizada', 0.05], ['pendente', 0.05],
];
const PAPEL_WEIGHTS: [string, number][] = [
  ['destinatario', 0.80], ['emitente', 0.10], ['terceiro', 0.10],
];

function pickUF(): string {
  return weightedRandom(UF_WEIGHTS);
}

function getModelo(tipo: string): '55' | '57' | '67' {
  if (tipo === 'cte') return '57';
  if (tipo === 'cteos') return '67';
  return '55';
}

function getIcmsRate(emitUf: string, destUf: string): number {
  if (emitUf === destUf) return emitUf === 'SP' || emitUf === 'MG' || emitUf === 'RJ' || emitUf === 'PR' ? 0.18 : 0.17;
  const sulSudeste = ['SP', 'MG', 'RJ', 'PR', 'RS', 'SC', 'ES'];
  if (sulSudeste.includes(destUf)) return 0.12;
  return 0.07;
}

// Pre-generate a pool of emitente CNPJs for reuse
let emitenteCNPJPool: string[] = [];
function getEmitenteCNPJ(index: number): string {
  if (emitenteCNPJPool.length === 0) {
    emitenteCNPJPool = Array.from({ length: 200 }, () => generateCNPJ());
  }
  return emitenteCNPJPool[index % emitenteCNPJPool.length];
}

export function generateDocumentData(
  tenantId: string,
  destCnpjInfo: GeneratedCNPJ,
  nsuSequencer: NSUSequencer,
  docIndex: number,
): Record<string, any> {
  const tipo = weightedRandom(TIPO_WEIGHTS);
  const situacao = weightedRandom(SITUACAO_WEIGHTS);
  const finalidade = weightedRandom(FINALIDADE_WEIGHTS);
  const papel = weightedRandom(PAPEL_WEIGHTS);
  const statusManifestacao = weightedRandom(MANIFESTACAO_WEIGHTS);

  const emitUf = pickUF();
  const emitCnpj = getEmitenteCNPJ(docIndex);
  const emitNameIdx = docIndex % COMPANY_NAMES.length;

  const dataEmissao = randomDateInRange(12, 0);
  const dataRecebimento = new Date(dataEmissao.getTime() + randomInt(60, 7200) * 1000);
  const dataColeta = new Date(dataEmissao.getTime() + randomInt(3600, 172800) * 1000);

  const serie = randomInt(1, 3);
  const numero = randomInt(1, 999999);

  const chaveAcesso = generateChaveAcesso({
    uf: emitUf,
    dataEmissao,
    cnpjEmit: emitCnpj,
    modelo: getModelo(tipo),
    serie,
    numero,
  });

  const nsu = nsuSequencer.getNext(destCnpjInfo.cnpj);

  const valorProdutos = Number(logNormalValue(5000, 1.5).toFixed(2));
  const clampedValorProdutos = Math.max(50, Math.min(500000, valorProdutos));
  const valorDesconto = Math.random() < 0.3 ? Number((clampedValorProdutos * Math.random() * 0.05).toFixed(2)) : 0;
  const valorFrete = Math.random() < 0.5 ? Number((Math.random() * 3000).toFixed(2)) : 0;
  const valorTotal = Number((clampedValorProdutos - valorDesconto + valorFrete).toFixed(2));
  const icmsRate = getIcmsRate(emitUf, destCnpjInfo.uf);
  const valorIcms = Number((clampedValorProdutos * icmsRate).toFixed(2));

  const temXmlCompleto = Math.random() < 0.70;
  const temPdf = Math.random() < 0.40;
  const totalEventos = randomInt(0, 5);

  // Computed fields for optimized composite indexes
  const tipo_situacao = `${tipo}_${situacao}`;
  const yearMonth = `${dataEmissao.getFullYear()}-${String(dataEmissao.getMonth() + 1).padStart(2, '0')}`;

  return {
    tenantId,
    cnpjDestinatario: destCnpjInfo.cnpj,
    nsu,
    tipo,
    chaveAcesso,
    numero,
    serie,
    emitCnpj,
    emitNome: COMPANY_NAMES[emitNameIdx],
    emitFantasia: TRADE_NAMES[emitNameIdx % TRADE_NAMES.length],
    emitUf,
    emitIe: generateIE(emitUf),
    destCnpj: destCnpjInfo.cnpj,
    destNome: destCnpjInfo.companyName,
    destUf: destCnpjInfo.uf,
    valorTotal,
    valorProdutos: clampedValorProdutos,
    valorDesconto,
    valorFrete,
    valorIcms,
    dataEmissao: Timestamp.fromDate(dataEmissao),
    dataRecebimento: Timestamp.fromDate(dataRecebimento),
    dataColeta: Timestamp.fromDate(dataColeta),
    situacao,
    tipo_situacao,
    yearMonth,
    statusManifestacao,
    protocoloAutorizacao: generateProtocol(),
    naturezaOperacao: randomFrom(NATUREZAS_OPERACAO),
    tipoNota: Math.random() < 0.6 ? 1 : 0,
    finalidade,
    cfopPrincipal: randomFrom(CFOPS),
    papel,
    temXmlCompleto,
    temPdf,
    xmlStoragePath: temXmlCompleto ? `tenants/${tenantId}/${tipo}/${dataEmissao.getFullYear()}/${String(dataEmissao.getMonth() + 1).padStart(2, '0')}/${chaveAcesso}.xml` : null,
    pdfStoragePath: temPdf ? `tenants/${tenantId}/${tipo}/${dataEmissao.getFullYear()}/${String(dataEmissao.getMonth() + 1).padStart(2, '0')}/${chaveAcesso}.pdf` : null,
    schemaOrigem: temXmlCompleto ? 'procNFe_v4.00.xsd' : 'resNFe_v1.00.xsd',
    totalEventos,
    ultimoEvento: totalEventos > 0 ? 'Confirmacao da Operacao' : null,
    ultimoEventoAt: totalEventos > 0 ? Timestamp.fromDate(new Date(dataColeta.getTime() + randomInt(3600, 86400) * 1000)) : null,
    createdAt: Timestamp.fromDate(dataColeta),
    updatedAt: Timestamp.fromDate(dataColeta),
  };
}
