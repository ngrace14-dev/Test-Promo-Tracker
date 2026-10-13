// app.js

// 1. FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, onSnapshot, setDoc, query, where } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app-check.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";
import { PROMO_HIERARCHY, STATUS_DEFINITIONS, AUDIT_ACTIONS } from "./governance.js";


// 2. FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyAslKhO_Wn2l1paJkqWj5lhxX_2YSekynk",
    authDomain: "rredco-database.firebaseapp.com",
    projectId: "rredco-database",
    storageBucket: "rredco-database.firebasestorage.app",
    messagingSenderId: "968362680607",
    appId: "1:968362680607:web:dea3fe719d8f8d619fbe8a",
    measurementId: "G-PGY27N2N17"
};

const firebaseApp = initializeApp(firebaseConfig);

try {
    initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider("6LeNEb8tAAAAAN454U2BgfO-ot6wN8T3VexIgIMq"),
        isTokenAutoRefreshEnabled: true
    });
} catch (error) {
    console.error("App Check Error:", error);
}

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp); 
const storage = getStorage(firebaseApp);
 

// 3. VUE APP INIT
const { createApp, ref, computed, nextTick, onMounted, watch } = window.Vue;

createApp({
        setup() {
            const selectedRole = ref(null); // 'Employee' or 'Brand'
            const isManagerUnlocked = ref(false);
            const isBrandUnlocked = ref(false);
            const isPreviewMode = ref(false);
            const activeBrand = ref(null);
            const brandTab = ref('Dashboard');



                        const publishedReports = ref([]); // Sprint 2: Track published reports
            const creditRequests = ref([]); // Sprint 7: New Brand Requests
            const isLogsMinimized = ref(false); // SPRINT 7 Fix



        
        const loggedInUser = ref('');
        const emailInput = ref('');
        const passwordInput = ref('');
        const authError = ref('');

        const brandEmailInput = ref('');
        const brandCodeInput = ref('');
                const brandAuthError = ref('');
        
        const brandFilters = ref({
            month: 'All',
            site: 'All',
            status: 'All',
            search: ''
        });

        const activeSite = ref('Red Bluff');
        const activeTab = ref('Tracker');
        
        const systemUsers = {
            'lenay@rredco.com': { name: 'Lenay A.', access: ['Red Bluff', 'Redding'], active: false },
            'tricia@rredco.com': { name: 'Tricia K.', access: ['Red Bluff', 'Redding'], active: false },
            'whitney@rredco.com': { name: 'Whitney M.', access: ['Red Bluff', 'Redding'], active: false },
            'nicholas.grace@rredco.com': { name: 'Nicholas G.', access: ['Red Bluff', 'Redding'], active: true, superAdmin: true },
            'accounting@rredco.com': { name: 'Accounting Team', access: ['Red Bluff', 'Redding'], active: true, superAdmin: true }
        };

        const logSystemAction = async (actionType, details) => {
            try {
                await addDoc(collection(db, "systemLogs"), {
                    timestamp: Date.now(),
                    user: loggedInUser.value || 'System',
                    actionType: actionType,
                    details: details
                });
            } catch (error) {
                console.error("Error logging action:", error);
            }
        };

        const treesSalesData = ref(JSON.parse(localStorage.getItem('treesSalesData')) || []);
        
        const saveTreesDataLocal = () => {
            localStorage.setItem('treesSalesData', JSON.stringify(treesSalesData.value));
        };

        const masterBrands = ref([]);
        const selectedBrands = ref([]);
        
        const allBrandsSelected = computed(() => {
            return masterBrands.value.length > 0 && selectedBrands.value.length === masterBrands.value.length;
        });
        
        const toggleAllBrands = () => {
            if (allBrandsSelected.value) selectedBrands.value = [];
            else selectedBrands.value = masterBrands.value.map(b => b.id).filter(Boolean);
        };

        const deleteSelectedBrands = async () => {
            if (selectedBrands.value.length === 0) return;
            if (confirm(`Are you sure you want to permanently delete these ${selectedBrands.value.length} brands from the cloud directory?`)) {
                try {
                    const batch = writeBatch(db);
                    selectedBrands.value.forEach(brandId => {
                        batch.delete(doc(db, "brands", brandId));
                    });
                    await batch.commit();
                    selectedBrands.value = []; 
                } catch (error) {
                    console.error("Error deleting brands:", error);
                    alert("Failed to delete brands from the cloud.");
                }
            }
        };

                const updateBrandField = async (brandId, fieldName, event) => {
                    const newValue = event.target.value;
                    try {
                        await updateDoc(doc(db, "brands", brandId), {
                            [fieldName]: newValue
                        });
                    } catch (error) {
                        console.error("Error updating brand:", error);
                        alert("Failed to save changes to the cloud.");
                    }
                };

                const generateAccessCode = async (brandId) => {
                    const code = Array.from({length: 4}, () => Math.random().toString(36).substring(2, 6).toUpperCase()).join('-');
                    try {
                        await updateDoc(doc(db, "brands", brandId), { accessCode: code });
                    } catch (error) {
                        console.error("Error generating code:", error);
                    }
                };

                const bulkGenerateCodes = async (forceReset = false) => {
                    const targets = forceReset ? masterBrands.value : masterBrands.value.filter(b => !b.accessCode);
            
                    if (targets.length === 0) {
                        alert("No brands selected for code generation.");
                        return;
                    }

                    const msg = forceReset 
                        ? `WARNING: This will wipe and regenerate access codes for ALL ${targets.length} brands. This will invalidate all previous codes. Proceed for the new month?`
                        : `Generate codes for ${targets.length} brands?`;

                    if (confirm(msg)) {
                        try {
                            const batch = writeBatch(db);
                            targets.forEach(brand => {
                                const code = Array.from({length: 4}, () => Math.random().toString(36).substring(2, 6).toUpperCase()).join('-');
                                batch.update(doc(db, "brands", brand.id), { accessCode: code });
                            });
                            await batch.commit();
                            logSystemAction("UPDATE", forceReset ? "Monthly Bulk Code Reset" : `Bulk generated codes for ${targets.length} brands`);
                            alert(`Success! Generated new codes for ${targets.length} brands.`);
                        } catch (error) {
                            console.error(error);
                            alert("Failed to update codes.");
                        }
                    }
                };

        const toggleBrandActive = async (brand) => {
            try {
                await updateDoc(doc(db, "brands", brand.id), {
                    inactive: !brand.inactive
                });
                refreshIcons();
            } catch (error) {
                console.error("Error toggling brand status:", error);
                alert("Failed to update status.");
            }
        };

        const promoCredits = ref([]);
        const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const activeMonth = ref('August');
        
        const searchQueryInput = ref('');
        const searchQuery = ref('');      
        let searchTimeout = null;
        
        watch(searchQueryInput, (newVal) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchQuery.value = newVal;
            }, 300);
        });

        const showPromoModal = ref(false);
        const showBrandDropdown = ref(false);
        const editingId = ref(null);
        const showReportModal = ref(false);

        const showResolutionModal = ref(false);
        const resolutionCredit = ref(null);
        const resolutionForm = ref({ invoice: '', dateReceived: '' });

        const markAsSent = async (credit) => {
            if (confirm(`Mark this credit for ${credit.vendor} as 'Report Sent'?`)) {
                try {
                    await updateDoc(doc(db, "promoCredits", credit.id), { status: "Report Sent" });
                    
                    await addDoc(collection(db, "emailHistories"), {
                        creditId: credit.id,
                        vendor: credit.vendor,
                        amount: credit.amount,
                        site: credit.site,
                        action: "Report Sent",
                        sentBy: loggedInUser.value,
                        timestamp: Date.now()
                    });
                    
                    logSystemAction("UPDATE", `Marked credit for ${credit.vendor} as Report Sent`);
                } catch (error) {
                    console.error(error);
                    alert("Failed to update status.");
                }
            }
        };

        const markReportGroupAsSent = async (report) => {
            if (confirm(`Mark all ${report.credits.length} credits for ${report.vendor} as 'Report Sent'?`)) {
                try {
                    const batch = writeBatch(db);
                    const timestamp = Date.now();
                    
                    report.credits.forEach(credit => {
                        if (credit.status === 'Pending') {
                            const ref = doc(db, "promoCredits", credit.id);
                            batch.update(ref, { status: "Report Sent" });
                            
                            const historyRef = doc(collection(db, "emailHistories"));
                            batch.set(historyRef, {
                                creditId: credit.id,
                                vendor: credit.vendor,
                                amount: credit.amount,
                                site: credit.site,
                                action: "Report Sent (Batch)",
                                sentBy: loggedInUser.value,
                                timestamp: timestamp
                            });
                        }
                    });
                    
                    await batch.commit();
                    logSystemAction("UPDATE", `Batch updated ${report.vendor} credits to 'Report Sent'`);
                } catch (error) {
                    console.error("Batch update error:", error);
                    alert("Failed to update status for the group.");
                }
            }
        };

        const openResolutionModal = (credit) => {
            resolutionCredit.value = credit;
            resolutionForm.value = { invoice: '', dateReceived: new Date().toISOString().split('T')[0] };
            showResolutionModal.value = true;
            refreshIcons();
        };

        const submitResolution = async () => {
            if (!resolutionForm.value.invoice) return alert("Invoice / Memo number is required to resolve.");
            
            try {
                await updateDoc(doc(db, "promoCredits", resolutionCredit.value.id), { 
                    status: "Applied",
                    invoice: resolutionForm.value.invoice,
                    dateReceived: resolutionForm.value.dateReceived
                });
                
                await addDoc(collection(db, "emailHistories"), {
                    creditId: resolutionCredit.value.id,
                    vendor: resolutionCredit.value.vendor,
                    amount: resolutionCredit.value.amount,
                    site: resolutionCredit.value.site,
                    action: "Resolved (Applied)",
                    invoice: resolutionForm.value.invoice,
                    resolvedBy: loggedInUser.value,
                    timestamp: Date.now()
                });
                
                logSystemAction("UPDATE", `Resolved credit for ${resolutionCredit.value.vendor} (Memo: ${resolutionForm.value.invoice})`);
                showResolutionModal.value = false;
            } catch (error) {
                console.error(error);
                alert("Failed to resolve credit.");
            }
        };

        const monthlyReportSummaries = computed(() => {
            const groups = {};
            let baseCredits = promoCredits.value.filter(c => c && c.site === activeSite.value && c.archived !== true);
            
            if (activeMonth.value !== 'All') {
                baseCredits = baseCredits.filter(c => c.trackingMonth === activeMonth.value);
            }

                        baseCredits.forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                const vendorName = c.vendor || 'Unmapped Brand';
                const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase()) || {};
                
                if (brandInfo.inactive) return;
                
                if (!groups[m]) {
                    groups[m] = { month: m, total: 0, count: 0, credits: [], brands: {} };
                }
                
                if (!groups[m].brands[vendorName]) {
                    groups[m].brands[vendorName] = {
                        vendor: vendorName,
                        month: m,
                        email: brandInfo.email || '',
                        rep: brandInfo.rep || '',
                        credits: [],
                        total: 0
                    };
                }
                
                groups[m].brands[vendorName].credits.push(c);
                groups[m].brands[vendorName].total += (parseFloat(c.amount) || 0);
                groups[m].credits.push(c);
                groups[m].total += (parseFloat(c.amount) || 0);
                groups[m].count += 1;
            });

            return Object.values(groups)
                .sort((a, b) => calendarMonths.indexOf(a.month) - calendarMonths.indexOf(b.month))
                .map(group => ({
                    ...group,
                    brandList: Object.values(group.brands).sort((a, b) => a.vendor.localeCompare(b.vendor))
                }));
        });

        // REFACTORED FOR DIME REQUIREMENTS
        const downloadMonthlyReport = (report) => {
            let csvContent = "Location,Date & Time,Brand,Product Name,Transaction ID,Quantity Sold,Unit Price,Total Before Tax,Discount Title,Discount Amount,Credit Owed,Entry Type\n";
            let csvTotal = 0;
            const reportMonth = report.month || activeMonth.value;
            const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
            const matchedRawSales = treesSalesData.value.filter(sale => {
                const brandMatch = cleanStr(sale.brand) === cleanStr(report.vendor);
                const siteMatch = cleanStr(sale.detectedSite) === cleanStr(activeSite.value);
                const monthMatch = cleanStr(sale.month) === cleanStr(reportMonth);
                return brandMatch && siteMatch && monthMatch;
            });

            if (matchedRawSales.length > 0) {
                matchedRawSales.forEach(sale => {
                    const safeLoc = `"${String(sale.detectedSite || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(sale.dateClosed || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(sale.brand || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(sale.productName || '').replace(/"/g, '""')}"`;
                    const safeTrack = `"${String(sale.trackingId || '').replace(/"/g, '""')}"`;
                    const safeQty = `"${sale.unitsSold || 0}"`;
                    const safePrice = `"${formatCurrency(sale.unitPrice || 0)}"`;
                    const safePreTax = `"${formatCurrency((sale.unitsSold || 0) * (sale.unitPrice || 0))}"`;
                    const safeDiscTitle = `"${String(sale.discountTitle || '').replace(/"/g, '""')}"`;
                    const safeDiscAmount = `"${formatCurrency(sale.discountAmount || 0)}"`;
                    const safeOwed = `"${formatCurrency(sale.owed || 0)}"`;
                    const safeType = `"POS Itemized"`;
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(sale.owed) || 0;
                });
            }

            const creditsToExport = report.credits || [];
            creditsToExport.forEach(c => {
                const isAggregated = c.creditType && String(c.creditType).includes('Aggregated POS Sales');
                if (!isAggregated) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Manual Entry"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                } else if (matchedRawSales.length === 0) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Summary (Raw Data Missing)"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                }
            });

            csvContent += `,,,,,,,,,"TOTAL:","${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            const reportName = report.vendor ? String(report.vendor).replace(/[^a-zA-Z0-9]/g, '_') : (reportMonth || 'Month');
            link.setAttribute("download", `${activeSite.value.replace(/\s/g, '_')}_Breakdown_${reportName}_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            logSystemAction("EXPORT", `Downloaded Detailed Report for ${reportName}`);
        };

        let chartMonthlyInstance = null;
        let chartDistrosInstance = null;
        let chartBrandsInstance = null;
        let chartStoresInstance = null;

        const drawCharts = () => {
            const activeCredits = promoCredits.value.filter(c => !c.archived);
            const currencyFormatter = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
            
            const customTooltip = {
                backgroundColor: '#111827', 
                titleColor: '#f59e0b', 
                titleFont: { size: 13, family: 'Calibri, sans-serif' },
                bodyFont: { size: 14, weight: 'bold', family: 'Calibri, sans-serif' },
                padding: 12,
                cornerRadius: 8,
                callbacks: { label: (ctx) => ` ${currencyFormatter(ctx.raw)}` }
            };

            const standardVerticalOptions = {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: customTooltip },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Calibri, sans-serif' }, color: '#64748b' } },
                    y: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter, font: { family: 'Calibri, sans-serif' }, color: '#64748b' } }
                }
            };

            const standardHorizontalOptions = {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                plugins: { legend: { display: false }, tooltip: customTooltip },
                scales: {
                    x: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, border: { display: false }, ticks: { callback: currencyFormatter, font: { family: 'Calibri, sans-serif' }, color: '#64748b' } },
                    y: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Calibri, sans-serif' }, color: '#64748b' } }
                }
            };

            const monthlySums = {};
            activeCredits.forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                monthlySums[m] = (monthlySums[m] || 0) + (parseFloat(c.amount) || 0);
            });
            const sortedMonths = calendarMonths.filter(m => monthlySums[m] !== undefined);
            
            if(chartMonthlyInstance) chartMonthlyInstance.destroy();
            chartMonthlyInstance = new Chart(document.getElementById('chartMonthly'), {
                type: 'bar',
                data: { 
                    labels: sortedMonths, 
                    datasets: [{ 
                        data: sortedMonths.map(m => monthlySums[m]), 
                        backgroundColor: '#10b981', 
                        borderRadius: 6,
                        barPercentage: 0.65
                    }] 
                },
                options: standardVerticalOptions
            });

            const distroSums = {};
            activeCredits.forEach(c => {
                const d = (c.distributor || '').trim();
                if (d && d !== 'Trees POS Import' && d !== 'Auto-Imported' && d.toLowerCase() !== 'unmapped' && d !== '-') {
                    distroSums[d] = (distroSums[d] || 0) + (parseFloat(c.amount) || 0);
                }
            });
            const topDistros = Object.entries(distroSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            if(chartDistrosInstance) chartDistrosInstance.destroy();
            chartDistrosInstance = new Chart(document.getElementById('chartDistros'), {
                type: 'bar',
                data: { 
                    labels: topDistros.map(d => d[0]), 
                    datasets: [{ 
                        data: topDistros.map(d => d[1]), 
                        backgroundColor: '#f59e0b', 
                        borderRadius: 6,
                        barPercentage: 0.65
                    }] 
                },
                options: standardHorizontalOptions
            });

            const brandSums = {};
            activeCredits.forEach(c => {
                const b = (c.vendor || '').trim();
                if (b && b.toLowerCase() !== 'unmapped brand') {
                    brandSums[b] = (brandSums[b] || 0) + (parseFloat(c.amount) || 0);
                }
            });
            const topBrands = Object.entries(brandSums).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            if(chartBrandsInstance) chartBrandsInstance.destroy();
            chartBrandsInstance = new Chart(document.getElementById('chartBrands'), {
                type: 'bar',
                data: { 
                    labels: topBrands.map(b => b[0]), 
                    datasets: [{ 
                        data: topBrands.map(b => b[1]), 
                        backgroundColor: '#10b981', 
                        borderRadius: 6,
                        barPercentage: 0.65
                    }] 
                },
                options: standardHorizontalOptions
            });

            const storeSums = {};
            activeCredits.forEach(c => {
                const s = c.site || 'Unknown';
                storeSums[s] = (storeSums[s] || 0) + (parseFloat(c.amount) || 0);
            });
            
            if(chartStoresInstance) chartStoresInstance.destroy();
            chartStoresInstance = new Chart(document.getElementById('chartStores'), {
                type: 'doughnut',
                data: { 
                    labels: Object.keys(storeSums), 
                    datasets: [{ 
                        data: Object.values(storeSums), 
                        backgroundColor: ['#10b981', '#f59e0b', '#64748b', '#111827'], 
                        borderWidth: 0 
                    }] 
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '75%',
                    plugins: { 
                        tooltip: customTooltip, 
                        legend: { position: 'bottom', labels: { font: { family: 'Calibri, sans-serif' }, color: '#475569', padding: 20 } } 
                    }
                }
            });
        };

        watch(activeTab, (newTab) => {
            if (newTab === 'Dashboard') {
                nextTick(() => { drawCharts(); });
            }
        });

        watch(promoCredits, () => {
            if (activeTab.value === 'Dashboard') { drawCharts(); }
        }, { deep: true });

        const groupedPendingReports = computed(() => {
            if (!promoCredits.value) return [];
            let pending = promoCredits.value.filter(c => c && c.site === activeSite.value && (c.status || '').toLowerCase() === 'pending' && c.archived !== true);
            if (activeMonth.value !== 'All') {
                pending = pending.filter(c => c.trackingMonth === activeMonth.value);
            }

            const groups = {};
            pending.forEach(c => {
                const vendorName = c.vendor || 'Unmapped Brand';
                if (!groups[vendorName]) {
                    const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase()) || {};
                    groups[vendorName] = { vendor: vendorName, email: brandInfo.email || '', rep: brandInfo.rep || '', credits: [], total: 0 };
                }
                groups[vendorName].credits.push(c);
                groups[vendorName].total += (parseFloat(c.amount) || 0);
            });
            return Object.values(groups).sort((a, b) => a.vendor.localeCompare(b.vendor));
        });

        // EMAIL DRAFTER WITH DIME COLUMNS, REDDING SUNDIAL SUBJECT, RESTRICTED CC & VARIABLE FIX
                const draftEmail = (report) => {
            if (!report.email) {
                alert(`No email mapped for ${report.vendor}. Please add one in the Brand Directory first.`);
                return;
            }

            const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === (report.vendor || '').toLowerCase()) || {};
            const accessCode = brandInfo.accessCode || 'CONTACT_ACCOUNTING';
            const portalUrl = 'https://portal.rredco.com'; // Placeholder URL

            const storeName = activeSite.value === 'Redding' ? 'Sundial' : activeSite.value;
            const currentYear = new Date().getFullYear();
            const monthStr = report.month || (report.credits[0] && report.credits[0].trackingMonth) || activeMonth.value;
            const periodStr = `${monthStr} ${currentYear}`;
            const cleanStr = (str) => String(str || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

            let csvContent = "Location,Date & Time,Brand,Product Name,Transaction ID,Quantity Sold,Unit Price,Total Before Tax,Discount Title,Discount Amount,Credit Owed,Entry Type\n";
            let csvTotal = 0;

            const matchedRawSales = treesSalesData.value.filter(sale => {
                const brandMatch = cleanStr(sale.brand) === cleanStr(report.vendor);
                const siteMatch = cleanStr(sale.detectedSite) === cleanStr(activeSite.value);
                const monthMatch = cleanStr(sale.month) === cleanStr(monthStr);
                return brandMatch && siteMatch && monthMatch;
            });

            if (matchedRawSales.length > 0) {
                matchedRawSales.forEach(sale => {
                    const safeLoc = `"${String(sale.detectedSite || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(sale.dateClosed || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(sale.brand || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(sale.productName || '').replace(/"/g, '""')}"`;
                    const safeTrack = `"${String(sale.trackingId || '').replace(/"/g, '""')}"`;
                    const safeQty = `"${sale.unitsSold || 0}"`;
                    const safePrice = `"${formatCurrency(sale.unitPrice || 0)}"`;
                    const safePreTax = `"${formatCurrency((sale.unitsSold || 0) * (sale.unitPrice || 0))}"`;
                    const safeDiscTitle = `"${String(sale.discountTitle || '').replace(/"/g, '""')}"`;
                    const safeDiscAmount = `"${formatCurrency(sale.discountAmount || 0)}"`;
                    const safeOwed = `"${formatCurrency(sale.owed || 0)}"`;
                    const safeType = `"POS Itemized"`;
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(sale.owed) || 0;
                });
            }

            report.credits.forEach(c => {
                const isAggregated = c.creditType && String(c.creditType).includes('Aggregated POS Sales');
                if (!isAggregated) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Manual Entry"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                } else if (matchedRawSales.length === 0) {
                    const safeLoc = `"${String(c.site || '').replace(/"/g, '""')}"`;
                    const safeDate = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                    const safeBrand = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                    const safeProd = `"${String(c.creditType || '').replace(/"/g, '""')}"`; 
                    const safeTrack = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                    const safeQty = `"-"`;
                    const safePrice = `"-"`;
                    const safePreTax = `"-"`;
                    const safeDiscTitle = `"-"`;
                    const safeDiscAmount = `"-"`;
                    const safeOwed = `"${formatCurrency(c.amount)}"`;
                    const safeType = `"Summary (Raw Data Missing)"`; 
                    
                    csvContent += `${safeLoc},${safeDate},${safeBrand},${safeProd},${safeTrack},${safeQty},${safePrice},${safePreTax},${safeDiscTitle},${safeDiscAmount},${safeOwed},${safeType}\n`;
                    csvTotal += parseFloat(c.amount) || 0;
                }
            });

            csvContent += `,,,,,,,,,"TOTAL:","${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            
            const cleanVendorName = String(report.vendor || 'Vendor').replace(/[^a-zA-Z0-9]/g, '_');
            const cleanPeriodStr = String(periodStr || '').replace(/\s/g, '_');
            link.setAttribute("download", `${cleanVendorName}_${storeName}_Credits_${cleanPeriodStr}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            const cleanEmails = String(report.email || '').split(/[,;\s]+/).map(e => e.trim()).filter(Boolean).join(',');
            const senderEmail = 'nicholas.grace@rredco.com';
            
            const subjectStoreName = activeSite.value === 'Redding' ? 'Redding Sundial' : activeSite.value;
            const subject = `credit report - ${subjectStoreName} promotions ${periodStr}`;

            let body = `Hello ${report.vendor || 'Vendor'},\n\n`;
            body += `Please see the attached itemized breakdown for vendor credits owed to ${storeName} for ${periodStr}.\n\n`;
            body += `The total amount for this period is ${formatCurrency(csvTotal)}.\n\n`;
            body += `Please review the attached CSV and let us know if you have any questions or when we can expect the credit to be applied to our account.\n\n`;
                        body += `Best regards,\n\n`;
            body += `${storeName} Accounting Team\n`;
            body += `Nicholas Grace (${senderEmail})\n`;
            body += `(530)560-6624 - Office\n\n`;
            
            body += `─────────────────\n`;
            body += `Your Promo Portal Access\n`;
            body += `Portal: ${portalUrl}\n`;
            body += `Email: ${report.email}\n`;
            body += `Access Code: ${accessCode}\n\n`;
            body += `Access historical reports anytime through the portal.\n`;

            const encodedSubject = encodeURIComponent(subject);
            const encodedBody = encodeURIComponent(body);
            const encodedCc = encodeURIComponent(`accounting@rredco.com`);

            window.location.href = `mailto:${cleanEmails}?cc=${encodedCc}&subject=${encodedSubject}&body=${encodedBody}`;
        };

        const archiveAndExportAnnualReport = async () => {
            const creditsToArchive = promoCredits.value.filter(c => 
                (c.status === 'Applied' || c.status === 'Uncollectable') && c.archived !== true
            );

            if (creditsToArchive.length === 0) {
                alert("There are no resolved credits to archive! (Pending credits cannot be archived).");
                return;
            }

            if (!confirm(`You are about to export and archive ${creditsToArchive.length} resolved credits. They will be removed from your active tracker. Proceed?`)) {
                return;
            }

            let csvContent = "Site,Tracking Month,Vendor,Distributor,Credit Type,Dates,Credit Amount,Date Requested,Date Received,Invoice,Status,Archived Date\n";
            let csvTotal = 0;
            
            creditsToArchive.forEach(c => {
                const safeSite = `"${String(c.site || '').replace(/"/g, '""')}"`;
                const safeMonth = `"${String(c.trackingMonth || '').replace(/"/g, '""')}"`;
                const safeVendor = `"${String(c.vendor || '').replace(/"/g, '""')}"`;
                const safeDist = `"${String(c.distributor || '').replace(/"/g, '""')}"`;
                const safeType = `"${String(c.creditType || '').replace(/"/g, '""')}"`;
                const safeDates = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                const safeAmount = `"${formatCurrency(c.amount)}"`;
                const safeReq = `"${String(c.dateRequested || '').replace(/"/g, '""')}"`;
                const safeRec = `"${String(c.dateReceived || '').replace(/"/g, '""')}"`;
                const safeInvoice = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                const safeStatus = `"${String(c.status || '').replace(/"/g, '""')}"`;
                const archiveDate = `"${new Date().toLocaleDateString()}"`;
                
                csvContent += `${safeSite},${safeMonth},${safeVendor},${safeDist},${safeType},${safeDates},${safeAmount},${safeReq},${safeRec},${safeInvoice},${safeStatus},${archiveDate}\n`;
                csvTotal += parseFloat(c.amount) || 0;
            });

            csvContent += `,,,,,"TOTAL:","${formatCurrency(csvTotal)}"\n`;

            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            link.setAttribute("download", `Master_Annual_Report_${currentYear}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            try {
                const batch = writeBatch(db);
                creditsToArchive.forEach(c => {
                    const docRef = doc(db, "promoCredits", c.id);
                    batch.update(docRef, { archived: true, archivedAt: Date.now() });
                });
                await batch.commit();
                
                logSystemAction("ARCHIVE", `Archived & Exported ${creditsToArchive.length} records totaling ${formatCurrency(csvTotal)}`);
                
                alert(`Success! Master spreadsheet downloaded and ${creditsToArchive.length} records safely archived.`);
            } catch (error) {
                console.error("Archive Error:", error);
                alert("Failed to archive records in the cloud.");
            }
        };

        const exportVendorsAndBrandsCSV = () => {
            if (!masterBrands.value || masterBrands.value.length === 0) {
                alert("No brands available to export.");
                return;
            }

            // Group brands by distributor (Vendor)
            const grouped = {};
            masterBrands.value.forEach(b => {
                const distro = b.distributor ? b.distributor.trim() : 'Unassigned Vendor';
                const brand = b.vendor ? b.vendor.trim() : 'Unknown Brand';

                if (!grouped[distro]) {
                    grouped[distro] = [];
                }
                grouped[distro].push(brand);
            });

            // Sort the distributors alphabetically
            const sortedDistros = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

            // Create CSV headers
            let csvContent = "Vendor/Distributor,Attached Brand\n";

            // Populate rows
            sortedDistros.forEach(distro => {
                const sortedBrands = grouped[distro].sort((a, b) => a.localeCompare(b));
                
                sortedBrands.forEach(brand => {
                    const safeDistro = `"${distro.replace(/"/g, '""')}"`;
                    const safeBrand = `"${brand.replace(/"/g, '""')}"`;
                    csvContent += `${safeDistro},${safeBrand}\n`;
                });
            });

            // Trigger download
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            const currentYear = new Date().getFullYear();
            link.setAttribute("download", `Vendors_and_Brands_Directory_${currentYear}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 150);

            logSystemAction("EXPORT", "Downloaded Vendors and Brands Directory CSV");
        };

        const showImportModal = ref(false);
        const rawPasteData = ref('');
        const pastedGrid = ref([]);
        const mappedHeaders = ref([]);
        
        const showBrandImportModal = ref(false);
        const brandPasteData = ref('');
        const brandPastedGrid = ref([]);
        const brandMappedHeaders = ref([]);
                const brandAvailableHeaders = ref([
            '-- Ignore Column --', 'Brand', 'Rep', 'Email', 'Access Code', 'Name as appears in TREES',
            'Distro', 'Asset Library', 'Order From', 'Payee', 'Notes'
        ]);
        
        const availableHeaders = ref([
            '-- Ignore Column --', 'Tracking Month', 'Vendor', 'Distributor', 'Credit Type',
            'Dates', 'Credit amount $$$', 'Date requested', 'Date received', 'Invoice / Credit Memo', 'Status'
        ]);
        
        const getEmptyForm = () => ({ 
            trackingMonth: activeMonth.value === 'All' ? 'August' : activeMonth.value,
            vendor: '', distributor: '', creditType: '', dates: '', 
            amount: '', dateRequested: '', dateReceived: '', 
            invoice: '', status: 'Pending', attachmentName: '', attachmentData: null 
        });
        
        const form = ref(getEmptyForm());
        let unsubscribeBrands = null;

                onMounted(() => {
            refreshIcons();

            onAuthStateChanged(auth, (user) => {
                showImportModal.value = false;
                showBrandImportModal.value = false;

                if (!user) {
                    isManagerUnlocked.value = false;
                    isBrandUnlocked.value = false;
                    loggedInUser.value = '';
                    return;
                }

                const userEmail = user.email.toLowerCase();
                const managerData = systemUsers[userEmail];

                if (managerData && managerData.active) {
                    // Only unlock Manager view if we aren't currently in a Brand Portal session
                    if (!isBrandUnlocked.value) {
                        loggedInUser.value = managerData.name;
                        activeSite.value = managerData.access[0];
                        isManagerUnlocked.value = true;
                    }

                    isSuperAdmin.value = managerData.superAdmin || false;
                    
                    unsubscribeBrands = onSnapshot(collection(db, "brands"), (snapshot) => {
                        const fetchedBrands = [];
                        snapshot.forEach(docSnap => { fetchedBrands.push({ id: docSnap.id, ...docSnap.data() }); });
                        fetchedBrands.sort((a, b) => (a.vendor || '').localeCompare(b.vendor || ''));
                        masterBrands.value = fetchedBrands;
                    });

                    onSnapshot(collection(db, "treesSales"), (snapshot) => {
                        const fetchedSales = [];
                        snapshot.forEach(docSnap => { fetchedSales.push({ id: docSnap.id, ...docSnap.data() }); });
                        treesSalesData.value = fetchedSales;
                    });

                    onSnapshot(collection(db, "promoCredits"), (snapshot) => {
                        const fetchedCredits = [];
                        snapshot.forEach(docSnap => { fetchedCredits.push({ id: docSnap.id, ...docSnap.data() }); });
                        promoCredits.value = fetchedCredits;
                    });

                                        if (managerData.superAdmin) {
                        onSnapshot(collection(db, "systemLogs"), (snapshot) => {
                            const logs = [];
                            snapshot.forEach(docSnap => { logs.push({ id: docSnap.id, ...docSnap.data() }); });
                            logs.sort((a, b) => b.timestamp - a.timestamp);
                            systemLogs.value = logs;
                        });
                    }

                                        // Sprint 2: Listen for published reports
                    onSnapshot(collection(db, "reports"), (snapshot) => {
                        const reports = [];
                        snapshot.forEach(docSnap => reports.push({ id: docSnap.id, ...docSnap.data() }));
                        publishedReports.value = reports;
                    });

                    // Sprint 7: Listen for incoming credit requests from brands
                    onSnapshot(collection(db, "creditRequests"), (snapshot) => {
                        const reqs = [];
                        snapshot.forEach(docSnap => reqs.push({ id: docSnap.id, ...docSnap.data() }));
                        creditRequests.value = reqs.sort((a, b) => b.createdAt - a.createdAt);
                    });


                }
            });
        });

                const handleLogin = () => {
            authError.value = '';
            signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
                .then(() => { emailInput.value = ''; passwordInput.value = ''; refreshIcons(); })
                .catch((error) => { authError.value = "Invalid email or password."; });
        };

                const handleBrandLogin = () => {
            brandAuthError.value = '';
            const email = brandEmailInput.value.trim().toLowerCase();
            const codeOrPass = brandCodeInput.value.trim();

            if (!email || !codeOrPass) {
                brandAuthError.value = "Email and Password/Code are required.";
                return;
            }

            // 1. Check if user is an Employee/Admin trying to access Brand Portal
            if (systemUsers[email]) {
                signInWithEmailAndPassword(auth, email, codeOrPass)
                    .then(() => {
                        isPreviewMode.value = true;
                        isBrandUnlocked.value = true;
                        if (masterBrands.value.length > 0) activeBrand.value = masterBrands.value[0];
                        logSystemAction("LOGIN", `Admin viewing Brand Portal: ${email}`);
                        refreshIcons();
                    })
                    .catch((err) => {
                        brandAuthError.value = "Invalid Admin Password.";
                    });
                return;
            }

            // 2. Regular Brand Login
            const matched = masterBrands.value.find(b => 
                b.email && b.email.toLowerCase().split(/[,;\s]+/).includes(email) &&
                b.accessCode === codeOrPass
            );

            if (matched) {
                isPreviewMode.value = false;
                activeBrand.value = matched;
                isBrandUnlocked.value = true;
                logSystemAction("LOGIN", `Brand Partner Login: ${matched.vendor}`);
                refreshIcons();
            } else {
                brandAuthError.value = "Access Denied. Check email and code.";
            }
        };

                const forceLock = () => { 
            signOut(auth).then(() => { 
                isManagerUnlocked.value = false; 
                isBrandUnlocked.value = false;
                isPreviewMode.value = false;
                selectedRole.value = null;
                activeBrand.value = null;
                loggedInUser.value = ''; 
            }); 
        };

        const filteredBrands = computed(() => {
            const query = (form.value.vendor || '').toLowerCase();
            if (!query) return masterBrands.value;
            return masterBrands.value.filter(b => (b.vendor || '').toLowerCase().includes(query));
        });

        const selectBrand = (brand) => {
            form.value.vendor = brand.vendor;
            form.value.distributor = brand.distributor;
            showBrandDropdown.value = false;
        };

        const formatCurrency = (val) => {
            const num = parseFloat(val);
            if (isNaN(num)) return '$0.00';
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
        };
        
        const detectMonthFromDate = (dateString) => {
            if (!dateString) return 'Unknown';
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return 'Unknown';
            return calendarMonths[d.getMonth()];
        };

        const detectSiteFromName = (storeNameStr) => {
            if (!storeNameStr) return activeSite.value; 
            const s = storeNameStr.toLowerCase();
            if (s.includes('red bluff') || s.includes('redbluff')) return 'Red Bluff';
            if (s.includes('redding') || s.includes('sundial')) return 'Redding';
            return activeSite.value; 
        };

        const filteredCredits = computed(() => {
            let base = promoCredits.value.filter(c => c && c.site === activeSite.value && c.archived !== true);
            if (activeMonth.value !== 'All') base = base.filter(c => c.trackingMonth === activeMonth.value);
            if (searchQuery.value.trim() !== '') {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(c => 
                    ((c.vendor || '').toLowerCase().includes(q)) ||
                    ((c.distributor || '').toLowerCase().includes(q)) ||
                    ((c.invoice || '').toLowerCase().includes(q)) ||
                    ((c.creditType || '').toLowerCase().includes(q))
                );
            }
            return base.map(c => {
                const isMapped = masterBrands.value.some(b => (b.vendor || '').toLowerCase() === (c.vendor || '').toLowerCase());
                return { ...c, needsMapping: !isMapped };
            });
        });

        const filteredTreesSalesData = computed(() => {
            let base = treesSalesData.value; 
            if (activeMonth.value !== 'All') base = base.filter(sale => sale.month === activeMonth.value);
            if (searchQuery.value.trim() !== '') {
                const q = searchQuery.value.toLowerCase();
                base = base.filter(sale => 
                    ((sale.brand || '').toLowerCase().includes(q)) ||
                    ((sale.productName || '').toLowerCase().includes(q)) ||
                    ((sale.discountTitle || '').toLowerCase().includes(q)) ||
                    ((sale.trackingId || '').toLowerCase().includes(q)) ||
                    ((sale.detectedSite || '').toLowerCase().includes(q))
                );
            }
            return base;
        });

        const displayTreesSalesData = computed(() => filteredTreesSalesData.value.slice(0, 100));
        
        const totalPending = computed(() => filteredCredits.value.filter(c => c.status === 'Pending').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));
        const totalApplied = computed(() => filteredCredits.value.filter(c => c.status === 'Applied').reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0));
        
        const unsyncedSalesCount = computed(() => filteredTreesSalesData.value.filter(s => s.status === 'Unsynced').length);

        const openPromoModal = () => { form.value = getEmptyForm(); editingId.value = null; showPromoModal.value = true; refreshIcons(); };
        const closePromoModal = () => { showPromoModal.value = false; showBrandDropdown.value = false; };

        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (file.size > 800000) return alert("File is too large. Please keep attachments under 800KB.");
            form.value.attachmentName = file.name;
            form.value.attachmentData = "mock_file_data"; 
        };

        const saveCredit = async () => {
            if (!form.value.vendor) return alert("Vendor (Brand) is required.");
            if (!form.value.trackingMonth) return alert("Tracking Month is required.");
            const payload = { ...form.value, site: activeSite.value, createdAt: Date.now() };
            try {
                if (editingId.value) await updateDoc(doc(db, "promoCredits", editingId.value), payload);
                else await addDoc(collection(db, "promoCredits"), payload);
                closePromoModal();
            } catch (error) { alert("Failed to save to Firebase."); }
        };

        const editCredit = (credit) => { form.value = { ...credit }; editingId.value = credit.id; showPromoModal.value = true; refreshIcons(); };
        const deleteCredit = async () => {
            if (confirm("Are you sure you want to permanently delete this credit?")) {
                try { await deleteDoc(doc(db, "promoCredits", editingId.value)); closePromoModal(); } 
                catch (error) { console.error("Error deleting:", error); }
            }
        };
        
        const openImportModal = () => { resetImport(); showImportModal.value = true; refreshIcons(); };
        const closeImportModal = () => { showImportModal.value = false; };
        const resetImport = () => { pastedGrid.value = []; mappedHeaders.value = []; rawPasteData.value = ''; };

        const displayGrid = computed(() => {
            if (pastedGrid.value.length === 0) return [];
            return pastedGrid.value.slice(2, 22);
        });
        
        const detectMonthInString = (str) => {
            if (!str) return null;
            const cleanStr = str.toLowerCase();
            return calendarMonths.find(m => cleanStr.includes(m.toLowerCase())) || null;
        };

        const processRawPaste = () => {
            const text = rawPasteData.value;
            if (!text.trim()) return;
            const rows = text.split('\n').filter(r => r.trim() !== '');
            const grid = rows.map(r => r.split('\t').map(c => c.trim()));
            if (grid.length < 3) return; 
            pastedGrid.value = grid;
            mappedHeaders.value = grid[1].map(cell => {
                const lowerCell = cell.toLowerCase();
                const match = availableHeaders.value.find(h => h !== '-- Ignore Column --' && lowerCell.includes(h.toLowerCase()));
                return match || '-- Ignore Column --';
            });
        };

        const headerToFormKey = {
            'Tracking Month': 'trackingMonth', 'Vendor': 'vendor', 'Distributor': 'distributor',
            'Credit Type': 'creditType', 'Dates': 'dates', 'Credit amount $$$': 'amount',
            'Date requested': 'dateRequested', 'Date received': 'dateReceived',
            'Invoice / Credit Memo': 'invoice', 'Status': 'status'
        };

        const processImport = async () => {
            let importedCount = 0;
            const superHeaders = pastedGrid.value[0];
                        let batch = writeBatch(db); 
            let batchCount = 0;
            
            for (let r = 2; r < pastedGrid.value.length; r++) {
                const row = pastedGrid.value[r];
                let currentCredit = getEmptyForm();
                let hasData = false;
                let seenHeadersInChunk = new Set();
                let currentChunkMonth = 'Unknown';
                
                for (let c = 0; c < row.length; c++) {
                    const detectedMonth = detectMonthInString(superHeaders[c]);
                    if (detectedMonth) currentChunkMonth = detectedMonth;

                    const header = mappedHeaders.value[c];
                    if (header === '-- Ignore Column --') continue;
                    
                    if (seenHeadersInChunk.has(header)) {
                        if (hasData && currentCredit.vendor) {
                            currentCredit.site = activeSite.value;
                            currentCredit.trackingMonth = currentChunkMonth !== 'Unknown' ? currentChunkMonth : (activeMonth.value === 'All' ? 'August' : activeMonth.value);
                            currentCredit.amount = parseFloat(String(currentCredit.amount).replace(/[^0-9.-]+/g,"")) || 0;
                            currentCredit.createdAt = Date.now();
                            const newDocRef = doc(collection(db, "promoCredits"));
                            batch.set(newDocRef, currentCredit);
                            importedCount++;
                            batchCount++;
                            
                            if (batchCount >= 400) {
                                await batch.commit();
                                batch = writeBatch(db);
                                batchCount = 0;
                            }
                        }
                        currentCredit = getEmptyForm();
                        hasData = false;
                        seenHeadersInChunk.clear();
                    }
                    
                    const val = row[c];
                    if (val) hasData = true;
                    
                    const key = headerToFormKey[header];
                    if (key) {
                        currentCredit[key] = val;
                        seenHeadersInChunk.add(header);
                        if (key === 'vendor' && val) {
                            if (!masterBrands.value.find(b => (b.vendor || '').toLowerCase() === val.toLowerCase())) {
                                const newBrandRef = doc(collection(db, "brands"));
                                batch.set(newBrandRef, { vendor: val, distributor: 'Auto-Imported' });
                                batchCount++;
                                
                                if (batchCount >= 400) {
                                    await batch.commit();
                                    batch = writeBatch(db);
                                    batchCount = 0;
                                }
                            }
                        }
                    }
                }
                
                if (hasData && currentCredit.vendor) {
                    currentCredit.site = activeSite.value;
                    currentCredit.trackingMonth = currentChunkMonth !== 'Unknown' ? currentChunkMonth : (activeMonth.value === 'All' ? 'August' : activeMonth.value);
                    currentCredit.amount = parseFloat(String(currentCredit.amount).replace(/[^0-9.-]+/g,"")) || 0;
                    currentCredit.createdAt = Date.now();
                    const newDocRef = doc(collection(db, "promoCredits"));
                    batch.set(newDocRef, currentCredit);
                    importedCount++;
                    batchCount++;
                    
                    if (batchCount >= 400) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchCount = 0;
                    }
                }
            }
            
            try {
                if (batchCount > 0) {
                    await batch.commit();
                }
                alert(`Successfully extracted and saved ${importedCount} promo credits to Firebase!`);
                closeImportModal();
                refreshIcons();
            } catch (err) { alert("Failed to save import to cloud."); }
        };

        const regenerateBrandSummary = async (brandReport) => {
            if (!confirm(`This will delete current aggregated summaries for ${brandReport.vendor} in ${brandReport.month} and re-calculate them from raw sales data. Continue?`)) return;
            await runRegeneration([brandReport], brandReport.month);
        };

        const regenerateMonthReports = async (monthGroup) => {
            if (!confirm(`This will re-calculate summaries for ALL brands in ${monthGroup.month}. This ensures all reports use the latest itemized data. Proceed?`)) return;
            await runRegeneration(monthGroup.brandList, monthGroup.month);
        };

        const runRegeneration = async (brandList, month) => {
            try {
                const batch = writeBatch(db);
                let workFound = false;

                for (const brand of brandList) {
                    const existingAggregated = promoCredits.value.filter(c => 
                        c.site === activeSite.value && 
                        c.trackingMonth === month && 
                        (c.vendor || '').toLowerCase() === (brand.vendor || '').toLowerCase() &&
                        c.creditType && String(c.creditType).includes('Aggregated POS Sales')
                    );
            
                    existingAggregated.forEach(c => {
                        batch.delete(doc(db, "promoCredits", c.id));
                        workFound = true;
                    });

                    const relevantSales = treesSalesData.value.filter(sale => 
                        sale.detectedSite === activeSite.value &&
                        sale.month === month &&
                        (sale.brand || '').toLowerCase() === (brand.vendor || '').toLowerCase()
                    );

                    relevantSales.forEach(sale => {
                        batch.update(doc(db, "treesSales", sale.id), { status: 'Unsynced' });
                        workFound = true;
                    });
                }

                if (workFound) {
                    await batch.commit();
                    setTimeout(async () => {
                        await pushToMainTracker();
                        logSystemAction("UPDATE", `Regenerated reports for ${month} (${brandList.length} brands)`);
                    }, 800);
                } else {
                    alert("No automated POS credits found to regenerate for this selection.");
                }
            } catch (err) {
                console.error(err);
                alert("Failed to regenerate reports.");
            }
        };

        const handleTreesCsvUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                                        const text = evt.target.result;

                    const parseCSV = (str) => {
                        const result = [];
                        let row = [];
                        let cell = '';
                        let inQuotes = false;
                        for (let i = 0; i < str.length; i++) {
                            const char = str[i];
                            const nextChar = str[i+1];
                            if (char === '"') { 
                                if (inQuotes && nextChar === '"') {
                                    cell += '"';
                                    i++;
                                } else {
                                    inQuotes = !inQuotes; 
                                }
                            } 
                            else if (char === ',' && !inQuotes) { row.push(cell.trim()); cell = ''; } 
                            else if (char === '\n' && !inQuotes) {
                                row.push(cell.trim());
                                result.push(row);
                                row = [];
                                cell = '';
                            }
                            else if (char === '\r' && !inQuotes) {
                                if (nextChar === '\n') { i++; }
                                row.push(cell.trim());
                                result.push(row);
                                row = [];
                                cell = '';
                            }
                            else { cell += char; }
                        }
                        if (cell || row.length > 0) {
                            row.push(cell.trim());
                            result.push(row);
                        }
                        return result;
                    };

                    const parsedRows = parseCSV(text);
                    if (parsedRows.length < 2) return alert("File is empty or invalid.");

                    let headerIdx = 0;
                    let headers = [];
                    for (let i = 0; i < parsedRows.length; i++) {
                        const cols = parsedRows[i];
                        if (cols.some(c => c.toLowerCase().includes('product brand') || c.toLowerCase().includes('vendor credit owed'))) {
                            headerIdx = i;
                            headers = cols.map(h => h.replace(/["']/g, '').trim());
                            break;
                        }
                    }

                    const getVal = (rowObj, ...keys) => {
                        for (const key of keys) {
                            const foundKey = Object.keys(rowObj).find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
                            if (foundKey && rowObj[foundKey] !== undefined) return rowObj[foundKey];
                        }
                        return '';
                    };

                    let batch = writeBatch(db);
                    let count = 0;

                    for (let i = headerIdx + 1; i < parsedRows.length; i++) {
                        const cols = parsedRows[i];
                        if (cols.length === 0 || (cols.length === 1 && !cols[0].trim())) continue;
                        const rowObj = {};
                        headers.forEach((h, idx) => { rowObj[h] = cols[idx] ? cols[idx].replace(/["']/g, '') : ''; });

                        const brandVal = getVal(rowObj, 'Product Brand', 'Brand');
                        const trackingVal = getVal(rowObj, 'State Tracking Id', 'Tracking Id');

                        if (!brandVal && !trackingVal) continue;

                        const dateStr = getVal(rowObj, 'Date Closed', 'Date');
                        const parsedMonth = detectMonthFromDate(dateStr) !== 'Unknown' ? detectMonthFromDate(dateStr) : 'August';
                        const storeString = getVal(rowObj, 'Store Name', 'Location');
                        const detectedSite = detectSiteFromName(storeString);

                        const units = parseFloat(getVal(rowObj, 'Units Sold', 'Unit Sold', 'Qty', 'Quantity')) || 0;
                        const unitPrice = parseFloat(String(getVal(rowObj, 'Cost Per Unit', 'Unit Price', 'Price')).replace(/[^0-9.-]+/g,"")) || 0;
                        const discAmt = parseFloat(String(getVal(rowObj, 'Discounts', 'Discount Amount', 'Discount')).replace(/[^0-9.-]+/g,"")) || 0;
                        const owedAmt = parseFloat(String(getVal(rowObj, 'Vendor Credit Owed', 'Credit Owed')).replace(/[^0-9.-]+/g,"")) || 0;

                        const newSale = {
                            month: parsedMonth, 
                            brand: brandVal || 'Unknown Brand',
                            discountTitle: getVal(rowObj, 'Discount Title', 'Discount Name') || '',
                            dateClosed: dateStr,
                            storeName: storeString,
                            detectedSite: detectedSite,
                            productName: getVal(rowObj, 'Product Name', 'Product') || '',
                            owed: owedAmt,
                            trackingId: trackingVal || '',
                            unitsSold: units,
                            unitPrice: unitPrice,
                            discountAmount: discAmt,
                            status: 'Unsynced',
                            uploadedAt: Date.now()
                        };

                        const newDocRef = doc(collection(db, "treesSales"));
                        batch.set(newDocRef, newSale);
                        count++;

                        if (count % 400 === 0) {
                            await batch.commit();
                            batch = writeBatch(db);
                        }
                    }

                    if (count % 400 !== 0) {
                        await batch.commit();
                    }
                    logSystemAction("IMPORT", `Uploaded ${count} raw sales items from Trees CSV`);
                    alert(`Successfully uploaded ${count} sales items to the cloud!`);
                    e.target.value = ''; 
                } catch (error) { 
                    console.error(error);
                    alert("Error parsing CSV or uploading to cloud."); 
                }
            };
            reader.readAsText(file); 
        };

        const pushToMainTracker = async () => {
            const groupedBrands = {};
            const recordsToSync = treesSalesData.value.filter(s => s.status === 'Unsynced');
            
            if (recordsToSync.length === 0) return alert("No unsynced sales data found.");

            recordsToSync.forEach(sale => {
                const uniqueKey = `${sale.detectedSite}___${sale.brand}___${sale.month}`;
                if (!groupedBrands[uniqueKey]) {
                    groupedBrands[uniqueKey] = { site: sale.detectedSite, brand: sale.brand, month: sale.month, totalOwed: 0, itemCount: 0, salesItems: [] };
                }
                groupedBrands[uniqueKey].totalOwed += sale.owed;
                groupedBrands[uniqueKey].itemCount += 1;
                groupedBrands[uniqueKey].salesItems.push(sale.id);
            });

            let creditsCreated = 0;
                        let batch = writeBatch(db); 
            let batchCount = 0;
            
            for (const [key, data] of Object.entries(groupedBrands)) {
                if (data.totalOwed > 0) {
                    const masterRecord = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === data.brand.toLowerCase());
                    const payload = {
                        site: data.site, 
                        trackingMonth: data.month, 
                        vendor: data.brand,
                        distributor: (masterRecord && masterRecord.distributor) ? masterRecord.distributor : '', 
                        creditType: `Aggregated POS Sales (${data.itemCount} items)`,
                        dates: new Date().toLocaleDateString(),
                        amount: data.totalOwed,
                        dateRequested: new Date().toLocaleDateString(),
                        dateReceived: '',
                        invoice: 'CSV-AUTO-SYNC',
                        status: 'Pending',
                        createdAt: Date.now()
                    };
                    const newDocRef = doc(collection(db, "promoCredits"));
                    batch.set(newDocRef, payload);
                    creditsCreated++;
                    batchCount++;

                    data.salesItems.forEach(saleId => {
                        const saleRef = doc(db, "treesSales", saleId);
                        batch.update(saleRef, { status: 'Synced' });
                        batchCount++;
                    });
                    
                    if (batchCount >= 400) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchCount = 0;
                    }
                }
            }
            
            try {
                if (batchCount > 0) {
                    await batch.commit();
                }
                logSystemAction("UPDATE", `Synced and aggregated ${creditsCreated} vendor credits`);
                alert(`Success! Aggregated ${creditsCreated} vendor credits and pushed them to Firebase.`);
                activeTab.value = 'Tracker'; 
            } catch (err) { 
                console.error(err);
                alert("Failed to sync aggregated credits to the cloud."); 
            }
        };

        const resetBrandImport = () => {
            brandPastedGrid.value = [];
            brandMappedHeaders.value = [];
            brandPasteData.value = '';
        };

                const processBrandRawPaste = () => {
            const text = brandPasteData.value;
            if (!text.trim()) return;
            const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
            const grid = rows.map(r => r.split('\t').map(c => c.trim()));
            if (grid.length === 0) return;
            
            brandPastedGrid.value = grid;
            
            const firstRow = grid[0].map(c => c.toLowerCase());
            brandMappedHeaders.value = firstRow.map(cell => {
                if (cell.includes('brand') || cell.includes('vendor')) return 'Brand';
                if (cell.includes('rep')) return 'Rep';
                if (cell.includes('email')) return 'Email';
                if (cell.includes('code')) return 'Access Code';
                if (cell.includes('trees')) return 'Name as appears in TREES';
                if (cell.includes('distro')) return 'Distro';
                if (cell.includes('asset')) return 'Asset Library';
                if (cell.includes('order')) return 'Order From';
                if (cell.includes('payee')) return 'Payee';
                if (cell.includes('note')) return 'Notes';
                return '-- Ignore Column --';
            });
        };

        const processBrandImport = async () => {
            let updatedCount = 0;
            let newCount = 0;
            
                        let startRow = 0;
            if (brandPastedGrid.value.length > 0) {
                const firstRowStr = brandPastedGrid.value[0].join('').toLowerCase();
                if (firstRowStr.includes('brand') && (firstRowStr.includes('email') || firstRowStr.includes('rep') || firstRowStr.includes('distro'))) {
                    startRow = 1;
                }
            }
            
            let batch = writeBatch(db);
            let batchCount = 0;

            for (let r = startRow; r < brandPastedGrid.value.length; r++) {
                const row = brandPastedGrid.value[r];
                let currentBrand = {};
                
                for (let c = 0; c < row.length; c++) {
                    const header = brandMappedHeaders.value[c];
                    if (header === '-- Ignore Column --') continue;
                    currentBrand[header] = row[c] || '';
                }
                
                const vendorName = currentBrand['Brand'];
                if (!vendorName || vendorName.length <= 1) continue; 
                
                const existingBrand = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === vendorName.toLowerCase());
                
                                const payload = {};
                if (currentBrand['Rep'] !== undefined) payload.rep = currentBrand['Rep'];
                if (currentBrand['Email'] !== undefined) payload.email = currentBrand['Email'];
                if (currentBrand['Access Code'] !== undefined) payload.accessCode = currentBrand['Access Code'];
                if (currentBrand['Name as appears in TREES'] !== undefined) payload.treesName = currentBrand['Name as appears in TREES'];
                if (currentBrand['Distro'] !== undefined) payload.distributor = currentBrand['Distro'];
                if (currentBrand['Asset Library'] !== undefined) payload.assetLibrary = currentBrand['Asset Library'];
                if (currentBrand['Order From'] !== undefined) payload.orderFrom = currentBrand['Order From'];
                if (currentBrand['Payee'] !== undefined) payload.payee = currentBrand['Payee'];
                if (currentBrand['Notes'] !== undefined) payload.notes = currentBrand['Notes'];

                if (existingBrand) {
                    if (Object.keys(payload).length > 0) {
                        batch.update(doc(db, "brands", existingBrand.id), payload);
                        updatedCount++;
                        batchCount++;
                    }
                } else {
                    payload.vendor = vendorName;
                    const newDocRef = doc(collection(db, "brands"));
                    batch.set(newDocRef, payload);
                    newCount++;
                    batchCount++;
                }
                
                if (batchCount >= 400) {
                    await batch.commit();
                    batch = writeBatch(db);
                    batchCount = 0;
                }
            }
            
            try {
                if (batchCount > 0) {
                    await batch.commit();
                }
                alert(`Success! Added ${newCount} new brands and updated ${updatedCount} existing entries in the cloud.`);
                resetBrandImport();
                showBrandImportModal.value = false;
            } catch (error) {
                console.error("Import error:", error);
                alert("Failed to save imported brands to the cloud.");
            }
        };

        const isSuperAdmin = ref(false);
        const systemLogs = ref([]);

        const refreshIcons = () => {
            nextTick(() => {
                if (window.lucide) window.lucide.createIcons();
            });
        };

        const clearAllSalesData = async () => {
            if (confirm("Are you sure you want to permanently delete ALL raw sales data from the cloud? This cannot be undone.")) {
                try {
                    const batch = writeBatch(db);
                    treesSalesData.value.forEach(sale => {
                        batch.delete(doc(db, "treesSales", sale.id));
                    });
                    await batch.commit();
                    logSystemAction("DELETE", "Cleared all raw sales data");
                    alert("All raw sales data has been cleared.");
                } catch (error) {
                    console.error("Error clearing sales data:", error);
                    alert("Failed to clear sales data.");
                }
            }
        };
        
                const openDimeHelper = async (brand) => {
            // ... existing code ...
        };

        // SPRINT 2: ADMIN REPORT PUBLISHING
        const isPublishing = ref(false);
                const publishReport = async (report) => {
            if (isPublishing.value) return;
            
            const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === (report.vendor || '').toLowerCase());
            if (!brandInfo) return alert("Cannot publish: Brand not found in directory.");
            
            const reportMonth = report.month || activeMonth.value;
            const confirmMsg = `Publish ${report.vendor} report for ${reportMonth} to the Brand Portal?`;
            
            if (!confirm(confirmMsg)) return;
            
            await executePublish(report, brandInfo, reportMonth);
        };

        const pushMonthToBrands = async (monthGroup) => {
            if (isPublishing.value) return;
            const targets = monthGroup.brandList.filter(b => !isReportPublished(b, monthGroup.month));
            
            if (targets.length === 0) return alert("All brands for this month are already published.");
            
            if (!confirm(`This will publish itemized reports to the Brand Portal for ALL ${targets.length} brands in ${monthGroup.month}. Proceed?`)) return;
            
            isPublishing.value = true;
            let successCount = 0;
            
            for (const brand of targets) {
                const brandInfo = masterBrands.value.find(b => (b.vendor || '').toLowerCase() === (brand.vendor || '').toLowerCase());
                if (brandInfo) {
                    try {
                        await executePublish(brand, brandInfo, monthGroup.month, false);
                        successCount++;
                    } catch (e) { console.error(`Failed to publish ${brand.vendor}`, e); }
                }
            }
            
            isPublishing.value = false;
            alert(`Successfully published ${successCount} reports to the Brand Portal.`);
            logSystemAction(AUDIT_ACTIONS.REPORT_PUBLISHED, `Bulk published ${successCount} reports for ${monthGroup.month}`);
        };

        const executePublish = async (report, brandInfo, reportMonth, showSuccess = true) => {
            try {
                if (!isPublishing.value) isPublishing.value = true;
                
                const reportId = `${report.vendor}_${reportMonth}_${activeSite.value}`.replace(/\s+/g, '_');
                const reportData = {
                    brandId: brandInfo.id,
                    vendorName: report.vendor,
                    month: reportMonth,
                    year: new Date().getFullYear(),
                    site: activeSite.value,
                    totalAmount: report.total,
                    publishedAt: Date.now(),
                    publishedBy: loggedInUser.value,
                    status: 'published'
                };

                await setDoc(doc(db, "reports", reportId), reportData);
                
                if (showSuccess) {
                    await logSystemAction(AUDIT_ACTIONS.REPORT_PUBLISHED, `Published report for ${report.vendor} (${reportMonth})`);
                    alert(`Success! Report published to portal for ${report.vendor}.`);
                }
            } catch (error) {
                console.error("Publish Error:", error);
                if (showSuccess) alert("Failed to publish report.");
                throw error;
            } finally {
                if (showSuccess) isPublishing.value = false;
            }
        };


                const isReportPublished = (brand, month) => {
            return publishedReports.value.some(r => 
                r.vendorName === brand.vendor && 
                r.month === month && 
                r.site === activeSite.value
            );
        };

        // SPRINT 7: ADMIN RECONCILIATION & WORKFLOW
        const updateRequestStatus = async (request, newStatusId) => {
            try {
                const oldStatus = request.statusId;
                await updateDoc(doc(db, "creditRequests", request.id), {
                    statusId: newStatusId,
                    updatedAt: Date.now()
                });
                
                await logSystemAction(AUDIT_ACTIONS.STATUS_CHANGE, {
                    requestId: request.requestId,
                    from: oldStatus,
                    to: newStatusId
                });
            } catch (error) {
                console.error("Error updating status:", error);
                alert("Failed to update status.");
            }
        };

        const reconcileRequest = async (request, reconData) => {
            try {
                await updateDoc(doc(db, "creditRequests", request.id), {
                    ...reconData,
                    statusId: 'APPLIED',
                    updatedAt: Date.now()
                });
                
                await logSystemAction(AUDIT_ACTIONS.STATUS_CHANGE, `Reconciled & Applied Request ${request.requestId}`);
                alert("Request successfully reconciled and closed.");
            } catch (error) {
                console.error("Reconciliation Error:", error);
                alert("Failed to reconcile.");
            }
        };

        const getStatusDisplayName = (statusId) => {
            const status = STATUS_DEFINITIONS.find(s => s.id === statusId);
            return status ? status.displayName : statusId;
        };

        const getStatusColor = (statusId) => {
            const status = STATUS_DEFINITIONS.find(s => s.id === statusId);
            return status ? status.color : '#94a3b8';
        };


                const brandCredits = computed(() => {

                    if (!activeBrand.value) return [];
                    let base = promoCredits.value.filter(c => 
                        (c.vendor || '').toLowerCase() === (activeBrand.value.vendor || '').toLowerCase()
                    );

                    // Apply Brand Portal Filters
                    if (brandFilters.value.month !== 'All') {
                        base = base.filter(c => c.trackingMonth === brandFilters.value.month);
                    }
                    if (brandFilters.value.site !== 'All') {
                        base = base.filter(c => c.site === brandFilters.value.site);
                    }
                    if (brandFilters.value.status !== 'All') {
                        base = base.filter(c => c.status === brandFilters.value.status);
                    }
                    if (brandFilters.value.search.trim() !== '') {
                        const q = brandFilters.value.search.toLowerCase();
                        base = base.filter(c => 
                            (c.creditType || '').toLowerCase().includes(q) ||
                            (c.dates || '').toLowerCase().includes(q) ||
                            (c.invoice || '').toLowerCase().includes(q)
                        );
                    }

                    return base.sort((a, b) => calendarMonths.indexOf(b.trackingMonth) - calendarMonths.indexOf(a.trackingMonth));
                });

                const builder = ref({
                    startMonth: 'January',
                    endMonth: 'December',
                    site: 'All',
                    promo: 'All',
                    productSearch: '',
                    groupBy: 'Promotion',
                    exportMode: 'single'
                });

                const builderOptions = computed(() => {
                    if (!activeBrand.value) return { promos: [] };
                    const promos = new Set(promoCredits.value
                        .filter(c => (c.vendor || '').toLowerCase() === (activeBrand.value.vendor || '').toLowerCase())
                        .map(c => c.creditType).filter(Boolean));
                    return { promos: Array.from(promos).sort() };
                });

                const builderPreviewData = computed(() => {
                    if (!activeBrand.value) return [];
                    let base = promoCredits.value.filter(c => (c.vendor || '').toLowerCase() === (activeBrand.value.vendor || '').toLowerCase());
            
                    const sIdx = calendarMonths.indexOf(builder.value.startMonth);
                    const eIdx = calendarMonths.indexOf(builder.value.endMonth);
            
                    base = base.filter(c => {
                        const mIdx = calendarMonths.indexOf(c.trackingMonth);
                        const monthMatch = mIdx >= sIdx && mIdx <= eIdx;
                        const siteMatch = builder.value.site === 'All' || c.site === builder.value.site;
                        const promoMatch = builder.value.promo === 'All' || c.creditType === builder.value.promo;
                        const prodMatch = !builder.value.productSearch || (c.creditType || '').toLowerCase().includes(builder.value.productSearch.toLowerCase());
                        return monthMatch && siteMatch && promoMatch && prodMatch;
                    });

                    return base;
                });

                const runBuilderExport = () => {
                    const data = builderPreviewData.value;
                    if (data.length === 0) return alert("No matching records to export.");

                    if (builder.value.exportMode === 'single') {
                        downloadAsCSV(data, `${activeBrand.value.vendor}_Master_Report`);
                    } else {
                        // Split logic
                        const groups = {};
                        const keyField = builder.value.exportMode === 'promo' ? 'creditType' : 'site';
                
                        data.forEach(c => {
                            const k = c[keyField] || 'Uncategorized';
                            if (!groups[k]) groups[k] = [];
                            groups[k].push(c);
                        });

                        Object.entries(groups).forEach(([name, groupData], index) => {
                            setTimeout(() => {
                                downloadAsCSV(groupData, `${activeBrand.value.vendor}_${name.replace(/[^a-z0-9]/gi, '_')}`);
                            }, index * 300); // Stagger downloads to prevent browser blocking
                        });
                    }
                    logSystemAction("EXPORT", `Builder Export: ${activeBrand.value.vendor} - Mode: ${builder.value.exportMode}`);
                };

                const exportFilteredBrandData = () => {
                    const data = brandCredits.value;
                    if (data.length === 0) return alert("No data to export with current filters.");
            
                    const filename = `${activeBrand.value.vendor}_Export_${brandFilters.value.month}_${brandFilters.value.site}`;
                    downloadAsCSV(data, filename);
                    logSystemAction("EXPORT", `Brand ${activeBrand.value.vendor} exported filtered data (${data.length} rows)`);
                };

                const downloadAsCSV = (credits, filename) => {
                    let csv = "Site,Month,Program,Dates,Amount,Status,Invoice/Memo\n";
                    credits.forEach(c => {
                        const safeSite = `"${String(c.site || '').replace(/"/g, '""')}"`;
                        const safeMonth = `"${String(c.trackingMonth || '').replace(/"/g, '""')}"`;
                        const safeType = `"${String(c.creditType || '').replace(/"/g, '""')}"`;
                        const safeDates = `"${String(c.dates || '').replace(/"/g, '""')}"`;
                        const safeInvoice = `"${String(c.invoice || '').replace(/"/g, '""')}"`;
                        csv += `${safeSite},${safeMonth},${safeType},${safeDates},"${c.amount}","${c.status}",${safeInvoice}\n`;
                    });

                    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.setAttribute('href', url);
                    a.setAttribute('download', `${filename.replace(/\s/g, '_')}.csv`);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                };

                const brandStats = computed(() => {
            const credits = brandCredits.value;
            return {
                pending: credits.filter(c => c.status === 'Pending').reduce((s, c) => s + (parseFloat(c.amount) || 0), 0),
                applied: credits.filter(c => c.status === 'Applied').reduce((s, c) => s + (parseFloat(c.amount) || 0), 0),
                total: credits.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
            };
        });

        const brandHistory = computed(() => {
            const groups = {};
            brandCredits.value.forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                if (!groups[m]) groups[m] = { month: m, total: 0, count: 0, credits: [] };
                groups[m].total += (parseFloat(c.amount) || 0);
                groups[m].count++;
                groups[m].credits.push(c);
            });
            return Object.values(groups).sort((a, b) => calendarMonths.indexOf(b.month) - calendarMonths.indexOf(a.month));
        });

                return {
            selectedRole, isManagerUnlocked, isBrandUnlocked, isPreviewMode, activeBrand, brandTab, 
            loggedInUser, emailInput, passwordInput, authError, 
            brandEmailInput, brandCodeInput, brandAuthError,
            activeSite, activeTab,
            treesSalesData, masterBrands, selectedBrands, allBrandsSelected, toggleAllBrands,
            deleteSelectedBrands, updateBrandField, toggleBrandActive, promoCredits, calendarMonths, activeMonth,
            searchQueryInput, searchQuery, showPromoModal, showBrandDropdown, editingId, showReportModal,
            showResolutionModal, resolutionCredit, resolutionForm, markAsSent, markReportGroupAsSent,
            openResolutionModal, submitResolution, monthlyReportSummaries, downloadMonthlyReport,
            groupedPendingReports, draftEmail, archiveAndExportAnnualReport, showImportModal,
            rawPasteData, pastedGrid, mappedHeaders, showBrandImportModal, brandPasteData, brandPastedGrid,
            brandMappedHeaders, brandAvailableHeaders, availableHeaders, form, handleLogin, handleBrandLogin, forceLock,
            filteredBrands, selectBrand, formatCurrency, filteredCredits, filteredTreesSalesData,
            displayTreesSalesData, totalPending, totalApplied, unsyncedSalesCount, openPromoModal,
            closePromoModal, handleFileUpload, saveCredit, editCredit, deleteCredit, openImportModal,
            closeImportModal, resetImport, displayGrid, processRawPaste, processImport, regenerateBrandSummary,
            regenerateMonthReports, handleTreesCsvUpload, pushToMainTracker, resetBrandImport,
            processBrandRawPaste, processBrandImport, systemLogs, refreshIcons, clearAllSalesData,
                        detectMonthInString, drawCharts, openDimeHelper, exportVendorsAndBrandsCSV, generateAccessCode,
                                    brandCredits, brandStats, brandHistory, bulkGenerateCodes,
                                    brandFilters, exportFilteredBrandData,
                                                builder, builderOptions, builderPreviewData, runBuilderExport,
                        publishReport, isReportPublished, isPublishing, pushMonthToBrands,



                                                creditRequests, updateRequestStatus, reconcileRequest, getStatusDisplayName, getStatusColor,
                        STATUS_DEFINITIONS, isLogsMinimized
        };




    }
}).mount('#app');
