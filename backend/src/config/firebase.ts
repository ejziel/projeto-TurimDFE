import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const gcpMode = process.env.GCP_MODE === 'true';

let app;
if (gcpMode) {
  app = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'turimdfe',
    credential: applicationDefault(),
  });
} else {
  app = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'turimdfe-benchmark',
  });
  // FIRESTORE_EMULATOR_HOST env var is picked up automatically by the SDK
}

const db = getFirestore(app);

export { db, gcpMode };
