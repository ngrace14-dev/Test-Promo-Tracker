/**
 * TreezParser.js
 * 
 * Purpose: High-performance CSV parser for Treez POS exports.
 * Integrates Identity Resolution and Deduplication logic.
 * Part of PCRP Phase 4C - Treez Discovery Pipeline.
 */

import { collection, addDoc, doc, setDoc, serverTimestamp, writeBatch, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export class TreezParser {
    constructor(db, identityService, importService, workbookService) {
        this.db = db;
        this.identityService = identityService;
        this.importService = importService;
        this.workbookService = workbookService;
    }

    /**
     * Parses Treez CSV text and streams to promoGenerated.
     */
    async processCsv(csvText, batchId) {
        const rows = this.parseRawCsv(csvText);
        if (rows.length < 2) throw new Error("CSV is empty or invalid.");

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);
        
        let processedCount = 0;
        let batch = writeBatch(this.db);
        let batchCount = 0;

        for (const row of dataRows) {
            if (row.length < headers.length) continue;
            
            const rawData = {};
            headers.forEach((h, i) => rawData[h] = row[i]);

            // 1. Extract & Map
            const brandName = rawData['product brand'] || rawData['brand'] || 'Unknown Brand';
            const siteName = rawData['store name'] || rawData['location'] || 'Unknown Store';
            const dateStr = rawData['date closed'] || rawData['date'] || '';
            const trackingId = rawData['state tracking id'] || rawData['tracking id'] || '';
            const owedAmount = parseFloat(String(rawData['vendor credit owed'] || rawData['credit owed'] || '0').replace(/[^0-9.-]+/g,"")) || 0;

            if (owedAmount <= 0) continue; // Only track discovery items with actual value

            // 2. Identity Resolution
            const brandResult = await this.identityService.resolveBrand(brandName, { source: 'TREEZ_IMPORT', batchId });
            const storeId = await this.identityService.resolveSite(siteName);
            
            // 3. Deduplication Hash
            const dedupeHash = btoa(`${trackingId}_${storeId}_${dateStr}`).replace(/=/g, ''); // Simple base64 hash for dedupe

            // 4. Transform to Ledger Doc
            const dateObj = new Date(dateStr);
            const entry = {
                batchId,
                vendorId: brandResult.vendorId,
                brandName: brandName,
                storeId,
                month: dateObj.toLocaleString('default', { month: 'long' }),
                year: dateObj.getFullYear(),
                amount: owedAmount,
                trackingId,
                dedupeHash,
                resolutionConfidence: brandResult.confidence,
                status: 'UNRECONCILED',
                createdAt: serverTimestamp(),
                sourceMetadata: {
                    rawBrand: brandName,
                    rawStore: siteName,
                    rawDate: dateStr
                }
            };

            // 5. Write to promoGenerated (using dedupeHash as Doc ID to prevent duplicates)
            const docRef = doc(this.db, "promoGenerated", dedupeHash);
            batch.set(docRef, entry, { merge: false }); // merge: false ensures we don't overwrite if hash matches
            
            processedCount++;
            batchCount++;

            if (batchCount >= 400) {
                await batch.commit();
                batch = writeBatch(this.db);
                batchCount = 0;
                await this.importService.updateBatchProgress(batchId, processedCount);
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            await this.importService.updateBatchProgress(batchId, processedCount);
        }

        return processedCount;
    }

    /**
     * Basic CSV Parser (mimicking PapaParse logic for browser compatibility)
     */
    parseRawCsv(str) {
        const result = [];
        let row = [];
        let cell = '';
        let inQuotes = false;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { row.push(cell.trim()); cell = ''; }
            else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (cell || row.length > 0) {
                    row.push(cell.trim());
                    result.push(row);
                    row = [];
                    cell = '';
                }
            } else cell += char;
        }
        if (cell || row.length > 0) { row.push(cell.trim()); result.push(row); }
        return result;
    }
}
