/**
 * PeriodDetectionEngine.js
 * Extracts temporal context from CSV metadata and content.
 */
export class PeriodDetectionEngine {
    constructor(calendarMonths) {
        this.calendarMonths = calendarMonths || [
            'January', 'February', 'March', 'April', 'May', 'June', 
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
    }

    /**
     * Detects month and year from a filename string.
     * Pattern: "August_2026_Treez.csv" or "2026-08-Treez.csv"
     */
    detectFromFilename(filename) {
        if (!filename) return null;

        // 1. Check for Full Month Name + Year (e.g. August_2026)
        const monthRegex = new RegExp(`(${this.calendarMonths.join('|')})`, 'i');
        const yearRegex = /(202\d|203\d)/;

        const monthMatch = filename.match(monthRegex);
        const yearMatch = filename.match(yearRegex);

        if (monthMatch && yearMatch) {
            // Normalize month to Title Case
            const month = monthMatch[0].charAt(0).toUpperCase() + monthMatch[0].slice(1).toLowerCase();
            return {
                month,
                year: parseInt(yearMatch[0]),
                source: 'FILENAME'
            };
        }

        return null;
    }

    /**
     * Detects period by sampling transaction dates in rows.
     * @param {Array} rows - Array of objects containing a 'Date Closed' or 'Date' field.
     */
    detectFromData(rows) {
        if (!rows || rows.length === 0) return null;

        const samples = rows.slice(0, 100);
        const counts = {};

        samples.forEach(row => {
            const dateStr = row['Date Closed'] || row['Date'];
            if (!dateStr) return;

            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return;

            const key = `${this.calendarMonths[d.getMonth()]}_${d.getFullYear()}`;
            counts[key] = (counts[key] || 0) + 1;
        });

        // Find the mode (most common month_year)
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return null;

        const [bestKey, frequency] = sorted[0];
        const [month, year] = bestKey.split('_');

        return {
            month,
            year: parseInt(year),
            frequency,
            confidence: frequency / samples.length,
            source: 'DATA_SAMPLING'
        };
    }

    /**
     * Reconciles multiple detection sources.
     */
    identifyPeriod(filename, rows) {
        const fileDetection = this.detectFromFilename(filename);
        const dataDetection = this.detectFromData(rows);

        if (!fileDetection && !dataDetection) return null;

        // If they agree, high confidence
        if (fileDetection && dataDetection && 
            fileDetection.month === dataDetection.month && 
            fileDetection.year === dataDetection.year) {
            return { ...dataDetection, method: 'RECONCILED', isAmbiguous: false };
        }

        // Data detection is usually more reliable than filename
        if (dataDetection && dataDetection.confidence > 0.8) {
            return { ...dataDetection, method: 'DATA_PRIORITY', isAmbiguous: !!fileDetection };
        }

        return fileDetection || dataDetection;
    }
}
