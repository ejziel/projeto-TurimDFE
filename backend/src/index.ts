import express from 'express';
import cors from 'cors';
import { healthRoutes } from './routes/health.routes';
import { seedRoutes } from './routes/seed.routes';
import { benchmarkRoutes } from './routes/benchmark.routes';
import { validationRoutes } from './routes/validation.routes';
import { documentRoutes } from './routes/documents.routes';
import { counterRoutes } from './routes/counter.routes';
import { gcpMode } from './config/firebase';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/benchmarks', benchmarkRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/counters', counterRoutes);

app.listen(PORT, () => {
    console.log(`TurimDFE Benchmark Backend running on port ${PORT}`);
    if (gcpMode) {
        console.log(`Mode: GCP (project: ${process.env.FIREBASE_PROJECT_ID || 'turimdfe'})`);
    } else {
        console.log(`Mode: Emulator (${process.env.FIRESTORE_EMULATOR_HOST || 'not configured'})`);
    }
});
