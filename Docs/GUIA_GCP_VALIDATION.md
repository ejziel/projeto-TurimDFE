# Guia: Validação GCP Firestore

> Valida hipótese O(result): query latency é constante independente do tamanho da coleção quando há índices compostos adequados.
>
> Usa **Firestore nativo no GCP** — sem Firebase CLI. Apenas `gcloud`.
>
> **Todos os comandos são para PowerShell no Windows.**

---

## Pré-requisitos

- **gcloud CLI** instalado: https://cloud.google.com/sdk/docs/install
  Windows: baixar o instalador `.exe` e seguir o wizard
- **Docker Desktop** instalado e rodando
- Acesso ao projeto GCP `turimdfe` com role `Editor`

> **Nota PowerShell:** o caractere de continuação de linha é `` ` `` (backtick), não `\`.
> O `curl` no PowerShell é um alias para `Invoke-WebRequest`. Use `curl.exe` para chamar o curl real do Windows.

---

## Passo 1 — Login e configuração (uma vez só)

```powershell
# Login interativo (abre browser)
gcloud auth login

# Credenciais Application Default (usadas pelo SDK dentro do Docker)
gcloud auth application-default login

# Setar projeto padrão
gcloud config set project turimdfe
```

---

## Passo 2 — Habilitar APIs e criar o banco Firestore (apenas para projeto novo)

```powershell
# Habilitar as APIs necessárias
gcloud services enable firestore.googleapis.com --project=turimdfe
gcloud services enable iam.googleapis.com --project=turimdfe

# Criar o banco Firestore em modo Native na região southamerica-east1
gcloud firestore databases create `
  --project=turimdfe `
  --location=southamerica-east1 `
  --type=firestore-native
```

> **Importante:** use `--type=firestore-native` (não Datastore mode). O modo Native suporta índices compostos e o Firebase Admin SDK.

Verificar que foi criado:

```powershell
gcloud firestore databases list --project=turimdfe
# Deve mostrar: name: "(default)", locationId: "southamerica-east1", type: "FIRESTORE_NATIVE"
```

---

## Passo 3 — Criar índices compostos no Firestore (uma vez só)

> Não precisa de Firebase CLI. Use `gcloud firestore indexes composite create` diretamente.
>
> **Por que apenas esses 4 índices?**
> Campos de texto/enum (`tipo`, `situacao`, `papel`, etc.) funcionam com os índices automáticos do Firestore quando usados como filtros de igualdade simples (`==`).
> Índices compostos só são obrigatórios quando a query usa **range** (`>`, `<`, `>=`, `<=`) em um campo combinado com um filtro de igualdade em outro campo — o Firestore não consegue executar esse tipo de query sem um índice composto, nem mesmo de forma lenta.

Execute cada bloco abaixo no PowerShell. Os índices são criados assincronamente (5–30 min para ficar READY).

```powershell
# IMPORTANTE: as aspas em --field-config são necessárias no PowerShell
# para evitar que a vírgula seja interpretada como separador de array.

# ── Coleção: documents ──────────────────────────────────────────────────────

# 1. tenantId + dataEmissao  ← range de data (período de emissão)
#    Usado em: WHERE tenantId = X AND dataEmissao >= data1 AND dataEmissao <= data2
gcloud firestore indexes composite create `
  --project=turimdfe --collection-group=documents `
  "--field-config=field-path=tenantId,order=ascending" `
  "--field-config=field-path=dataEmissao,order=ascending"

# 2. tenantId + valorTotal  ← range de valor (faixa de valor da NF)
#    Usado em: WHERE tenantId = X AND valorTotal >= 1000 AND valorTotal <= 5000
gcloud firestore indexes composite create `
  --project=turimdfe --collection-group=documents `
  "--field-config=field-path=tenantId,order=ascending" `
  "--field-config=field-path=valorTotal,order=ascending"

# 3. tenantId + dataColeta  ← range de data de coleta
#    Usado em: WHERE tenantId = X AND dataColeta >= data1 AND dataColeta <= data2
gcloud firestore indexes composite create `
  --project=turimdfe --collection-group=documents `
  "--field-config=field-path=tenantId,order=ascending" `
  "--field-config=field-path=dataColeta,order=ascending"

# ── Coleção: events ──────────────────────────────────────────────────────────

# 4. chaveAcesso + dhEvento  ← range de data dos eventos de uma NF
#    Usado em: WHERE chaveAcesso = X AND dhEvento >= data1 AND dhEvento <= data2
gcloud firestore indexes composite create `
  --project=turimdfe --collection-group=events `
  "--field-config=field-path=chaveAcesso,order=ascending" `
  "--field-config=field-path=dhEvento,order=ascending"
```

> **Filtros de igualdade não precisam de índice composto:**
> Queries como `WHERE tenantId = X AND tipo = "nfe"` ou `WHERE tenantId = X AND situacao = "autorizada"` funcionam diretamente com os índices automáticos do Firestore — não é preciso criar índices manuais para esses campos.
>
> O Firestore informará automaticamente (com link para o Console GCP) qual índice criar caso uma query falhe com `FAILED_PRECONDITION` — adicione índices sob demanda conforme os filtros forem sendo usados.

Verificar status dos índices (aguardar todos READY):

```powershell
gcloud firestore indexes composite list --project=turimdfe
```

Ou no Console GCP: https://console.cloud.google.com/firestore/databases/-default-/indexes?project=turimdfe

---

## Passo 4 — Criar Service Account e baixar a chave

```powershell
# Criar service account
gcloud iam service-accounts create benchmark-sa `
  --project=turimdfe `
  --display-name="Benchmark Service Account"

# Conceder permissão de leitura/escrita no Firestore
gcloud projects add-iam-policy-binding turimdfe `
  --member="serviceAccount:benchmark-sa@turimdfe.iam.gserviceaccount.com" `
  --role="roles/datastore.user"

# Criar a pasta credentials (já está no .gitignore)
New-Item -ItemType Directory -Path credentials -Force

# Baixar a chave JSON
gcloud iam service-accounts keys create credentials/sa-key.json `
  --iam-account=benchmark-sa@turimdfe.iam.gserviceaccount.com
```

> **Segurança:** a pasta `credentials/` está no `.gitignore`. Nunca commite `sa-key.json`.

---

## Passo 5 — Subir o ambiente em modo GCP

```powershell
# Na raiz do projeto
docker compose -f docker-compose.yml -f docker-compose.gcp.yml up --build
```

Verificar que está conectado ao GCP (em outro terminal):

```powershell
curl.exe http://localhost:3001/api/health
# Deve retornar: "gcpMode": true, "firestore": "connected"
```

No frontend (http://localhost:5173), o badge no Sidebar deve mostrar **● GCP** em verde.

---

## Passo 6 — Seed com 5K (teste rápido)

```powershell
curl.exe -X POST http://localhost:3001/api/seed/generate `
  -H "Content-Type: application/json" `
  -d '{\"volume\": \"gcp-5k\"}'

# Acompanhar progresso
curl.exe http://localhost:3001/api/seed/status
```

Ou pelo frontend: **Dados (Seed)** → selecionar `gcp-5k` → Gerar.

---

## Passo 7 — Rodar validação

```powershell
curl.exe -X POST http://localhost:3001/api/benchmarks/run/gcp-validation `
  -H "Content-Type: application/json" `
  -d '{\"iterations\": 5}'
```

Pegar o `runId` da resposta e verificar resultado:

```powershell
# Substituir {runId} pelo valor retornado acima
curl.exe http://localhost:3001/api/benchmarks/gcp-validation/{runId}

# Ou pegar o último resultado diretamente:
curl.exe http://localhost:3001/api/benchmarks/gcp-validation-latest
```

Ou pelo frontend: **GCP Validation** → selecionar volume → clicar **Rodar Validação**.

### O que esperar (modo GCP):
| Grupo | Queries | Resultado esperado |
|-------|---------|-------------------|
| A — Indexadas | `tipo`, `tipo_situacao`, `yearMonth`, `situacao` | `✓ indexed`, latência 50–300ms |
| B — Sem índice | `tipo+situacao+emitUf`, `valorProdutos range`, `tipo_situacao+valor range` | `⚠ index_required` + URL para criar |

> **Prova chave:** no Emulator o Grupo B retornaria sucesso (scan em memória). No GCP real, falha com `FAILED_PRECONDITION`. Isso valida que produção exige índices.

---

## Passo 8 — Seed com 50K e repetir

```powershell
curl.exe -X DELETE http://localhost:3001/api/seed/clear

curl.exe -X POST http://localhost:3001/api/seed/generate `
  -H "Content-Type: application/json" `
  -d '{\"volume\": \"gcp-50k\"}'

curl.exe -X POST http://localhost:3001/api/benchmarks/run/gcp-validation `
  -H "Content-Type: application/json" `
  -d '{\"iterations\": 5}'
```

Anotar latências do Grupo A para comparar com 500K.

---

## Passo 9 — Seed com 500K e repetir (prova O(result))

```powershell
curl.exe -X DELETE http://localhost:3001/api/seed/clear

curl.exe -X POST http://localhost:3001/api/seed/generate `
  -H "Content-Type: application/json" `
  -d '{\"volume\": \"gcp-500k\"}'

curl.exe -X POST http://localhost:3001/api/benchmarks/run/gcp-validation `
  -H "Content-Type: application/json" `
  -d '{\"iterations\": 5}'
```

### Comparar resultados (prova O(result)):

| Query | Latência 50K | Latência 500K | Ratio |
|-------|-------------|--------------|-------|
| A1_tipo_nfe_recentes | ~Xms | ~Xms | ≈ 1.0 |
| A2_tipo_situacao_computed | ~Xms | ~Xms | ≈ 1.0 |
| A3_yearMonth_valor | ~Xms | ~Xms | ≈ 1.0 |

> **Hipótese confirmada se ratio ≈ 1.0 (±30%).** O Firestore escala pelo tamanho do resultado, não da coleção.

---

## Passo 10 — Voltar para modo Emulator (desenvolvimento normal)

```powershell
docker compose -f docker-compose.yml -f docker-compose.gcp.yml down
docker compose up
```

O badge no Sidebar voltará para **● Emulator** em amarelo.

---

## Custos estimados (southamerica-east1)

| Operação | Custo estimado |
|----------|----------------|
| Seed 5K | ~$0.001 |
| Seed 50K | ~$0.05 |
| Seed 500K | ~$0.50 |
| Validação × 2 (50K + 500K) | ~$0.60 |
| **Total experimento completo** | **~$1.20** |

> Firestore: $0.06/100K reads · $0.18/100K writes · Armazenamento: $0.18/GB/mês

---

## Troubleshooting

### `Database already exists` ao criar o Firestore
O projeto já tem um banco — verificar o modo:
```powershell
gcloud firestore databases list --project=turimdfe
```
Se `type` for `DATASTORE_MODE`, não é compatível. Crie um novo projeto GCP ou contate o suporte para migração para Native mode.

### `FAILED_PRECONDITION` nas queries do Grupo A (indexadas)
Os índices ainda estão sendo construídos. Aguardar e verificar:
```powershell
gcloud firestore indexes composite list --project=turimdfe
# Espere STATE = READY em todos
```

### `Could not load the default credentials`
O `sa-key.json` não foi encontrado. Verificar se o arquivo existe e se o volume está montado:
```powershell
docker compose -f docker-compose.yml -f docker-compose.gcp.yml exec backend ls /credentials/
```

### Emulator aparece no health quando deveria ser GCP
```powershell
docker compose -f docker-compose.yml -f docker-compose.gcp.yml config | Select-String "GCP_MODE"
# Deve mostrar: GCP_MODE: "true"
```

### `Index already exists`
Índice já foi criado antes — ignorar. Confirmar com:
```powershell
gcloud firestore indexes composite list --project=turimdfe
```

### Seed muito lento no 500K
Normal — 500K writes em batches de 499. Estimativa: 35–50 min dependendo da latência para `southamerica-east1`.

### `curl` retorna HTML em vez de JSON no PowerShell
O `curl` sem `.exe` no PowerShell é alias para `Invoke-WebRequest`. Use sempre `curl.exe`:
```powershell
curl.exe http://localhost:3001/api/health
```
