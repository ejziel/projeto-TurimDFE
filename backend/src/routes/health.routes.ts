import { Router } from 'express';
import { db, gcpMode } from '../config/firebase';

export const healthRoutes = Router();

healthRoutes.get('/', async (_req, res) => {
  try {
    // Quick Firestore connectivity check
    await db.collection('_health').doc('check').set({ ts: Date.now() });
    await db.collection('_health').doc('check').delete();

    res.json({
      status: 'ok',
      firestore: 'connected',
      gcpMode,
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST || 'not set',
      projectId: process.env.FIREBASE_PROJECT_ID || 'not set',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      firestore: 'disconnected',
      error: error.message,
    });
  }
});
