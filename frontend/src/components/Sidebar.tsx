import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getHealth } from '../api/benchmarkApi';
import type { HealthStatus } from '../types/benchmark.types';

const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/seed', label: 'Dados (Seed)' },
    { to: '/benchmarks', label: 'Benchmarks' },
    { to: '/auto', label: '⚡ Benchmark Auto' },
    { to: '/results', label: 'Resultados' },
    { to: '/validation', label: 'Validação', separator: true },
    { to: '/ai-report', label: 'Relatório IA' },
    { to: '/gcp-validation', label: 'GCP Validation' },
    { to: '/documents', label: 'Document Grid' },
] as const;

export default function Sidebar() {
    const [health, setHealth] = useState<HealthStatus | null>(null);

    useEffect(() => {
        getHealth().then(setHealth).catch(() => {});
    }, []);

    const gcpMode = health?.gcpMode ?? false;

    return (
        <aside className="w-64 bg-gray-900 text-white flex flex-col">
            <div className="p-4 border-b border-gray-700">
                <h1 className="text-xl font-bold">TurimDFE</h1>
                <p className="text-sm text-gray-400">Benchmark Firestore</p>
                <div className="mt-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${gcpMode ? 'bg-green-800 text-green-200' : 'bg-yellow-800 text-yellow-200'}`}>
                        {gcpMode ? '● GCP' : '● Emulator'}
                    </span>
                </div>
            </div>
            <nav className="flex-1 p-4 space-y-1">
                {links.map((link) => (
                    <div key={link.to}>
                        {'separator' in link && link.separator && (
                            <div className="pt-4 pb-2 mt-2 border-t border-gray-700">
                                <span className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Análise</span>
                            </div>
                        )}
                        <NavLink
                            to={link.to}
                            className={({ isActive }) =>
                                `block px-3 py-2 rounded text-sm ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
                                }`
                            }
                        >
                            {link.label}
                        </NavLink>
                    </div>
                ))}
            </nav>
            <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
                {gcpMode ? (
                    <p>GCP: {health?.projectId}</p>
                ) : (
                    <>
                        <p>Emulator: localhost:8080</p>
                        <p>UI: localhost:4000</p>
                    </>
                )}
            </div>
        </aside>
    );
}
