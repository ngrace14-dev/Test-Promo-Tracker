/**
 * ImportService.js
 * 
 * Purpose: Orchestrates the ingestion of raw data (Treez/Sage).
 * Handles batch tracking, status monitoring, and queue handoff.
 * Part of PCRP Phase 4B - Import Framework.
 */

import { collection, addDoc, serverTimestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export class ImportService {
    constructor(db, logActionFn) {
        this.db = db;
        this.logAction = logActionFn;
    }

    /**
     * Initializes a new import batch.
     */
    async createBatch(sourceType, fileName, rowCount) {
        const batchRef = await addDoc(collection(this.db, "importBatches"), {
            sourceType, // 'TREEZ' | 'SAGE'
            fileName,
            rowCount,
            status: 'PROCESSING',
            createdAt: serverTimestamp(),
            processedCount: 0,
            errorCount: 0,
            errors: []
        });
        return batchRef.id;
    }

    /**
     * Updates the status and counts of a batch.
     */
    async updateBatchProgress(batchId, processed, errors = []) {
        const batchRef = doc(this.db, "importBatches", batchId);
        await updateDoc(batchRef, {
            processedCount: processed,
            errorCount: errors.length,
            errors: errors.slice(0, 10) // Store last 10 errors for brevity
        });
    }

    /**
     * Finalizes the batch status.
     */
    async finalizeBatch(batchId, status = 'COMPLETED') {
        const batchRef = doc(this.db, "importBatches", batchId);
        await updateDoc(batchRef, {
            status,
            completedAt: serverTimestamp()
        });
    }
}
