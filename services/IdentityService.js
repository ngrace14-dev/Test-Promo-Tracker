/**
 * IdentityService.js
 * 
 * Purpose: Centrally handles canonical resolution of Brands, Vendors, and Sites.
 * Part of PCRP Phase 3 - Canonical Identity Layer.
 */

import { collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { AUDIT_ACTIONS } from "../governance.js";

export class IdentityService {
    constructor(db, logActionFn) {
        this.db = db;
        this.logAction = logActionFn;
        this.cache = {
            brands: new Map(),
            vendors: new Map(),
            sites: new Map(),
            siteAliases: new Map()
        };
    }

    /**
     * Resolves a raw Brand string to a Canonical Vendor ID.
     * Includes confidence metadata and automatic queuing for unresolved brands.
     */
    async resolveBrand(rawBrandName, context = {}) {
        const cleanName = (rawBrandName || '').trim();
        const lowerName = cleanName.toLowerCase();
        
        // 1. Check Cache
        if (this.cache.brands.has(lowerName)) {
            return this.cache.brands.get(lowerName);
        }

        try {
            // 2. Query brandMappings for an alias match
            const brandRef = collection(this.db, "brandMappings");
            const q = query(brandRef, where("brandName", "==", cleanName));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const brandData = snapshot.docs[0].data();
                const result = {
                    vendorId: brandData.vendorId,
                    brandId: snapshot.docs[0].id,
                    confidence: 'HIGH',
                    matchType: 'EXACT_ALIAS',
                    needsReview: false
                };
                this.cache.brands.set(lowerName, result);
                return result;
            }

            // 3. Fallback: If not found, check if it's a direct Vendor Name match
            const vendorRef = collection(this.db, "vendorMappings");
            const vq = query(vendorRef, where("canonicalName", "==", cleanName));
            const vSnapshot = await getDocs(vq);

            if (!vSnapshot.empty) {
                const result = {
                    vendorId: vSnapshot.docs[0].id,
                    brandId: null,
                    confidence: 'MEDIUM',
                    matchType: 'DIRECT_VENDOR_MATCH',
                    needsReview: true
                };
                this.cache.brands.set(lowerName, result);
                return result;
            }

            // 4. No Match Found: Queue for manual mapping
            await this.queueForMapping('BRAND', cleanName, context);
            
            return {
                vendorId: null,
                brandId: null,
                confidence: 'NONE',
                matchType: 'NO_MATCH',
                needsReview: true
            };

        } catch (error) {
            console.error("Identity Resolution Error:", error);
            throw error;
        }
    }

    /**
     * Resolves a raw Site string to a Canonical Site ID using siteMappings aliases.
     */
    async resolveSite(rawSiteString) {
        const cleanSite = (rawSiteString || '').trim();
        const lowerSite = cleanSite.toLowerCase();

        // 1. Check Cache
        if (this.cache.sites.has(lowerSite)) return this.cache.sites.get(lowerSite);

        try {
            const siteRef = collection(this.db, "siteMappings");
            const q = query(siteRef, where("aliases", "array-contains", cleanSite));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const siteId = snapshot.docs[0].id;
                this.cache.sites.set(lowerSite, siteId);
                return siteId;
            }

            // Hardcoded fallback for legacy names if siteMappings not yet populated
            if (lowerSite.includes('red bluff')) return 'RED_BLUFF';
            if (lowerSite.includes('redding') || lowerSite.includes('sundial')) return 'REDDING';

            return 'UNKNOWN';
        } catch (error) {
            console.error("Site Resolution Error:", error);
            return 'UNKNOWN';
        }
    }

    /**
     * Queues an unresolved identity for manual mapping.
     * Prevents duplicate queue entries for the same value.
     */
    async queueForMapping(type, rawValue, context) {
        try {
            const queueRef = collection(this.db, "mappingQueue");
            const q = query(queueRef, 
                where("type", "==", type), 
                where("rawValue", "==", rawValue),
                where("status", "==", "PENDING")
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                await addDoc(queueRef, {
                    type,
                    rawValue,
                    context,
                    status: 'PENDING',
                    confidenceScore: 0,
                    createdAt: serverTimestamp(),
                    occurrenceCount: 1
                });

                await this.logAction(AUDIT_ACTIONS.MAPPING_QUEUE_UPDATED, {
                    message: `New ${type} added to mapping queue: ${rawValue}`,
                    type,
                    value: rawValue
                });
            } else {
                // Increment occurrence count for existing queue item
                const docId = snapshot.docs[0].id;
                const currentCount = snapshot.docs[0].data().occurrenceCount || 1;
                await updateDoc(doc(this.db, "mappingQueue", docId), {
                    occurrenceCount: currentCount + 1,
                    lastSeenAt: serverTimestamp()
                });
            }
        } catch (error) {
            console.error("Queueing Error:", error);
        }
    }
}
