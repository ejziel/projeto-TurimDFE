import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import SeedControl from './components/SeedControl';
import BenchmarkRunner from './components/BenchmarkRunner';
import ResultsTable from './components/ResultsTable';
import ValidationView from './components/ValidationView';
import AIReport from './components/AIReport';
import AutoBenchmark from './components/AutoBenchmark';
import GcpValidation from './components/GcpValidation';
import DocumentGrid from './components/DocumentGrid';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<Layout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/seed" element={<SeedControl />} />
                    <Route path="/benchmarks" element={<BenchmarkRunner />} />
                    <Route path="/results" element={<ResultsTable />} />
                    <Route path="/validation" element={<ValidationView />} />
                    <Route path="/ai-report" element={<AIReport />} />
                    <Route path="/auto" element={<AutoBenchmark />} />
                    <Route path="/gcp-validation" element={<GcpValidation />} />
                    <Route path="/documents" element={<DocumentGrid />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
