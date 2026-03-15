import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getDocumentTenants,
    listDocuments,
    runCountPaginationBenchmark,
    getCountPaginationResult,
    startBackfill,
    getBackfillProgress as fetchBackfillProgress,
} from '../api/benchmarkApi';
import type {
    DocumentListResponse,
    DocumentListError,
    CountPaginationResult,
    CountPaginationScenario,
    TenantInfo,
    BackfillProgress,
    CountSource,
} from '../types/benchmark.types';

// ─── Constants ───────────────────────────────────────────────────────────────

const UF_LIST = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const PAGE_SIZE = 20;

const TIPO_COLORS: Record<string, string> = {
    nfe: '#2563eb',
    cte: '#7c3aed',
    nfse: '#059669',
    cteos: '#d97706',
};
const TIPO_BG: Record<string, string> = {
    nfe: '#dbeafe',
    cte: '#ede9fe',
    nfse: '#d1fae5',
    cteos: '#fef3c7',
};
const SITUACAO_COLORS: Record<string, { bg: string; fg: string }> = {
    autorizada: { bg: '#dcfce7', fg: '#166534' },
    cancelada: { bg: '#fee2e2', fg: '#991b1b' },
    denegada: { bg: '#ffedd5', fg: '#9a3412' },
};
const MANIFESTACAO_COLORS: Record<string, { bg: string; fg: string }> = {
    ciencia: { bg: '#e0f2fe', fg: '#0369a1' },
    confirmada: { bg: '#dcfce7', fg: '#166534' },
    desconhecida: { bg: '#f3f4f6', fg: '#6b7280' },
    nao_realizada: { bg: '#fee2e2', fg: '#991b1b' },
    pendente: { bg: '#fef9c3', fg: '#854d0e' },
};

const SORT_FIELDS = [
    { value: '', label: 'Padrão (sem ordenação)' },
    { value: 'dataEmissao', label: 'Data Emissão' },
    { value: 'dataColeta', label: 'Data Coleta' },
    { value: 'valorTotal', label: 'Valor Total' },
    { value: 'valorProdutos', label: 'Valor Produtos' },
    { value: 'numero', label: 'Número' },
    { value: 'tipo', label: 'Tipo' },
    { value: 'situacao', label: 'Situação' },
    { value: 'emitUf', label: 'UF Emitente' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
}
function fmtCurrency(n: number) {
    return n?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';
}
function fmtCnpj(cnpj: string) {
    if (!cnpj || cnpj.length !== 14) return cnpj || '—';
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
function fmtMs(n: number) { return n.toFixed(1); }

function buildGcloudCommand(filters: Record<string, string>, orderByField: string, orderDir: 'asc' | 'desc'): string {
    const dir = (d: 'asc' | 'desc') => d === 'asc' ? 'ascending' : 'descending';
    const lines: string[] = [
        'gcloud firestore indexes composite create `',
        '  --project=turimdfe --collection-group=documents `',
        '  "--field-config=field-path=tenantId,order=ascending" `',
    ];
    const active = Object.entries(filters).filter(([, v]) => v);
    for (let i = 0; i < active.length; i++) {
        const [field] = active[i];
        const isLast = i === active.length - 1 && !orderByField;
        lines.push(`  "--field-config=field-path=${field},order=ascending"${isLast ? '' : ' `'}`);
    }
    if (orderByField) {
        lines.push(`  "--field-config=field-path=${orderByField},order=${dir(orderDir)}"`);
    }
    return lines.join('\n');
}

// ─── Inline styles (works reliably with Tailwind v4 + light theme) ──────────

const S = {
    page: { padding: 24, maxWidth: '100%' } as React.CSSProperties,
    title: { fontSize: 20, fontWeight: 700, color: '#111827' } as React.CSSProperties,

    // Panels
    panel: {
        background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: 16, marginBottom: 16,
    } as React.CSSProperties,
    panelDark: {
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: 16, marginBottom: 16,
    } as React.CSSProperties,

    // Form elements
    label: { display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 500 } as React.CSSProperties,
    select: {
        background: '#ffffff', border: '1px solid #d1d5db', color: '#1f2937',
        borderRadius: 8, padding: '6px 12px', fontSize: 13, outline: 'none',
        minWidth: 120, cursor: 'pointer',
    } as React.CSSProperties,
    input: {
        background: '#ffffff', border: '1px solid #d1d5db', color: '#1f2937',
        borderRadius: 8, padding: '6px 12px', fontSize: 13, outline: 'none', width: 120,
    } as React.CSSProperties,

    // Buttons
    btnPrimary: {
        padding: '6px 20px', borderRadius: 8, background: '#2563eb', color: '#fff',
        fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
    } as React.CSSProperties,
    btnOutline: {
        padding: '6px 12px', borderRadius: 8, background: '#fff', color: '#6b7280',
        fontSize: 13, border: '1px solid #d1d5db', cursor: 'pointer',
    } as React.CSSProperties,
    btnBench: {
        padding: '8px 16px', borderRadius: 8, background: '#7c3aed', color: '#fff',
        fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
    } as React.CSSProperties,

    // Table
    tableWrap: {
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden',
    } as React.CSSProperties,
    th: {
        padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#6b7280',
        textAlign: 'left' as const, background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
        whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    td: {
        padding: '8px 12px', fontSize: 12, color: '#374151',
        borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    tdMono: {
        padding: '8px 12px', fontSize: 12, color: '#6b7280', fontFamily: 'monospace',
        borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    tdRight: {
        padding: '8px 12px', fontSize: 12, color: '#374151', fontFamily: 'monospace',
        borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' as const, textAlign: 'right' as const,
    } as React.CSSProperties,

    // Pagination
    paginationBar: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#f9fafb',
    } as React.CSSProperties,
    pageBtn: {
        padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db',
        background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer',
    } as React.CSSProperties,
    pageBtnDisabled: {
        padding: '4px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
        background: '#f9fafb', color: '#d1d5db', fontSize: 12, cursor: 'not-allowed',
    } as React.CSSProperties,
};

// ─── MultiSelect Combobox ─────────────────────────────────────────────────────

interface MultiSelectItem {
    id: string;
    label: string;
    sublabel?: string;
}

function MultiSelectCombobox({
    items,
    selectedIds,
    onChange,
    placeholder = 'Pesquisar...',
    label,
}: {
    items: MultiSelectItem[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    placeholder?: string;
    label: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = items.filter(i =>
        i.label.toLowerCase().includes(search.toLowerCase()) ||
        (i.sublabel && i.sublabel.toLowerCase().includes(search.toLowerCase()))
    );

    const toggle = (id: string) => {
        onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    };

    const selectAll = () => onChange(items.map(i => i.id));
    const clearAll = () => onChange([]);

    return (
        <div ref={ref} style={{ position: 'relative', minWidth: 280 }}>
            <label style={S.label}>{label}</label>
            <div
                onClick={() => setOpen(!open)}
                style={{
                    ...S.select, display: 'flex', flexWrap: 'wrap', gap: 4,
                    minHeight: 34, alignItems: 'center', paddingRight: 28,
                    position: 'relative', cursor: 'pointer',
                }}
            >
                {selectedIds.length === 0 && (
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>Selecione...</span>
                )}
                {selectedIds.length > 0 && selectedIds.length <= 3 && selectedIds.map(id => {
                    const item = items.find(i => i.id === id);
                    return (
                        <span key={id} style={{
                            background: '#dbeafe', color: '#1d4ed8', fontSize: 11, padding: '1px 8px',
                            borderRadius: 4, display: 'inline-flex', gap: 4, alignItems: 'center',
                        }}>
                            {item?.label?.slice(0, 20) || id.slice(0, 8)}
                            <span
                                onClick={(e) => { e.stopPropagation(); toggle(id); }}
                                style={{ cursor: 'pointer', fontWeight: 700, fontSize: 10, lineHeight: 1 }}
                            >✕</span>
                        </span>
                    );
                })}
                {selectedIds.length > 3 && (
                    <span style={{
                        background: '#dbeafe', color: '#1d4ed8', fontSize: 11,
                        padding: '1px 8px', borderRadius: 4,
                    }}>
                        {selectedIds.length} selecionados
                    </span>
                )}
                <span style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 10, color: '#9ca3af', pointerEvents: 'none',
                }}>▼</span>
            </div>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: '#fff', border: '1px solid #d1d5db', borderRadius: 8,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)', marginTop: 4,
                    maxHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
                        <input
                            autoFocus
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={placeholder}
                            style={{
                                ...S.input, width: '100%', boxSizing: 'border-box',
                                background: '#f9fafb',
                            }}
                        />
                    </div>

                    <div style={{
                        display: 'flex', gap: 8, padding: '6px 10px', borderBottom: '1px solid #f3f4f6',
                    }}>
                        <button onClick={selectAll} style={{
                            background: 'none', border: 'none', color: '#2563eb',
                            fontSize: 11, cursor: 'pointer', fontWeight: 500,
                        }}>Selecionar todos</button>
                        <button onClick={clearAll} style={{
                            background: 'none', border: 'none', color: '#ef4444',
                            fontSize: 11, cursor: 'pointer', fontWeight: 500,
                        }}>Limpar</button>
                    </div>

                    <div style={{ overflowY: 'auto', maxHeight: 240 }}>
                        {filtered.length === 0 && (
                            <div style={{ padding: 12, color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>
                                Nenhum resultado
                            </div>
                        )}
                        {filtered.map(item => (
                            <label
                                key={item.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                                    cursor: 'pointer', fontSize: 12,
                                    background: selectedIds.includes(item.id) ? '#eff6ff' : 'transparent',
                                }}
                                onMouseEnter={e => {
                                    if (!selectedIds.includes(item.id)) (e.currentTarget.style.background = '#f9fafb');
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = selectedIds.includes(item.id) ? '#eff6ff' : 'transparent';
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(item.id)}
                                    onChange={() => toggle(item.id)}
                                    style={{ accentColor: '#2563eb', width: 14, height: 14 }}
                                />
                                <div>
                                    <div style={{ color: '#1f2937', fontWeight: 500 }}>{item.label}</div>
                                    {item.sublabel && (
                                        <div style={{ color: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }}>
                                            {item.sublabel}
                                        </div>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
    return (
        <span style={{
            display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 4,
            fontWeight: 600, background: bg, color: fg,
        }}>
            {children}
        </span>
    );
}

function LatencyBadge({ ms, label }: { ms: number; label: string }) {
    const color = ms < 100 ? '#16a34a' : ms < 400 ? '#ca8a04' : '#dc2626';
    return (
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
            {label}: <span style={{ fontFamily: 'monospace', fontWeight: 600, color }}>{fmtMs(ms)}ms</span>
        </span>
    );
}

const COUNT_SOURCE_LABELS: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
    aggregation: { label: 'Aggregation', bg: '#fef3c7', fg: '#92400e', icon: '🔥' },
    counters: { label: 'Counters', bg: '#d1fae5', fg: '#065f46', icon: '⚡' },
    skipped: { label: 'Cached', bg: '#e0e7ff', fg: '#3730a3', icon: '💨' },
    counters_fallback_aggregation: { label: 'Fallback (agg)', bg: '#ffedd5', fg: '#9a3412', icon: '⚠️' },
};

function CountSourceBadge({ source }: { source: string }) {
    const info = COUNT_SOURCE_LABELS[source] ?? { label: source, bg: '#f3f4f6', fg: '#6b7280', icon: '?' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            fontWeight: 600, background: info.bg, color: info.fg,
        }}>
            {info.icon} {info.label}
        </span>
    );
}

function IndexAlert({
    error,
    filters,
    orderBy,
    orderDir,
    onDismiss,
}: {
    error: DocumentListError;
    filters: Record<string, string>;
    orderBy: string;
    orderDir: 'asc' | 'desc';
    onDismiss: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const cmd = buildGcloudCommand(activeFilters, orderBy, orderDir);
    const needsIndex = Object.keys(activeFilters).length > 0 || !!orderBy;

    const copy = () => {
        navigator.clipboard.writeText(cmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{
            border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 12,
            padding: 16, marginBottom: 16,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#92400e', margin: 0 }}>
                            Índice Composto Necessário
                        </p>
                        <p style={{ fontSize: 12, color: '#a16207', margin: '4px 0 0' }}>
                            Esta combinação de {Object.keys(activeFilters).length > 0 ? 'filtros' : ''}
                            {Object.keys(activeFilters).length > 0 && orderBy ? ' + ' : ''}
                            {orderBy ? 'ordenação' : ''} exige um índice composto no Firestore.
                        </p>
                    </div>
                </div>
                <button onClick={onDismiss} style={{
                    background: 'none', border: 'none', color: '#d97706', fontSize: 18,
                    cursor: 'pointer', lineHeight: 1,
                }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
                {Object.entries(activeFilters).map(([k, v]) => (
                    <span key={k} style={{
                        padding: '2px 8px', borderRadius: 4, background: '#fef3c7',
                        color: '#92400e', fontSize: 11, fontFamily: 'monospace',
                    }}>{k}={v}</span>
                ))}
                {orderBy && (
                    <span style={{
                        padding: '2px 8px', borderRadius: 4, background: '#dbeafe',
                        color: '#1d4ed8', fontSize: 11, fontFamily: 'monospace',
                    }}>
                        ORDER BY {orderBy} {orderDir.toUpperCase()}
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {error.indexCreationUrl && (
                    <a href={error.indexCreationUrl} target="_blank" rel="noreferrer" style={{
                        padding: '6px 14px', borderRadius: 6, background: '#2563eb', color: '#fff',
                        fontSize: 12, fontWeight: 500, textDecoration: 'none',
                    }}>
                        Criar índice no Console GCP ↗
                    </a>
                )}
            </div>

            {needsIndex && (
                <div>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
                    }}>
                        <span style={{ fontSize: 11, color: '#78716c', fontWeight: 500 }}>
                            Comando gcloud (PowerShell):
                        </span>
                        <button onClick={copy} style={{
                            fontSize: 11, padding: '2px 10px', borderRadius: 4,
                            background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', cursor: 'pointer',
                        }}>
                            {copied ? '✓ Copiado' : 'Copiar'}
                        </button>
                    </div>
                    <pre style={{
                        fontSize: 11, fontFamily: 'monospace', background: '#1f2937', color: '#86efac',
                        padding: 12, borderRadius: 8, overflowX: 'auto', margin: 0,
                    }}>
                        {cmd}
                    </pre>
                </div>
            )}
        </div>
    );
}

function BenchmarkSection({ result }: { result: CountPaginationResult }) {
    const byType = (t: string) => result.scenarios.filter(s => s.type === t);
    const ScenarioTable = ({ title, scenarios }: { title: string; scenarios: CountPaginationScenario[] }) => (
        <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {title}
            </h4>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {['Cenário', 'Filtros', 'Avg', 'Min', 'Max', 'Total / Docs', 'Status'].map(h => (
                                <th key={h} style={{ ...S.th, fontSize: 11 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {scenarios.map(s => {
                            const ms = (n: number) => {
                                const c = n < 100 ? '#16a34a' : n < 400 ? '#ca8a04' : '#dc2626';
                                return <span style={{ fontFamily: 'monospace', color: c }}>{n.toFixed(1)}ms</span>;
                            };
                            return (
                                <tr key={s.name}>
                                    <td style={S.tdMono}>{s.name}</td>
                                    <td style={{ ...S.td, color: '#9ca3af' }}>
                                        {Object.entries(s.filters).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}
                                    </td>
                                    <td style={S.td}>{s.status === 'success' ? ms(s.avgLatencyMs) : '—'}</td>
                                    <td style={S.td}>{s.status === 'success' ? ms(s.minLatencyMs) : '—'}</td>
                                    <td style={S.td}>{s.status === 'success' ? ms(s.maxLatencyMs) : '—'}</td>
                                    <td style={S.tdMono}>
                                        {s.total !== null ? s.total.toLocaleString() : ''}
                                        {s.docsReturned !== null ? ` / ${s.docsReturned}` : ''}
                                    </td>
                                    <td style={S.td}>
                                        {s.status === 'success' && (
                                            <span style={{ padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontSize: 11 }}>✓ ok</span>
                                        )}
                                        {s.status === 'index_required' && (
                                            <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontSize: 11 }}>
                                                ⚠ index
                                                {s.indexCreationUrl && <a href={s.indexCreationUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: '#2563eb' }}> ↗</a>}
                                            </span>
                                        )}
                                        {s.status === 'error' && (
                                            <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11 }}>✗ erro</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div style={{ ...S.panel, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>Benchmark: Count + Paginação</h3>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9ca3af' }}>
                    <span>{result.collectionSize.toLocaleString()} docs</span>
                    <span>{result.iterations} iterações</span>
                    <span>page={result.pageSize}</span>
                    <span style={{ color: result.mode === 'gcp' ? '#16a34a' : '#ca8a04' }}>● {result.mode}</span>
                </div>
            </div>
            <ScenarioTable title="count() — total de resultados" scenarios={byType('count')} />
            <ScenarioTable title="list() — primeira página" scenarios={byType('list')} />
            <ScenarioTable title="count + list em paralelo (custo real da UI)" scenarios={byType('count+list')} />
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Filters {
    tipo: string;
    situacao: string;
    emitUf: string;
    papel: string;
    statusManifestacao: string;
    temXmlCompleto: string;
    temPdf: string;
    finalidade: string;
    cfopPrincipal: string;
    yearMonth: string;
}

const EMPTY_FILTERS: Filters = {
    tipo: '', situacao: '', emitUf: '', papel: '',
    statusManifestacao: '', temXmlCompleto: '', temPdf: '',
    finalidade: '', cfopPrincipal: '', yearMonth: '',
};

export default function DocumentGrid() {
    const [tenants, setTenants] = useState<TenantInfo[]>([]);
    const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [orderBy, setOrderBy] = useState('');
    const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(0);
    const [countMode, setCountMode] = useState<'aggregation' | 'counters'>('aggregation');

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DocumentListResponse | null>(null);
    const [queryError, setQueryError] = useState<DocumentListError | null>(null);
    const [errorContext, setErrorContext] = useState<{ filters: Record<string, string>; orderBy: string; orderDir: 'asc' | 'desc' } | null>(null);

    const [benchRunId, setBenchRunId] = useState<string | null>(null);
    const [benchRunning, setBenchRunning] = useState(false);
    const [benchResult, setBenchResult] = useState<CountPaginationResult | null>(null);

    // Backfill state
    const [backfillRunning, setBackfillRunning] = useState(false);
    const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);

    // Load tenants on mount
    useEffect(() => {
        getDocumentTenants()
            .then((ts) => {
                setTenants(ts);
                if (ts.length > 0) setSelectedTenantIds([ts[0].id]);
            })
            .catch(() => { });
    }, []);

    // Build tenant combobox items
    const tenantItems: MultiSelectItem[] = tenants.map(t => ({
        id: t.id,
        label: t.tradeName || t.name || t.id.slice(0, 8),
        sublabel: t.cnpjs.length > 0
            ? t.cnpjs.map(c => fmtCnpj(c.cnpj)).join(', ')
            : t.id.slice(0, 16) + '...',
    }));

    const fetchDocs = useCallback(async (pg: number, skipCountQuery = false) => {
        if (selectedTenantIds.length === 0) return;
        setLoading(true);
        setQueryError(null);
        setErrorContext(null);
        try {
            const params: any = {
                tenantId: selectedTenantIds.join(','),
                limit: PAGE_SIZE,
                page: pg,
                countMode,
            };
            if (orderBy) { params.orderBy = orderBy; params.orderDir = orderDir; }
            for (const [k, v] of Object.entries(filters)) {
                if (v) params[k] = v;
            }
            // Skip count on pagination (reuse known total)
            if (skipCountQuery && data?.total) {
                params.skipCount = 'true';
                params.knownTotal = String(data.total);
            }
            const res = await listDocuments(params);
            setData(res);
            setPage(pg);
        } catch (e: any) {
            const body = e.response?.data ?? { error: 'query_error', message: e.message };
            setQueryError(body);
            const activeFilters: Record<string, string> = {};
            for (const [k, v] of Object.entries(filters)) { if (v) activeFilters[k] = v; }
            setErrorContext({ filters: activeFilters, orderBy, orderDir });
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [selectedTenantIds, filters, orderBy, orderDir, data?.total, countMode]);

    // Benchmark polling
    useEffect(() => {
        if (!benchRunId || !benchRunning) return;
        const interval = setInterval(async () => {
            try {
                const r = await getCountPaginationResult(benchRunId);
                if (r.status === 'completed') { clearInterval(interval); setBenchRunning(false); if (r.result) setBenchResult(r.result); }
                else if (r.status === 'failed') { clearInterval(interval); setBenchRunning(false); }
            } catch { clearInterval(interval); setBenchRunning(false); }
        }, 1500);
        return () => clearInterval(interval);
    }, [benchRunId, benchRunning]);

    const handleBenchmark = async () => {
        setBenchRunning(true); setBenchResult(null);
        try {
            const { runId } = await runCountPaginationBenchmark({ iterations: 3, pageSize: PAGE_SIZE });
            setBenchRunId(runId);
        } catch { setBenchRunning(false); }
    };

    // Backfill handlers
    const handleBackfill = async () => {
        setBackfillRunning(true);
        setBackfillProgress(null);
        try {
            await startBackfill();
            // Poll for progress
            const poll = setInterval(async () => {
                try {
                    const p = await fetchBackfillProgress();
                    setBackfillProgress(p);
                    if (p.status === 'completed' || p.status === 'error') {
                        clearInterval(poll);
                        setBackfillRunning(false);
                    }
                } catch { clearInterval(poll); setBackfillRunning(false); }
            }, 1000);
        } catch { setBackfillRunning(false); }
    };

    const setFilter = (k: keyof Filters) => (v: string) => setFilters(f => ({ ...f, [k]: v }));
    const hasFilters = Object.values(filters).some(Boolean);
    const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

    const SelectFilter = ({ label, field, options }: { label: string; field: keyof Filters; options: { value: string; label: string }[] }) => (
        <div>
            <label style={S.label}>{label}</label>
            <select value={filters[field]} onChange={e => setFilter(field)(e.target.value)} style={S.select}>
                <option value="">Todos</option>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );

    // ─── Table headers ───────────────────────────────────────────
    const TABLE_HEADERS = [
        'Tipo', 'Situação', 'UF', 'Emitente', 'CNPJ Emit', 'CNPJ Dest',
        'Valor Total', 'Valor Prod', 'Data Emissão', 'Data Coleta', 'Papel',
        'Manifestação', 'XML', 'PDF', 'Final.', 'CFOP', 'Nº', 'Chave',
    ];

    return (
        <div style={S.page}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <h2 style={S.title}>Document Grid</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={handleBackfill} disabled={backfillRunning} style={{
                        padding: '8px 16px', borderRadius: 8, background: '#059669', color: '#fff',
                        fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
                        opacity: backfillRunning ? 0.5 : 1,
                    }}>
                        {backfillRunning ? '⏳ Backfill...' : '🔄 Rebuild Counters'}
                    </button>
                    <button onClick={handleBenchmark} disabled={benchRunning} style={{
                        ...S.btnBench,
                        opacity: benchRunning ? 0.5 : 1,
                    }}>
                        {benchRunning ? '⏳ Executando...' : '⚡ Benchmark Count + Paginação'}
                    </button>
                </div>
            </div>

            {/* Backfill progress */}
            {backfillProgress && backfillProgress.status !== 'idle' && (
                <div style={{
                    ...S.panel, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
                    background: backfillProgress.status === 'completed' ? '#f0fdf4' :
                        backfillProgress.status === 'error' ? '#fef2f2' : '#eff6ff',
                    border: `1px solid ${backfillProgress.status === 'completed' ? '#bbf7d0' :
                        backfillProgress.status === 'error' ? '#fca5a5' : '#bfdbfe'}`,
                }}>
                    <span style={{ fontSize: 16 }}>
                        {backfillProgress.status === 'running' ? '⏳' :
                            backfillProgress.status === 'completed' ? '✅' : '❌'}
                    </span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{backfillProgress.phase}</div>
                        {backfillProgress.status === 'running' && backfillProgress.total > 0 && (
                            <div style={{
                                marginTop: 4, height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%', borderRadius: 2, background: '#2563eb',
                                    width: `${Math.min(100, (backfillProgress.processed / backfillProgress.total) * 100)}%`,
                                    transition: 'width 0.3s',
                                }} />
                            </div>
                        )}
                    </div>
                    {backfillProgress.durationMs && (
                        <span style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                            {(backfillProgress.durationMs / 1000).toFixed(1)}s
                        </span>
                    )}
                    <button onClick={() => setBackfillProgress(null)} style={{
                        background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14,
                    }}>✕</button>
                </div>
            )}

            {/* Filters */}
            <div style={S.panel}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>

                    {/* Multi-select tenant */}
                    <MultiSelectCombobox
                        label="Tenant / CNPJ"
                        items={tenantItems}
                        selectedIds={selectedTenantIds}
                        onChange={setSelectedTenantIds}
                        placeholder="Buscar tenant ou CNPJ..."
                    />

                    <SelectFilter label="Tipo" field="tipo" options={[
                        { value: 'nfe', label: 'NF-e' }, { value: 'cte', label: 'CT-e' },
                        { value: 'nfse', label: 'NFS-e' }, { value: 'cteos', label: 'CT-e OS' },
                    ]} />
                    <SelectFilter label="Situação" field="situacao" options={[
                        { value: 'autorizada', label: 'Autorizada' },
                        { value: 'cancelada', label: 'Cancelada' },
                        { value: 'denegada', label: 'Denegada' },
                    ]} />
                    <SelectFilter label="UF Emitente" field="emitUf"
                        options={UF_LIST.map(v => ({ value: v, label: v }))} />
                    <SelectFilter label="Papel" field="papel" options={[
                        { value: 'destinatario', label: 'Destinatário' },
                        { value: 'emitente', label: 'Emitente' },
                        { value: 'terceiro', label: 'Terceiro' },
                    ]} />
                    <SelectFilter label="Manifestação" field="statusManifestacao" options={[
                        { value: 'ciencia', label: 'Ciência' },
                        { value: 'confirmada', label: 'Confirmada' },
                        { value: 'desconhecida', label: 'Desconhecida' },
                        { value: 'nao_realizada', label: 'Não Realizada' },
                        { value: 'pendente', label: 'Pendente' },
                    ]} />
                    <SelectFilter label="Tem XML" field="temXmlCompleto" options={[
                        { value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' },
                    ]} />
                    <SelectFilter label="Tem PDF" field="temPdf" options={[
                        { value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' },
                    ]} />
                    <SelectFilter label="Finalidade" field="finalidade" options={[
                        { value: '1', label: '1 – Normal' }, { value: '2', label: '2 – Complementar' },
                        { value: '3', label: '3 – Ajuste' }, { value: '4', label: '4 – Devolução' },
                    ]} />
                    <div>
                        <label style={S.label}>Ano-Mês</label>
                        <input
                            type="text" placeholder="ex: 2025-03"
                            value={filters.yearMonth}
                            onChange={e => setFilter('yearMonth')(e.target.value)}
                            style={S.input}
                        />
                    </div>
                </div>

                {/* Ordering row */}
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
                    borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 12,
                }}>
                    <div>
                        <label style={S.label}>Ordenar por</label>
                        <select value={orderBy} onChange={e => setOrderBy(e.target.value)} style={S.select}>
                            {SORT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                    </div>

                    {orderBy && (
                        <div>
                            <label style={S.label}>Direção</label>
                            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' }}>
                                <button onClick={() => setOrderDir('desc')} style={{
                                    padding: '6px 12px', fontSize: 13, border: 'none', cursor: 'pointer',
                                    background: orderDir === 'desc' ? '#2563eb' : '#fff',
                                    color: orderDir === 'desc' ? '#fff' : '#6b7280',
                                }}>↓ DESC</button>
                                <button onClick={() => setOrderDir('asc')} style={{
                                    padding: '6px 12px', fontSize: 13, border: 'none', cursor: 'pointer',
                                    borderLeft: '1px solid #d1d5db',
                                    background: orderDir === 'asc' ? '#2563eb' : '#fff',
                                    color: orderDir === 'asc' ? '#fff' : '#6b7280',
                                }}>↑ ASC</button>
                            </div>
                        </div>
                    )}

                    {/* Count mode toggle */}
                    <div>
                        <label style={S.label}>Modo count</label>
                        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' }}>
                            <button onClick={() => setCountMode('aggregation')} style={{
                                padding: '6px 10px', fontSize: 12, border: 'none', cursor: 'pointer',
                                background: countMode === 'aggregation' ? '#f59e0b' : '#fff',
                                color: countMode === 'aggregation' ? '#fff' : '#6b7280',
                                fontWeight: 500,
                            }}>🔥 Aggregation</button>
                            <button onClick={() => setCountMode('counters')} style={{
                                padding: '6px 10px', fontSize: 12, border: 'none', cursor: 'pointer',
                                borderLeft: '1px solid #d1d5db',
                                background: countMode === 'counters' ? '#059669' : '#fff',
                                color: countMode === 'counters' ? '#fff' : '#6b7280',
                                fontWeight: 500,
                            }}>⚡ Counters</button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                        {hasFilters && (
                            <button onClick={() => { setFilters(EMPTY_FILTERS); setOrderBy(''); setData(null); setQueryError(null); }} style={S.btnOutline}>
                                Limpar filtros
                            </button>
                        )}
                        <button
                            onClick={() => fetchDocs(0)}
                            disabled={loading || selectedTenantIds.length === 0}
                            style={{ ...S.btnPrimary, opacity: (loading || selectedTenantIds.length === 0) ? 0.5 : 1 }}
                        >
                            {loading ? '⏳ Buscando...' : '🔍 Filtrar'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Index alert */}
            {queryError && queryError.error === 'index_required' && errorContext && (
                <IndexAlert
                    error={queryError}
                    filters={errorContext.filters}
                    orderBy={errorContext.orderBy}
                    orderDir={errorContext.orderDir}
                    onDismiss={() => { setQueryError(null); setErrorContext(null); }}
                />
            )}

            {/* Generic error */}
            {queryError && queryError.error !== 'index_required' && (
                <div style={{
                    border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 12,
                    padding: 12, color: '#991b1b', fontSize: 13, marginBottom: 16,
                }}>
                    <strong>✗ Erro na query:</strong> {queryError.message}
                </div>
            )}

            {/* Stats bar */}
            {data && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span style={{ fontSize: 14, color: '#374151' }}>
                        <strong style={{ fontSize: 16, color: '#111827' }}>{data.total.toLocaleString()}</strong>
                        <span style={{ color: '#9ca3af', marginLeft: 4 }}>resultados</span>
                    </span>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <LatencyBadge ms={data.countLatencyMs} label="count" />
                        <LatencyBadge ms={data.listLatencyMs} label="list" />
                        {/* Count source badge */}
                        <CountSourceBadge source={data.countSource} />
                    </div>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>
                        pág. {data.page + 1} de {totalPages || 1}
                        {data.orderBy && (
                            <span style={{ marginLeft: 8, color: '#2563eb' }}>
                                ORDER BY {data.orderBy} {data.orderDir.toUpperCase()}
                            </span>
                        )}
                    </span>
                </div>
            )}

            {/* Table */}
            {data && data.docs.length > 0 && (
                <div style={S.tableWrap}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {TABLE_HEADERS.map(h => <th key={h} style={S.th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {data.docs.map((doc, i) => {
                                    const rowBg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
                                    const sColors = SITUACAO_COLORS[doc.situacao] ?? { bg: '#f3f4f6', fg: '#6b7280' };
                                    const mColors = doc.statusManifestacao ? (MANIFESTACAO_COLORS[doc.statusManifestacao] ?? { bg: '#f3f4f6', fg: '#6b7280' }) : null;

                                    return (
                                        <tr key={doc.id} style={{ background: rowBg }}>
                                            <td style={S.td}>
                                                <Badge bg={TIPO_BG[doc.tipo] ?? '#f3f4f6'} fg={TIPO_COLORS[doc.tipo] ?? '#6b7280'}>
                                                    {doc.tipo.toUpperCase()}
                                                </Badge>
                                            </td>
                                            <td style={S.td}>
                                                <Badge bg={sColors.bg} fg={sColors.fg}>{doc.situacao}</Badge>
                                            </td>
                                            <td style={{ ...S.td, fontWeight: 600, fontFamily: 'monospace' }}>{doc.emitUf}</td>
                                            <td style={{ ...S.td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.emitNome}>
                                                {doc.emitFantasia || doc.emitNome}
                                            </td>
                                            <td style={S.tdMono}>{fmtCnpj(doc.emitCnpj)}</td>
                                            <td style={S.tdMono}>{fmtCnpj(doc.cnpjDestinatario)}</td>
                                            <td style={S.tdRight}>{fmtCurrency(doc.valorTotal)}</td>
                                            <td style={{ ...S.tdRight, color: '#9ca3af' }}>{fmtCurrency(doc.valorProdutos)}</td>
                                            <td style={S.td}>{fmtDate(doc.dataEmissao)}</td>
                                            <td style={{ ...S.td, color: '#9ca3af' }}>{fmtDate(doc.dataColeta)}</td>
                                            <td style={S.td}>{doc.papel}</td>
                                            <td style={S.td}>
                                                {mColors
                                                    ? <Badge bg={mColors.bg} fg={mColors.fg}>{doc.statusManifestacao}</Badge>
                                                    : <span style={{ color: '#d1d5db' }}>—</span>
                                                }
                                            </td>
                                            <td style={{ ...S.td, textAlign: 'center' }}>
                                                {doc.temXmlCompleto
                                                    ? <span style={{ color: '#16a34a' }} title="XML disponível">✓</span>
                                                    : <span style={{ color: '#d1d5db' }}>—</span>}
                                            </td>
                                            <td style={{ ...S.td, textAlign: 'center' }}>
                                                {doc.temPdf
                                                    ? <span style={{ color: '#2563eb' }} title="PDF disponível">✓</span>
                                                    : <span style={{ color: '#d1d5db' }}>—</span>}
                                            </td>
                                            <td style={S.tdMono}>{doc.finalidade}</td>
                                            <td style={S.tdMono}>{doc.cfopPrincipal}</td>
                                            <td style={S.tdMono}>{doc.numero}</td>
                                            <td style={{ ...S.tdMono, color: '#9ca3af', fontSize: 11 }}>{doc.chaveAcesso?.slice(0, 16)}…</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div style={S.paginationBar}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} de {data.total.toLocaleString()} resultados
                        </span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button onClick={() => fetchDocs(0, true)} disabled={page === 0 || loading}
                                style={page === 0 || loading ? S.pageBtnDisabled : S.pageBtn}>«</button>
                            <button onClick={() => fetchDocs(page - 1, true)} disabled={page === 0 || loading}
                                style={page === 0 || loading ? S.pageBtnDisabled : S.pageBtn}>‹ Anterior</button>
                            <span style={{ padding: '0 12px', fontSize: 12, color: '#6b7280' }}>
                                Pág. <strong style={{ color: '#111827' }}>{page + 1}</strong> / {totalPages}
                            </span>
                            <button onClick={() => fetchDocs(page + 1, true)} disabled={!data.hasMore || loading}
                                style={!data.hasMore || loading ? S.pageBtnDisabled : S.pageBtn}>Próxima ›</button>
                            <button onClick={() => fetchDocs(totalPages - 1, true)} disabled={!data.hasMore || loading}
                                style={!data.hasMore || loading ? S.pageBtnDisabled : S.pageBtn}>»</button>
                        </div>
                    </div>
                </div>
            )}

            {data && data.docs.length === 0 && !loading && (
                <div style={{
                    textAlign: 'center', color: '#9ca3af', padding: '64px 0', fontSize: 13,
                    border: '1px solid #e5e7eb', borderRadius: 12, background: '#f9fafb',
                }}>
                    Nenhum documento encontrado com esses filtros.
                </div>
            )}

            {!data && !queryError && !loading && (
                <div style={{
                    textAlign: 'center', color: '#9ca3af', padding: '64px 0', fontSize: 13,
                    border: '1px solid #e5e7eb', borderRadius: 12, background: '#f9fafb',
                }}>
                    Selecione um ou mais tenants e clique em <strong style={{ color: '#374151' }}>🔍 Filtrar</strong> para ver os documentos.
                </div>
            )}

            {/* Benchmark results */}
            {benchResult && <BenchmarkSection result={benchResult} />}
        </div>
    );
}
