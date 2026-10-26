/**
 * DiscoveryAggregationEngine.js
 * Groups individual transactions into claim-ready discovery records.
 */
import { collection, addDoc, writeBatch, doc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export class DiscoveryAggregationEngine {
    constructor(db, identityService, logSystemAction) {
        this.db = db;
        this.identityService = identityService;
        this.logSystemAction = logSystemAction;
    }

    /**
     * Aggregates raw sales into promoGenerated claims.
     * @param {Array} sales - Array of sales documents from Firestore or CSV.
     * @param {Object} period - { month: 'August', year: 2026 }
     */
    async aggregate(sales, period) {
        const groups = {};
        const unmappedBrands = new Set();

        for (const sale of sales) {
            // 1. Resolve Identity
            const mapping = await this.identityService.resolveBrand(sale.brand);
            
            if (!mapping || !mapping.vendorId) {
                unmappedBrands.add(sale.brand);
                continue;
            }

            // 2. Define Grouping Key (Site + Vendor + Month + Year)
            const key = `${sale.detectedSite}_${mapping.vendorId}_${period.month}_${period.year}`;

            if (!groups[key]) {
                groups[key] = {
                    site: sale.detectedSite,
                    vendorId: mapping.vendorId,
                    vendorName: mapping.canonicalName || sale.brand,
                    month: period.month,
                    year: period.year,
                    totalDiscovery: 0,
                    itemCount: 0,
                    lastUpdated: Date.now(),
                    status: 'GENERATED',
                    source: 'TREEZ_POS'
                };
            }

            groups[key].totalDiscovery += parseFloat(sale.owed || 0);
            groups[key].itemCount += 1;
        }

        // 3. Batch Persistence
        const batch = writeBatch(this.db);
        let count = 0;

        for (const group of Object.values(groups)) {
            const docRef = doc(collection(this.db, "promoGenerated"));
            batch.set(docRef, group);
            count++;
        }

        if (count > 0) {
            await batch.commit();
            await this.logSystemAction('DISCOVERY_GENERATED', `Aggregated ${sales.length} items into ${count} claims for ${period.month} ${period.year}`);
        }

        return {
            claimCount: count,
            unmappedCount: unmappedBrands.size,
            unmappedBrands: Array.from(unmappedBrands)
        };
    }
}
