import { UF_CODES } from '../config/constants';
import { padLeft, randomDigits } from './helpers';

function computeCDV(chave43: string): string {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  for (let i = 42; i >= 0; i--) {
    sum += parseInt(chave43[i]) * weights[(42 - i) % 8];
  }
  const remainder = sum % 11;
  const cdv = remainder < 2 ? 0 : 11 - remainder;
  return cdv.toString();
}

export interface ChaveAcessoParams {
  uf: string;
  dataEmissao: Date;
  cnpjEmit: string;
  modelo: '55' | '57' | '67';
  serie: number;
  numero: number;
  tpEmis?: number;
}

export function generateChaveAcesso(params: ChaveAcessoParams): string {
  const { uf, dataEmissao, cnpjEmit, modelo, serie, numero, tpEmis = 1 } = params;

  const cUF = padLeft(UF_CODES[uf] || 35, 2);
  const year = dataEmissao.getFullYear().toString().slice(2);
  const month = padLeft(dataEmissao.getMonth() + 1, 2);
  const aamm = year + month;
  const cnpj = cnpjEmit.replace(/\D/g, '').padStart(14, '0');
  const mod = padLeft(modelo, 2);
  const ser = padLeft(serie, 3);
  const nNF = padLeft(numero, 9);
  const tp = tpEmis.toString();
  const cNF = randomDigits(8);

  const chave43 = cUF + aamm + cnpj + mod + ser + nNF + tp + cNF;
  const cdv = computeCDV(chave43);

  return chave43 + cdv;
}

export function extractChaveInfo(chave: string) {
  return {
    cUF: chave.substring(0, 2),
    aamm: chave.substring(2, 6),
    cnpj: chave.substring(6, 20),
    modelo: chave.substring(20, 22),
    serie: parseInt(chave.substring(22, 25)),
    numero: parseInt(chave.substring(25, 34)),
    tpEmis: chave.substring(34, 35),
    cNF: chave.substring(35, 43),
    cDV: chave.substring(43, 44),
  };
}
