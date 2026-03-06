import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import SeedControl from './components/SeedControl';
import BenchmarkRunner from './components/BenchmarkRunner';
import ResultsTable from './components/ResultsTable';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/seed" element={<SeedControl />} />
          <Route path="/benchmarks" element={<BenchmarkRunner />} />
          <Route path="/results" element={<ResultsTable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
