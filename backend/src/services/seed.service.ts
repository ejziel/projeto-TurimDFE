import { db } from '../config/firebase';
import { SEED_VOLUMES } from '../config/constants';
import { generateTenants, GeneratedTenant } from '../generators/tenant.generator';
import { generateDocumentData } from '../generators/nfe.generator';
import { generateEventsForDocument } from '../generators/event.generator';
import { NSUSequencer, generateNSUControlDoc } from '../generators/nsu.generator';
import { randomInt } from '../generators/helpers';

export interface SeedProgress {
    status: 'idle' | 'seeding' | 'completed' | 'error';
    volume: string;
    totalDocs: number;
    seededDocs: number;
    totalEvents: number;
    seededEvents: number;
    phase: string;
    startedAt?: number;
    completedAt?: number;
    error?: string;
}

let currentProgress: SeedProgress = {
    status: 'idle',
    volume: '',
    totalDocs: 0,
    seededDocs: 0,
    totalEvents: 0,
    seededEvents: 0,
    phase: '',
};

const progressListeners: Set<(progress: SeedProgress) => void> = new Set();

export function getProgress(): SeedProgress {
    return { ...currentProgress };
}

export function onProgress(listener: (progress: SeedProgress) => void): () => void {
    progressListeners.add(listener);
    return () => progressListeners.delete(listener);
}

function updateProgress(update: Partial<SeedProgress>) {
    currentProgress = { ...currentProgress, ...update };
    for (const listener of progressListeners) {
        listener(currentProgress);
    }
}

async function writeBatch(docs: { collection: string; id?: string; data: Record<string, any> }[]): Promise<void> {
    const BATCH_LIMIT = 500;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
        const chunk = docs.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const doc of chunk) {
            const ref = doc.id
                ? db.collection(doc.collection).doc(doc.id)
                : db.collection(doc.collection).doc();
            batch.set(ref, doc.data);
        }
        await batch.commit();
    }
}

export async function seedData(volume: string): Promise<void> {
    const config = SEED_VOLUMES[volume];
    if (!config) throw new Error(`Invalid volume: ${volume}. Valid: ${Object.keys(SEED_VOLUMES).join(', ')}`);

    if (currentProgress.status === 'seeding') {
        throw new Error('Seeding already in progress');
    }

    updateProgress({
        status: 'seeding',
        volume,
        totalDocs: config.docs,
        seededDocs: 0,
        totalEvents: config.events,
        seededEvents: 0,
        phase: 'Generating tenants...',
        startedAt: Date.now(),
        completedAt: undefined,
        error: undefined,
    });

    try {
        // Phase 1: Generate and seed tenants, users, cnpj_registry
        updateProgress({ phase: 'Seeding tenants, users, CNPJ registry...' });
        const tenants = generateTenants(config.tenants, config.cnpjsPerTenant);

        const controlDocs: { collection: string; id?: string; data: Record<string, any> }[] = [];

        for (const tenant of tenants) {
            controlDocs.push({ collection: 'tenants', id: tenant.id, data: tenant.data });
            for (const user of tenant.users) {
                controlDocs.push({ collection: 'users', id: user.id, data: user.data });
            }
            for (const cnpj of tenant.cnpjs) {
                controlDocs.push({
                    collection: 'cnpj_registry',
                    id: cnpj.cnpj,
                    data: {
                        tenantId: cnpj.tenantId,
                        companyName: cnpj.companyName,
                        ie: cnpj.ie,
                        uf: cnpj.uf,
                        isActive: true,
                        collectEnabled: true,
                        createdAt: new Date(),
                    },
                });
            }
        }

        await writeBatch(controlDocs);

        // Phase 2: Seed documents
        updateProgress({ phase: 'Seeding documents...' });
        const nsuSequencer = new NSUSequencer();

        // Build flat list of (tenant, cnpj) pairs for distribution
        const tenantCnpjPairs: { tenant: GeneratedTenant; cnpjIdx: number }[] = [];
        for (const tenant of tenants) {
            for (let c = 0; c < tenant.cnpjs.length; c++) {
                tenantCnpjPairs.push({ tenant, cnpjIdx: c });
            }
        }

        // Para volumes 250K+, reduzir paralelismo para evitar OOM
        const isLargeVolume = config.docs > 200000;
        const PARALLEL_BATCHES = isLargeVolume ? 2 : 5;
        const BATCH_SIZE = 500;
        let docsSeeded = 0;

        // Generate and write in chunks
        for (let i = 0; i < config.docs; i += BATCH_SIZE * PARALLEL_BATCHES) {
            const batchPromises: Promise<void>[] = [];

            for (let b = 0; b < PARALLEL_BATCHES && (i + b * BATCH_SIZE) < config.docs; b++) {
                const start = i + b * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, config.docs);
                const batchDocs: { collection: string; data: Record<string, any> }[] = [];

                for (let j = start; j < end; j++) {
                    const pair = tenantCnpjPairs[j % tenantCnpjPairs.length];
                    const cnpjInfo = pair.tenant.cnpjs[pair.cnpjIdx];
                    const docData = generateDocumentData(pair.tenant.id, cnpjInfo, nsuSequencer, j);
                    batchDocs.push({ collection: 'documents', data: docData });
                }

                batchPromises.push(writeBatch(batchDocs));
            }

            await Promise.all(batchPromises);
            docsSeeded = Math.min(i + BATCH_SIZE * PARALLEL_BATCHES, config.docs);
            updateProgress({ seededDocs: docsSeeded, phase: `Seeding documents... ${docsSeeded}/${config.docs}` });

            // Dar tempo ao GC para limpar buffers gRPC em volumes grandes
            if (isLargeVolume && docsSeeded % 50000 === 0) {
                if ((globalThis as any).gc) (globalThis as any).gc();
                await new Promise<void>(resolve => { (globalThis as any).setTimeout(resolve, 100); });
            }
        }

        // Phase 3: Seed events
        updateProgress({ phase: 'Seeding events...' });
        let eventsSeeded = 0;

        // Get some document IDs to link events to
        const docSnapshots = await db.collection('documents').limit(Math.min(config.docs, 10000)).get();
        const docRefs = docSnapshots.docs.map((d) => ({
            id: d.id,
            tenantId: d.data().tenantId as string,
            chaveAcesso: d.data().chaveAcesso as string,
            dataColeta: (d.data().dataColeta as any).toDate() as Date,
        }));

        for (let i = 0; i < config.events; i += BATCH_SIZE * PARALLEL_BATCHES) {
            const batchPromises: Promise<void>[] = [];

            for (let b = 0; b < PARALLEL_BATCHES && (i + b * BATCH_SIZE) < config.events; b++) {
                const start = i + b * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, config.events);
                const batchEvents: { collection: string; data: Record<string, any> }[] = [];

                for (let j = start; j < end; j++) {
                    const docRef = docRefs[j % docRefs.length];
                    const events = generateEventsForDocument(docRef.tenantId, docRef.chaveAcesso, docRef.id, docRef.dataColeta, 1);
                    batchEvents.push({ collection: 'events', data: events[0] });
                }

                batchPromises.push(writeBatch(batchEvents));
            }

            await Promise.all(batchPromises);
            eventsSeeded = Math.min(i + BATCH_SIZE * PARALLEL_BATCHES, config.events);
            updateProgress({ seededEvents: eventsSeeded, phase: `Seeding events... ${eventsSeeded}/${config.events}` });
        }

        // Phase 4: Seed NSU control
        updateProgress({ phase: 'Seeding NSU control...' });
        const nsuDocs: { collection: string; id: string; data: Record<string, any> }[] = [];
        for (const tenant of tenants) {
            for (const cnpj of tenant.cnpjs) {
                const ultNSU = nsuSequencer.getCurrent(cnpj.cnpj);
                const maxNSU = nsuSequencer.getMax(cnpj.cnpj);
                const totalCollected = parseInt(ultNSU) || 0;
                nsuDocs.push({
                    collection: 'nsu_control',
                    id: `${tenant.id}_${cnpj.cnpj}`,
                    data: generateNSUControlDoc(tenant.id, cnpj.cnpj, ultNSU, maxNSU, totalCollected),
                });
            }
        }
        await writeBatch(nsuDocs);

        updateProgress({
            status: 'completed',
            phase: 'Seeding completed!',
            completedAt: Date.now(),
            seededDocs: config.docs,
            seededEvents: config.events,
        });
    } catch (error: any) {
        updateProgress({
            status: 'error',
            phase: 'Error during seeding',
            error: error.message,
        });
        throw error;
    }
}

export async function clearData(): Promise<void> {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

    if (emulatorHost) {
        // Emulator: use fast REST endpoint
        const projectId = process.env.FIREBASE_PROJECT_ID || 'turimdfe-benchmark';
        const response = await fetch(
            `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
            { method: 'DELETE' },
        );
        if (!response.ok) {
            throw new Error(`Failed to clear data: ${response.statusText}`);
        }
    } else {
        // Real Firebase: delete documents in batches
        const collections = ['documents', 'events', 'counters', 'nsu_control', 'tenants'];
        for (const col of collections) {
            let hasMore = true;
            while (hasMore) {
                const snapshot = await db.collection(col).limit(400).get();
                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
        }
    }

    updateProgress({
        status: 'idle',
        volume: '',
        totalDocs: 0,
        seededDocs: 0,
        totalEvents: 0,
        seededEvents: 0,
        phase: '',
    });
}

export async function getDataStatus(): Promise<Record<string, number>> {
    const collections = ['tenants', 'users', 'cnpj_registry', 'certificates', 'nsu_control', 'documents', 'events'];
    const counts: Record<string, number> = {};

    for (const col of collections) {
        const snapshot = await db.collection(col).count().get();
        counts[col] = snapshot.data().count;
    }

    return counts;
}
