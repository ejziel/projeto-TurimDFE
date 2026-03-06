import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/seed', label: 'Dados (Seed)' },
  { to: '/benchmarks', label: 'Benchmarks' },
  { to: '/results', label: 'Resultados' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">TurimDFE</h1>
        <p className="text-sm text-gray-400">Benchmark Firestore</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm ${
                isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
        <p>Emulator: localhost:8080</p>
        <p>UI: localhost:4000</p>
      </div>
    </aside>
  );
}
