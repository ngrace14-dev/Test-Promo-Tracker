/**
 * WorkbookSyncService.js
 * Synchronizes the application state with the discovery/recovery collections.
 */
import { onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export class WorkbookSyncService {
    constructor(db, logSystemAction) {
        this.db = db;
        this.logSystemAction = logSystemAction;
        this.registry = {}; // [Period][VendorId] = { discovery, recovery, variance }
        this.listeners = [];
    }

    /**
     * Attaches listeners to core collections to maintain real-time aggregates.
     * @param {Function} onUpdate - Callback for Vue to update reactive state.
     */
    init(onUpdate) {
        // 1. Listen for Discovery Claims
        const unsubGenerated = onSnapshot(collection(this.db, "promoGenerated"), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                const periodKey = `${data.month}_${data.year}`;
                
                if (!this.registry[periodKey]) this.registry[periodKey] = {};
                if (!this.registry[periodKey][data.vendorId]) {
                    this.registry[periodKey][data.vendorId] = { discovery: 0, recovery: 0, variance: 0 };
                }

                if (change.type === "added" || change.type === "modified") {
                    this.registry[periodKey][data.vendorId].discovery = data.totalDiscovery;
                } else if (change.type === "removed") {
                    this.registry[periodKey][data.vendorId].discovery = 0;
                }

                this._updateVariance(periodKey, data.vendorId);
            });
            onUpdate(this.registry);
        });

        // 2. Listen for Recoveries
        const unsubRecovered = onSnapshot(collection(this.db, "promoRecovered"), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                const periodKey = `${data.month}_${data.year}`;

                if (!this.registry[periodKey]) this.registry[periodKey] = {};
                if (!this.registry[periodKey][data.vendorId]) {
                    this.registry[periodKey][data.vendorId] = { discovery: 0, recovery: 0, variance: 0 };
                }

                if (change.type === "added" || change.type === "modified") {
                    this.registry[periodKey][data.vendorId].recovery = data.amount;
                } else if (change.type === "removed") {
                    this.registry[periodKey][data.vendorId].recovery = 0;
                }

                this._updateVariance(periodKey, data.vendorId);
            });
            onUpdate(this.registry);
        });

        this.listeners.push(unsubGenerated, unsubRecovered);
    }

    _updateVariance(period, vendorId) {
        const entry = this.registry[period][vendorId];
        entry.variance = entry.discovery - entry.recovery;
    }

    getPeriodSummary(month, year) {
        const key = `${month}_${year}`;
        const summary = { totalDiscovery: 0, totalRecovery: 0, netOutstanding: 0 };
        
        if (this.registry[key]) {
            Object.values(this.registry[key]).forEach(v => {
                summary.totalDiscovery += v.discovery;
                summary.totalRecovery += v.recovery;
                summary.netOutstanding += v.variance;
            });
        }
        return summary;
    }

    dispose() {
        this.listeners.forEach(unsub => unsub());
    }
}
