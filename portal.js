// portal.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, where, addDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { AUDIT_ACTIONS } from "./governance.js";

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
const db = getFirestore(firebaseApp);

const { createApp, ref, computed, onMounted, watch, nextTick } = window.Vue;

createApp({
    setup() {
        const isAuthenticated = ref(false);
        const isLoggingIn = ref(false);
        const loginEmail = ref('');
        const loginCode = ref('');
        const loginError = ref('');
        const lockoutRemaining = ref(0);
        const failedAttempts = ref(0);
        const showBrandSelector = ref(false);
        const reportStep = ref(1); // 1: Period Selection, 2: Filtering & Export
        const isDataFetched = ref(false);
        
        const activeTab = ref('Dashboard');
        const currentBrand = ref(null);
        const promoCredits = ref([]);
        const allBrands = ref([]);
        const treesSalesData = ref([]);

        const isDev = computed(() => loginEmail.value.toLowerCase().trim() === 'nicholas.grace@rredco.com');
        const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const reportFilter = ref({
            startMonth: 'January',
            endMonth: 'December',
            types: ['BOGO', 'Discount', 'Display Program', 'Vendor Support'],
            site: 'All',
            format: 'csv'
        });

        const recentActivity = ref([]);

        const lockoutTime = 30 * 60 * 1000; // 30 minutes in ms

        // SECURITY: Simple session persistence
        onMounted(() => {
            const lockout = localStorage.getItem('brand_portal_lockout');
            if (lockout && Date.now() < parseInt(lockout)) {
                startLockout(parseInt(lockout) - Date.now());
            }

            const session = sessionStorage.getItem('brand_portal_session');
            if (session) {
                const data = JSON.parse(session);
                currentBrand.value = data.brand;
                loginEmail.value = data.email;
                isAuthenticated.value = true;
                startDataSync();
            }
            refreshIcons();
        });

        const handleLogin = async () => {
            if (lockoutRemaining.value > 0) return;
            isLoggingIn.value = true;
            loginError.value = '';

            const email = loginEmail.value.trim().toLowerCase();
            const code = loginCode.value.trim();

            try {
                const brandsRef = collection(db, "brands");
                const snapshot = await getDocs(brandsRef);
                const brands = [];
                snapshot.forEach(doc => brands.push({ id: doc.id, ...doc.data() }));
                
                const matched = brands.find(b => 
                    b.email && b.email.toLowerCase().split(/[,;\s]+/).includes(email) &&
                    b.accessCode === code
                );

                if (matched) {
                    currentBrand.value = matched;
                    isAuthenticated.value = true;
                    failedAttempts.value = 0;
                    sessionStorage.setItem('brand_portal_session', JSON.stringify({
                        brand: matched,
                        email: email
                    }));
                    startDataSync();
                    logAudit(AUDIT_ACTIONS.LOGIN_SUCCESS, `Brand ${matched.vendor} logged in`);
                } else {
                    failedAttempts.value++;
                    loginError.value = `Invalid email or access code. (${5 - failedAttempts.value} attempts remaining)`;
                    logAudit(AUDIT_ACTIONS.LOGIN_FAILURE, `Failed login attempt for ${email}`);
                    
                    if (failedAttempts.value >= 5) {
                        const until = Date.now() + lockoutTime;
                        localStorage.setItem('brand_portal_lockout', until.toString());
                        startLockout(lockoutTime);
                    }
                }
            } catch (error) {
                console.error(error);
                loginError.value = "Authentication service unavailable.";
            } finally {
                isLoggingIn.value = false;
            }
        };

        const startLockout = (durationMs) => {
            lockoutRemaining.value = Math.ceil(durationMs / 60000);
            const timer = setInterval(() => {
                const remaining = parseInt(localStorage.getItem('brand_portal_lockout')) - Date.now();
                if (remaining <= 0) {
                    clearInterval(timer);
                    lockoutRemaining.value = 0;
                    failedAttempts.value = 0;
                    localStorage.removeItem('brand_portal_lockout');
                } else {
                    lockoutRemaining.value = Math.ceil(remaining / 60000);
                }
            }, 10000);
        };

        const handleLogout = () => {
            sessionStorage.removeItem('brand_portal_session');
            window.location.reload();
        };

        const selectBrand = (brand) => {
            currentBrand.value = brand;
            isDataFetched.value = false;
            reportStep.value = 1;
            startDataSync();
            logAudit('Switch Brand', `Dev switched to ${brand.vendor}`);
        };

        const startDataSync = () => {
            if (!currentBrand.value) return;

            // Fetch only credits belonging to this brand
            const creditsQuery = query(collection(db, "promoCredits"), 
                where("vendor", "==", currentBrand.value.vendor)
            );
            
            onSnapshot(creditsQuery, (snapshot) => {
                const credits = [];
                snapshot.forEach(doc => credits.push({ id: doc.id, ...doc.data() }));
                promoCredits.value = credits;
                updateStats();
            });

            // Fetch raw sales for this brand to allow self-service CSV generation
            const salesQuery = query(collection(db, "treesSales"),
                where("brand", "==", currentBrand.value.vendor)
            );

            onSnapshot(salesQuery, (snapshot) => {
                const sales = [];
                snapshot.forEach(doc => sales.push({ id: doc.id, ...doc.data() }));
                treesSalesData.value = sales;
            });

            // Mock recent activity for the UI
            recentActivity.value = [
                { id: 1, type: 'status', message: 'September Credits Verified', timestamp: Date.now() - 86400000 },
                { id: 2, type: 'download', message: 'Exported August Detailed CSV', timestamp: Date.now() - 172800000 }
            ];

            refreshIcons();
        };

        const dashboardStats = ref({
            openPrograms: 0,
            totalDollars: 0,
            ytdDollars: 0,
            availableReports: 0
        });

        const updateStats = () => {
            const credits = promoCredits.value.filter(c => !c.archived);
            const currentYear = new Date().getFullYear().toString();
            
            dashboardStats.value.openPrograms = new Set(credits.map(c => c.creditType)).size;
            dashboardStats.value.totalDollars = credits.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
            dashboardStats.value.ytdDollars = credits
                .filter(c => (c.dates || '').includes(currentYear))
                .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
            dashboardStats.value.availableReports = new Set(credits.map(c => c.trackingMonth)).size;
            
            if (activeTab.value === 'Dashboard') {
                nextTick(() => drawBrandChart());
            }
        };

        const availablePromoTypes = computed(() => {
            const types = new Set(promoCredits.value.map(c => c.creditType).filter(Boolean));
            return types.size > 0 ? Array.from(types) : ['BOGO', 'Discount', 'Display Program', 'Vendor Support'];
        });

        const historicalReports = computed(() => {
            const months = {};
            promoCredits.value.forEach(c => {
                const m = c.trackingMonth || 'Unknown';
                if (!months[m]) months[m] = { month: m, total: 0, allApplied: true, credits: [] };
                months[m].total += (parseFloat(c.amount) || 0);
                months[m].credits.push(c);
                if (c.status !== 'Applied') months[m].allApplied = false;
            });
            return Object.values(months).sort((a, b) => calendarMonths.indexOf(b.month) - calendarMonths.indexOf(a.month));
        });

        const formatCurrency = (val) => {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
        };

        const formatDate = (ts) => {
            return new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        };

        const logAudit = async (action, details) => {
            try {
                await addDoc(collection(db, "systemLogs"), {
                    timestamp: Date.now(),
                    user: `BRAND:${currentBrand.value.vendor}`,
                    actionType: action.toUpperCase(),
                    details: details
                });
            } catch (e) { console.error(e); }
        };

        const unlockReportFilters = () => {
            if (!reportFilter.value.startMonth || !reportFilter.value.endMonth) return;
            
            // Simulate data fetch/download trigger
            isLoggingIn.value = true;
            setTimeout(() => {
                isLoggingIn.value = false;
                isDataFetched.value = true;
                reportStep.value = 2;
                logAudit('Data Fetch', `Fetched data for ${reportFilter.value.startMonth} - ${reportFilter.value.endMonth}`);
            }, 800);
        };

        const generateCustomReport = () => {
            const startIdx = calendarMonths.indexOf(reportFilter.value.startMonth);
            const endIdx = calendarMonths.indexOf(reportFilter.value.endMonth);
            
            const filteredCredits = promoCredits.value.filter(c => {
                const mIdx = calendarMonths.indexOf(c.trackingMonth);
                const monthInRange = mIdx >= startIdx && mIdx <= endIdx;
                const typeMatch = reportFilter.value.types.length === 0 || reportFilter.value.types.includes(c.creditType);
                const siteMatch = reportFilter.value.site === 'All' || c.site === reportFilter.value.site;
                return monthInRange && typeMatch && siteMatch;
            });

            if (filteredCredits.length === 0) {
                alert("No data found for the selected filters.");
                return;
            }

            if (reportFilter.value.format === 'csv') {
                downloadAsCSV(filteredCredits, "Custom_Report");
            } else {
                alert("PDF Generation is currently being finalized. Please use CSV format for now.");
            }
            
            logAudit('Export', `Generated custom ${reportFilter.value.format} report`);
        };

        const downloadHistorical = (report) => {
            downloadAsCSV(report.credits, `Report_${report.month}`);
            logAudit('Export', `Downloaded historical report for ${report.month}`);
        };

        const downloadAsCSV = (credits, filename) => {
            let csv = "Site,Month,Program,Dates,Amount,Status,Invoice/Memo\n";
            credits.forEach(c => {
                csv += `"${c.site}","${c.trackingMonth}","${c.creditType}","${c.dates}","${c.amount}","${c.status}","${c.invoice}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', `${currentBrand.value.vendor.replace(/\s/g, '_')}_${filename}.csv`);
            a.click();
        };

        let brandChartInstance = null;
        const drawBrandChart = () => {
            const ctx = document.getElementById('brandMonthlyChart');
            if (!ctx) return;
            
            if (brandChartInstance) brandChartInstance.destroy();

            const monthData = {};
            calendarMonths.forEach(m => monthData[m] = 0);
            promoCredits.value.forEach(c => {
                if (monthData[c.trackingMonth] !== undefined) {
                    monthData[c.trackingMonth] += (parseFloat(c.amount) || 0);
                }
            });

            const activeMonths = calendarMonths.filter(m => monthData[m] > 0);
            
            brandChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: activeMonths,
                    datasets: [{
                        label: 'Promo Dollars',
                        data: activeMonths.map(m => monthData[m]),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#f59e0b',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            ticks: { callback: (val) => formatCurrency(val) }
                        }
                    }
                }
            });
        };

        const refreshIcons = () => {
            nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
        };

        watch(activeTab, (val) => {
            if (val === 'Dashboard') nextTick(() => drawBrandChart());
            refreshIcons();
        });

        return {
            isAuthenticated, isLoggingIn, loginEmail, loginCode, loginError, lockoutRemaining,
            activeTab, currentBrand, promoCredits, historicalReports, reportFilter,
            availablePromoTypes, dashboardStats, recentActivity, calendarMonths,
            handleLogin, handleLogout, generateCustomReport, downloadHistorical,
            formatCurrency, formatDate, refreshIcons, isDev, allBrands, selectBrand,
            showBrandSelector, reportStep, isDataFetched, unlockReportFilters
        };
    }
}).mount('#app');
