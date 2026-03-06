import { Router } from 'express';
import { seedData, clearData, getDataStatus, getProgress, onProgress } from '../services/seed.service';

export const seedRoutes = Router();

seedRoutes.post('/generate', async (req, res) => {
  try {
    const { volume } = req.body;
    if (!volume) {
      return res.status(400).json({ error: 'volume is required (1k, 10k, 50k, 100k, 250k, 500k, 1m, 2m, 5m)' });
    }

    // Start seeding in background
    seedData(volume).catch((err) => {
      console.error('Seeding error:', err);
    });

    res.json({ message: `Seeding started for volume: ${volume}`, progress: getProgress() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

seedRoutes.get('/status', async (_req, res) => {
  try {
    const counts = await getDataStatus();
    res.json({ counts, seedProgress: getProgress() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

seedRoutes.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (progress: any) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  // Send current state immediately
  send(getProgress());

  // Subscribe to updates
  const unsubscribe = onProgress(send);

  req.on('close', () => {
    unsubscribe();
  });
});

seedRoutes.delete('/clear', async (_req, res) => {
  try {
    await clearData();
    res.json({ message: 'All data cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
