import express from 'express';
import cors from 'cors';
import { healthRoutes } from './routes/health.routes';
import { seedRoutes } from './routes/seed.routes';
import { benchmarkRoutes } from './routes/benchmark.routes';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/benchmarks', benchmarkRoutes);

app.listen(PORT, () => {
  console.log(`TurimDFE Benchmark Backend running on port ${PORT}`);
  console.log(`Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST || 'not configured'}`);
});
