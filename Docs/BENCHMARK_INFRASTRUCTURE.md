# TurimDFE - Infraestrutura de Benchmark Firestore

## 1. Visao Geral

Esta infraestrutura Docker permite avaliar o desempenho do Firestore como banco de dados para o TurimDFE, uma plataforma SaaS de gestao de documentos fiscais eletronicos (NFe, CTe, NFSe, CTe-OS).

O ambiente simula com precisao os dados e operacoes reais que o sistema realizara em producao, incluindo dados gerados com a mesma estrutura das respostas do Web Service NFeDistribuicaoDFe da SEFAZ.

### O que e testado:
- Insercao unitaria e em batch (ate 500 docs por batch)
- Queries com 10+ cenarios de filtros compostos
- Paginacao por cursor em profundidades de 20+ paginas
- Escalabilidade: mesma query em volumes de 1K a 5M documentos
- Operacoes concorrentes (leituras + escritas simultaneas)
- Incremento atomico de contadores (FieldValue.increment)
- Efetividade de indices compostos (1, 2 e 3 campos)

## 2. Arquitetura

```
+-------------------+     +-------------------+     +-------------------+
|                   |     |                   |     |                   |
|  Frontend React   |---->|  Backend Node.js  |---->| Firebase Emulator |
|  (Vite + Tailwind)|     |  (Express)        |     | (Firestore)       |
|  :5173            |     |  :3001            |     | :8080 / UI :4000  |
+-------------------+     +-------------------+     +-------------------+
         |                         |                         |
         +-------------------------+-------------------------+
                           Docker Network (benchmark-net)
```

## 3. Quick Start

### Pre-requisitos
- Docker e Docker Compose instalados
- Minimo 8GB RAM disponivel para Docker (16GB para volumes 2M+)

### Execucao

```bash
# Na raiz do projeto
docker compose up --build

# Aguarde os 3 servicos iniciarem (emulator + backend + frontend)
# O backend so inicia apos o emulator estar healthy (~30s)
```

### Acessos
- **Frontend**: http://localhost:5173
- **Firebase Emulator UI**: http://localhost:4000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

### Fluxo basico
1. Acesse http://localhost:5173
2. Va em "Dados (Seed)" e clique em um volume (ex: "10K")
3. Aguarde o seeding completar (barra de progresso)
4. Va em "Benchmarks" e selecione um teste
5. Clique "Executar" e acompanhe os resultados
6. Va em "Resultados" para comparar e exportar CSV

## 4. Modelo de Dados Firestore

### Colecoes

| Colecao | Document ID | Descricao |
|---------|-------------|-----------|
| tenants | auto-generated | Contas/negocios (multitenant) |
| users | UUID | Usuarios do sistema |
| cnpj_registry | CNPJ (14 digitos) | Garantia de unicidade CNPJ -> tenant |
| certificates | auto-generated | Metadados de certificados digitais |
| nsu_control | {tenantId}_{cnpj} | Ultimo NSU por CNPJ |
| **documents** | auto-generated | **Documentos fiscais (NFe, CTe, NFSe, CTe-OS)** |
| events | auto-generated | Eventos vinculados a documentos |

### Colecao `documents` - Campos Principais

**Controle**: tenantId, cnpjDestinatario, nsu

**Identificacao**: tipo, chaveAcesso (44 digitos), numero, serie

**Emitente** (desnormalizado): emitCnpj, emitNome, emitFantasia, emitUf, emitIe

**Destinatario**: destCnpj, destNome, destUf

**Valores**: valorTotal, valorProdutos, valorDesconto, valorFrete, valorIcms

**Datas**: dataEmissao, dataRecebimento, dataColeta

**Status**: situacao (autorizada|cancelada|denegada), statusManifestacao, protocoloAutorizacao

**Classificacao**: naturezaOperacao, tipoNota, finalidade, cfopPrincipal, papel

**Conteudo**: temXmlCompleto, temPdf, xmlStoragePath, pdfStoragePath

### 16 Indices Compostos Configurados

Todos definidos em `firebase/firestore.indexes.json`:

1. tenantId + dataEmissao DESC
2. tenantId + tipo + dataEmissao DESC
3. tenantId + emitCnpj + dataEmissao DESC
4. tenantId + situacao + dataEmissao DESC
5. tenantId + papel + dataEmissao DESC
6. tenantId + statusManifestacao + dataEmissao DESC
7. tenantId + emitUf + dataEmissao DESC
8. tenantId + temXmlCompleto + dataColeta DESC
9. tenantId + cnpjDestinatario + dataEmissao DESC
10. tenantId + tipo + situacao + dataEmissao DESC
11. tenantId + tipo + emitUf + dataEmissao DESC
12. tenantId + cfopPrincipal + dataEmissao DESC
13. tenantId + finalidade + dataEmissao DESC
14. tenantId + valorTotal DESC
15. events: tenantId + tpEvento + dhEvento DESC
16. events: chaveAcesso + dhEvento DESC

## 5. Geracao de Dados Realistas

### CNPJ
CNPJs gerados com digitos verificadores validos (algoritmo mod-11 com pesos oficiais). Pool de ~200 CNPJs de emitentes reutilizados para consistencia referencial.

### Chave de Acesso (44 digitos)
Estrutura: `cUF(2) + AAMM(4) + CNPJ(14) + modelo(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + cDV(1)`

O digito verificador (cDV) e calculado com pesos ciclicos [2,3,4,5,6,7,8,9] mod 11.

### Distribuicoes Ponderadas
- **Tipo**: 70% NFe, 15% CTe, 10% NFSe, 5% CTe-OS
- **Situacao**: 92% autorizada, 6% cancelada, 2% denegada
- **UF emitente**: SP 30%, MG 12%, RJ 10%, PR 8%, RS 7%, SC 6%
- **Valor total**: R$ 50 - R$ 500.000 (distribuicao log-normal, mediana ~R$ 5.000)
- **ICMS**: 7%, 12% ou 18% conforme regras interestaduais
- **Finalidade**: 85% normal, 8% complementar, 5% ajuste, 2% devolucao
- **Eventos**: 40% Ciencia, 25% Confirmacao, 15% Cancelamento, 10% Carta Correcao

### Volumes Disponiveis

| Volume | Documentos | Eventos | Tenants | CNPJs/Tenant |
|--------|-----------|---------|---------|--------------|
| 1K | 1.000 | 200 | 2 | 3 |
| 10K | 10.000 | 2.000 | 5 | 5 |
| 50K | 50.000 | 10.000 | 8 | 6 |
| 100K | 100.000 | 20.000 | 10 | 8 |
| 250K | 250.000 | 50.000 | 15 | 9 |
| 500K | 500.000 | 100.000 | 20 | 10 |
| 1M | 1.000.000 | 200.000 | 30 | 12 |
| 2M | 2.000.000 | 400.000 | 40 | 15 |
| 5M | 5.000.000 | 1.000.000 | 50 | 20 |

## 6. Benchmarks

### 6.1 Insercao Unitaria (`insert-single`)
Insere N documentos individualmente via `collection.add()`. Mede latencia por operacao.

### 6.2 Insercao em Batch (`insert-batch`)
Compara batch writes com tamanhos 1, 10, 50, 100, 250, 500. Usa `db.batch()` com `batch.set()`.

### 6.3 Queries com Filtros (`query-filters`)
10 cenarios de queries usando todos os indices compostos:
- tenant + data range (ultimos 30 dias)
- tenant + tipo + data
- tenant + situacao + data
- tenant + papel + data
- tenant + UF emitente + data
- tenant + manifestacao + data
- tenant + XML completo + data coleta
- tenant + tipo + situacao + data (3 campos)
- tenant + CFOP + data
- tenant + valor DESC

### 6.4 Paginacao por Cursor (`query-pagination`)
Navega 20 paginas usando `startAfter(lastDoc)` com paginas de 25, 50 e 100 documentos. Mede degradacao de latencia por profundidade.

### 6.5 Escalabilidade por Volume (`query-volume`)
Executa 5 queries padrao no volume atual. Compare resultados entre diferentes volumes (seed 1K, rode, seed 10K, rode, etc.) para validar O(result_set) do Firestore.

### 6.6 Operacoes Concorrentes (`concurrent`)
Spawna N readers + M writers simultaneos por 15 segundos. Mede throughput e latencia sob contencao.

### 6.7 Incremento de Contadores (`counter-increment`)
Testa `FieldValue.increment(1)` com concorrencia 1, 5, 10, 20, 50. Valida consistencia eventual do contador.

### 6.8 Efetividade de Indices (`index-effectiveness`)
Compara latencia de queries com 1 campo (auto-indexed), 2 campos (composite), 3 campos (composite) e range queries.

### 6.9 Suite Completa (`full-suite`)
Executa todos os 8 benchmarks em sequencia.

## 7. API Reference

### Seed
```
POST /api/seed/generate    { "volume": "10k" }
GET  /api/seed/status      -> { counts, seedProgress }
GET  /api/seed/progress     -> SSE stream
DELETE /api/seed/clear      -> limpa dados
```

### Benchmarks
```
POST /api/benchmarks/run/insert-single       { "iterations": 500 }
POST /api/benchmarks/run/insert-batch        { "batchSizes": [10,50,500], "batchesPerSize": 10 }
POST /api/benchmarks/run/query-filters       { "iterations": 30 }
POST /api/benchmarks/run/query-pagination    { "pagesToFetch": 20 }
POST /api/benchmarks/run/query-volume        { "iterations": 50 }
POST /api/benchmarks/run/concurrent          { "concurrentReaders": 10, "concurrentWriters": 5 }
POST /api/benchmarks/run/counter-increment   { "concurrencyLevels": [1,5,10,20] }
POST /api/benchmarks/run/index-effectiveness { "iterations": 30 }
POST /api/benchmarks/run/full-suite          {}

GET  /api/benchmarks/status/:runId           -> { runId, status, progress, results }
GET  /api/benchmarks/results                 -> BenchmarkResult[]
GET  /api/benchmarks/results/:runId          -> BenchmarkResult[]
```

### Health
```
GET  /api/health  -> { status, firestore, emulatorHost, uptime }
```

## 8. Metricas Coletadas

Cada benchmark retorna:
- **totalOperations**: numero de operacoes executadas
- **totalDurationMs**: duracao total
- **operationsPerSecond**: throughput
- **latency**: min, max, mean, median, p95, p99, stddev
- **errors**: contagem de erros
- **errorRate**: taxa de erros
- **rawTimings**: array de tempos individuais (downsampled para 1000 pontos)
- **metadata**: versao Node.js, plataforma, uso de memoria

## 9. Interpretando os Resultados

### O que observar:
- **Escalabilidade**: A latencia deve se manter constante independente do volume (O(result_set), nao O(collection_size))
- **Batch vs Single**: Batch writes devem ser significativamente mais rapidos por documento
- **Indices compostos**: Queries com 2-3 campos devem ter latencia similar a queries de 1 campo
- **Paginacao**: Latencia deve ser constante entre paginas (cursor-based, nao offset)
- **Contadores**: FieldValue.increment deve manter consistencia mesmo com alta concorrencia

### Sinais de alerta:
- Latencia crescendo linearmente com o volume (indica problema de indice)
- P99 muito maior que P95 (indica picos intermitentes)
- Erros em operacoes de leitura (indica problemas de conexao com emulador)

## 10. Limitacoes do Emulador

**IMPORTANTE**: O emulador Firestore tem diferencas em relacao a producao:
- **Indices**: Respeita as definicoes de `firestore.indexes.json`, mas **nao rejeita** queries que precisariam de indice em producao (processa em memoria)
- **Performance**: O emulador roda localmente com JVM. Os tempos absolutos nao representam a latencia de producao (que e tipicamente 20-50ms para queries simples)
- **Escala**: O emulador nao faz sharding real. Os benchmarks medem a escalabilidade relativa, nao absoluta
- **Custo**: O emulador nao cobra por operacao. Use os benchmarks para avaliar padroes de acesso, nao custos

**Use os resultados para**:
- Validar que queries com indices compostos funcionam corretamente
- Comparar eficiencia relativa entre diferentes padroes de acesso
- Testar que o modelo de dados suporta todos os filtros necessarios da API
- Verificar que batch writes e paginacao cursor-based funcionam conforme esperado

## 11. Troubleshooting

### Emulador nao inicia
- Verifique se Java esta instalado no container: `docker exec firebase-emulator java --version`
- Aumente a memoria do Docker para 8GB+
- Verifique se as portas 4000 e 8080 estao livres

### Seeding lento
- Volumes de 500K+ levam varios minutos. Acompanhe pelo SSE ou barra de progresso
- Para 2M+, configure `JAVA_TOOL_OPTIONS=-Xmx8g` no docker-compose.yml
- Use volumes menores (1K-100K) para testes rapidos

### Backend nao conecta ao emulador
- Verifique que `FIRESTORE_EMULATOR_HOST=firebase-emulator:8080` esta configurado
- O backend espera o healthcheck do emulador (service_healthy)
- Teste com: `curl http://localhost:4000`

### Frontend nao carrega dados
- Verifique que o backend esta rodando: `curl http://localhost:3001/api/health`
- O frontend usa `VITE_API_URL=http://localhost:3001` (nao o host Docker)
