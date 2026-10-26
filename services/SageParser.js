/**
 * SageParser.js
 * 
 * Purpose: Parses Sage GL and Check Register exports to track credit recovery.
 * Part of PCRP Phase 5 - Sage Recovery Pipeline.
 */

import { collection, doc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export class SageParser {
    constructor(db, identityService, importService) {
        this.db = db;
        this.identityService = identityService;
        this.importService = importService;
    }

    /**
     * Ingests Sage CSV data and populates promoRecovered ledger.
     */
    async processCsv(csvText, batchId) {
        const rows = this.parseRawCsv(csvText);
        if (rows.length < 2) throw new Error("Sage CSV is empty or invalid.");

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);
        
        let processedCount = 0;
        let batch = writeBatch(this.db);
        let batchCount = 0;

        for (const row of dataRows) {
            if (row.length < headers.length) continue;

            const rawData = {};
            headers.forEach((h, i) => rawData[h] = row[i]);

            // 1. Core Field Extraction
            const vendorRefStr = rawData['vendor id'] || rawData['vendor'] || rawData['id'] || '';
            const amountStr = rawData['amount'] || rawData['total'] || rawData['credit'] || '0';
            const refNumber = (rawData['reference'] || rawData['memo'] || rawData['check #'] || '').trim();
            const dateStr = rawData['date'] || rawData['posting date'] || '';
            
            const rawAmount = parseFloat(String(amountStr).replace(/[^0-9.-]+/g,"")) || 0;
            if (rawAmount === 0) continue;

            // 2. Identity Resolution
            const vendorResult = await this.identityService.resolveBrand(vendorRefStr, { source: 'SAGE_IMPORT', batchId });
            
            // 3. Payment Type Detection
            const paymentType = this.detectPaymentType(refNumber, rawData['type'] || '');

            // 4. Deduplication Hash
            const dedupeHash = btoa(`sage_${refNumber}_${rawAmount}_${dateStr}`).replace(/=/g, '');

            const entry = {
                batchId,
                vendorId: vendorResult.vendorId,
                amount: Math.abs(rawAmount),
                refNumber,
                recoveryDate: dateStr,
                paymentType,
                dedupeHash,
                status: 'UNRECONCILED',
                createdAt: serverTimestamp(),
                sourceMetadata: {
                    rawVendor: vendorRefStr,
                    rawReference: refNumber,
                    rawType: rawData['type'] || ''
                }
            };

            // 5. Write to promoRecovered
            const docRef = doc(this.db, "promoRecovered", dedupeHash);
            batch.set(docRef, entry, { merge: false });

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

    detectPaymentType(ref, type) {
        const str = (ref + type).toUpperCase();
        if (str.includes('CM') || str.includes('MEMO') || str.includes('CR')) return 'MEMO';
        if (str.includes('ACH') || str.includes('WIRE') || str.includes('EFT')) return 'ACH';
        if (str.includes('CK') || /^\d+$/.test(ref)) return 'CHECK';
        return 'JOURNAL';
    }

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
