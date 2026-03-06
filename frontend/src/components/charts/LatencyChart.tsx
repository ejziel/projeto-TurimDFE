import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface LatencyChartProps {
  timings: number[];
  title?: string;
}

export default function LatencyChart({ timings, title }: LatencyChartProps) {
  const data = timings.map((t, i) => ({ index: i + 1, latency: Number(t.toFixed(2)) }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="index" label={{ value: 'Operacao', position: 'insideBottom', offset: -5 }} />
        <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
        <Tooltip formatter={(v: number) => [`${v.toFixed(2)} ms`, 'Latencia']} />
        <Line type="monotone" dataKey="latency" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}
