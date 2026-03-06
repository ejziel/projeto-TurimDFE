import { useState, useCallback } from 'react';
import { seedGenerate, clearSeedData, getSeedStatus } from '../api/benchmarkApi';
import { usePolling } from '../hooks/usePolling';
import StatusBadge from './common/StatusBadge';

const VOLUMES = ['1k', '10k', '50k', '100k', '250k', '500k', '1m', '2m', '5m'];

export default function SeedControl() {
  const [message, setMessage] = useState('');

  const fetchStatus = useCallback(() => getSeedStatus(), []);
  const { data: status, refresh } = usePolling(fetchStatus, 2000);

  const progress = status?.seedProgress;
  const isSeeding = progress?.status === 'seeding';

  const handleSeed = async (volume: string) => {
    try {
      await seedGenerate(volume);
      setMessage(`Seeding ${volume} iniciado...`);
      refresh();
    } catch (err: any) {
      setMessage(`Erro: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleClear = async () => {
    try {
      await clearSeedData();
      setMessage('Dados limpos com sucesso!');
      refresh();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    }
  };

  const progressPercent = progress && progress.totalDocs > 0
    ? Math.round(((progress.seededDocs + progress.seededEvents) / (progress.totalDocs + progress.totalEvents)) * 100)
    : 0;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Controle de Dados (Seed)</h2>

      {/* Volume buttons */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-semibold mb-4">Gerar Dados de Teste</h3>
        <div className="flex flex-wrap gap-2">
          {VOLUMES.map((v) => (
            <button
              key={v}
              onClick={() => handleSeed(v)}
              disabled={isSeeding}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={handleClear}
          disabled={isSeeding}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 text-sm"
        >
          Limpar Todos os Dados
        </button>
        {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
      </div>

      {/* Progress */}
      {progress && progress.status !== 'idle' && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Progresso do Seeding</h3>
            <StatusBadge status={progress.status} />
          </div>
          <p className="text-sm text-gray-500 mb-3">{progress.phase}</p>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Documentos: </span>
              <span className="font-mono">{progress.seededDocs.toLocaleString()} / {progress.totalDocs.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Eventos: </span>
              <span className="font-mono">{progress.seededEvents.toLocaleString()} / {progress.totalEvents.toLocaleString()}</span>
            </div>
          </div>
          {progress.error && (
            <p className="mt-2 text-red-600 text-sm">{progress.error}</p>
          )}
        </div>
      )}

      {/* Current data volumes */}
      {status?.counts && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4">Dados Atuais no Emulador</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(status.counts).map(([col, count]) => (
              <div key={col} className="text-center p-3 bg-gray-50 rounded">
                <p className="text-xs text-gray-500 uppercase">{col}</p>
                <p className="text-lg font-bold">{count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
