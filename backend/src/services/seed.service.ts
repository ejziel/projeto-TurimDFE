import { db } from '../config/firebase';
import { SEED_VOLUMES, GCP_SEED_VOLUMES } from '../config/constants';
import { generateTenants, GeneratedTenant } from '../generators/tenant.generator';
import { generateDocumentData } from '../generators/nfe.generator';
import { generateEventsForDocument } from '../generators/event.generator';
import { NSUSequencer, generateNSUControlDoc } from '../generators/nsu.generator';
import { randomInt } from '../generators/helpers';
import { backfillCounters } from './counter.service';

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
    const BATCH_LIMIT = 499;
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

// BulkWriter: alta throughput para grandes volumes (GCP).
// Gerencia até 500 writes paralelos com rate limiting automático.
// Flush periódico a cada FLUSH_EVERY docs evita acúmulo excessivo em memória.
async function bulkWrite(
    generator: () => Generator<{ collection: string; id?: string; data: Record<string, any> }>,
    total: number,
    onProgress: (done: number) => void,
    flushEvery = 10_000,
): Promise<void> {
    const bw = db.bulkWriter();
    bw.onWriteError((err) => err.failedAttempts < 5);

    let done = 0;
    for (const doc of generator()) {
        const ref = doc.id
            ? db.collection(doc.collection).doc(doc.id)
            : db.collection(doc.collection).doc();
        bw.set(ref, doc.data);

        done++;
        if (done % flushEvery === 0) {
            await bw.flush();
            onProgress(done);
        }
    }
    await bw.close();
    onProgress(done);
}

export async function seedData(volume: string): Promise<void> {
    const config = SEED_VOLUMES[volume] ?? GCP_SEED_VOLUMES[volume];
    if (!config) throw new Error(`Invalid volume: ${volume}. Valid: ${[...Object.keys(SEED_VOLUMES), ...Object.keys(GCP_SEED_VOLUMES)].join(', ')}`);

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

        // Captura refs durante a geração — evita query ao Firestore na fase de events
        const MAX_EVENT_REFS = 10_000;
        const eventDocRefs: { id: string; tenantId: string; chaveAcesso: string; dataColeta: Date }[] = [];

        function* docGenerator() {
            for (let i = 0; i < config.docs; i++) {
                const pair = tenantCnpjPairs[i % tenantCnpjPairs.length];
                const cnpjInfo = pair.tenant.cnpjs[pair.cnpjIdx];
                const docData = generateDocumentData(pair.tenant.id, cnpjInfo, nsuSequencer, i);
                const ref = db.collection('documents').doc();
                if (eventDocRefs.length < MAX_EVENT_REFS) {
                    eventDocRefs.push({ id: ref.id, tenantId: docData.tenantId, chaveAcesso: docData.chaveAcesso, dataColeta: docData.dataColeta });
                }
                yield { collection: 'documents', id: ref.id, data: docData };
            }
        }

        await bulkWrite(
            docGenerator,
            config.docs,
            (done) => updateProgress({ seededDocs: done, phase: `Seeding documents... ${done}/${config.docs}` }),
        );

        // Phase 3: Seed events (usa refs capturadas durante a geração — sem query extra ao Firestore)
        updateProgress({ phase: 'Seeding events...' });

        function* eventGenerator() {
            for (let i = 0; i < config.events; i++) {
                const docRef = eventDocRefs[i % eventDocRefs.length];
                const events = generateEventsForDocument(docRef.tenantId, docRef.chaveAcesso, docRef.id, docRef.dataColeta, 1);
                yield { collection: 'events', data: events[0] };
            }
        }

        await bulkWrite(
            eventGenerator,
            config.events,
            (done) => updateProgress({ seededEvents: done, phase: `Seeding events... ${done}/${config.events}` }),
            5_000,
        );

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

        // Phase 5: Auto-backfill distributed counters
        updateProgress({ phase: 'Building distributed counters...' });
        try {
            await backfillCounters();
        } catch (err: any) {
            console.warn('[seed] Counter backfill failed (non-fatal):', err.message);
        }

        updateProgress({
            status: 'completed',
            phase: 'Seeding completed! (with counters)',
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
