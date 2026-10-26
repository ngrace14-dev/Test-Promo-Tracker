/**
 * QueueService.js
 * 
 * Purpose: Manages the reconciliationQueue for background ledger updates.
 * Type-safe action framework for Discovery, Recovery, and Rebuild events.
 * Part of PCRP Phase 4E - Queue Integration.
 */

import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, limit } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export const QUEUE_ACTION_TYPES = {
    DISCOVERY_UPDATE: 'DISCOVERY_UPDATE', // Triggered by Treez Imports
    RECOVERY_UPDATE: 'RECOVERY_UPDATE',   // Triggered by Sage Imports
    MANUAL_UPDATE: 'MANUAL_UPDATE',       // Triggered by Admin Adjustments
    FULL_REBUILD: 'FULL_REBUILD'          // Triggered by Mapping changes or System Reset
};

export class QueueService {
    constructor(db, logActionFn) {
        this.db = db;
        this.logAction = logActionFn;
    }

    /**
     * Pushes a new reconciliation task to the queue.
     * Implements traceability via correlationId (batchId).
     */
    async enqueueTask(actionType, payload, priority = 5, userId = 'System') {
        try {
            // Ensure payload has minimal required routing info
            if (!payload.storeId || !payload.vendorId || !payload.period) {
                console.warn("Queue Task missing routing metadata:", payload);
            }

            const task = {
                actionType,
                priority,
                payload,
                status: 'PENDING',
                retryCount: 0,
                metadata: {
                    createdAt: serverTimestamp(),
                    createdBy: userId,
                    correlationId: payload.batchId || 'MANUAL'
                }
            };

            const docRef = await addDoc(collection(this.db, "reconciliationQueue"), task);
            return docRef.id;

        } catch (error) {
            console.error("Failed to enqueue task:", error);
            throw error;
        }
    }

    /**
     * Aggregates and enqueues bulk updates from a batch.
     * Prevents queue flooding by grouping by Store+Vendor+Period.
     */
    async enqueueBatchUpdates(batchId, summaries, userId) {
        let taskCount = 0;
        for (const summary of summaries) {
            await this.enqueueTask(
                QUEUE_ACTION_TYPES.DISCOVERY_UPDATE,
                {
                    batchId,
                    storeId: summary.site,
                    vendorId: summary.vendorId,
                    period: summary.period
                },
                5,
                userId
            );
            taskCount++;
        }
        return taskCount;
    }

    /**
     * Design for Worker Readiness: Fetch next pending task
     */
    async getNextTask() {
        const q = query(
            collection(this.db, "reconciliationQueue"), 
            where("status", "==", "PENDING"),
            limit(1)
        );
        const snapshot = await getDocs(q);
        return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }
}
