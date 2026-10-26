/**
 * WorkbookService.js
 * 
 * Purpose: Authoritative financial calculation engine for PCRP.
 * Ensures parity between Dashboard, Reports, Tracker, and Exports.
 * Part of PCRP Phase 4A - Workbook Reporting Layer.
 */

export class WorkbookService {
    constructor() {
        this.siteAliases = {
            'REDDING': ['Redding', 'Sundial', 'Redding Sundial'],
            'RED_BLUFF': ['Red Bluff', 'RedBluff']
        };
    }

    /**
     * Calculates the outstanding balance for a ledger entry.
     * Formula: Generated - Recovered
     */
    calculateBalance(generated = 0, recovered = 0) {
        return parseFloat((generated - recovered).toFixed(2));
    }

    /**
     * Calculates the recovery percentage.
     * Formula: (Recovered / Generated) * 100
     */
    calculateRecoveryRate(generated = 0, recovered = 0) {
        if (!generated || generated === 0) return 0;
        return parseFloat(((recovered / generated) * 100).toFixed(2));
    }

    /**
     * Aggregates raw promoGenerated items into workbook-style summaries.
     * Groups by: Site + Vendor + Month
     */
    summarizeDiscovery(generatedItems) {
        const groups = {};
        
        generatedItems.forEach(item => {
            const key = `${item.storeId}_${item.vendorId}_${item.month}_${item.year}`;
            if (!groups[key]) {
                groups[key] = {
                    site: item.storeId,
                    vendorId: item.vendorId,
                    period: `${item.month} ${item.year}`,
                    totalGenerated: 0,
                    itemCount: 0,
                    items: []
                };
            }
            groups[key].totalGenerated += (parseFloat(item.amount) || 0);
            groups[key].itemCount += 1;
            groups[key].items.push(item);
        });

        return Object.values(groups);
    }

    /**
     * Determines the aging bucket for a credit based on discovery date.
     * Buckets: Current, 30, 60, 90, 120+
     */
    getAgingBucket(discoveryDate) {
        const now = Date.now();
        const diffDays = Math.floor((now - discoveryDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 30) return 'Current';
        if (diffDays < 60) return '30 Days';
        if (diffDays < 90) return '60 Days';
        if (diffDays < 120) return '90 Days';
        return '120+ Days';
    }

    /**
     * Formats currency consistently across all UI components.
     */
    formatCurrency(val) {
        const num = parseFloat(val);
        if (isNaN(num)) return '$0.00';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(num);
    }
}
