interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

export default function MetricCard({ title, value, subtitle, color = 'blue' }: MetricCardProps) {
  const colors: Record<string, string> = {
    blue: 'border-blue-500 bg-blue-50',
    green: 'border-green-500 bg-green-50',
    orange: 'border-orange-500 bg-orange-50',
    purple: 'border-purple-500 bg-purple-50',
    red: 'border-red-500 bg-red-50',
  };

  return (
    <div className={`rounded-lg border-l-4 p-4 shadow-sm bg-white ${colors[color] || colors.blue}`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
