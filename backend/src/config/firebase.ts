import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'turimdfe-benchmark',
});

const db = getFirestore(app);

export { db };
