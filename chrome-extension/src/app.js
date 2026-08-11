import '@fortawesome/fontawesome-free/css/all.min.css';
import Sortable from 'sortablejs';
import Chart from 'chart.js/auto';

        import { initializeApp } from "firebase/app";
        import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
        import { getFirestore, doc, onSnapshot, setDoc, collection } from "firebase/firestore";

        // === Cloud Configuration ===
        const firebaseConfig = {
            apiKey: "AIzaSyD3GZnCEWotlYVHElhh3c5RmCKYjzSdhX8",
            authDomain: "magic-pouch.firebaseapp.com",
            projectId: "magic-pouch",
            storageBucket: "magic-pouch.firebasestorage.app",
            messagingSenderId: "816300585480",
            appId: "1:816300585480:web:0ead89292305defb2c97bd"
        };

        const firebaseApp = initializeApp(firebaseConfig);
        const auth = getAuth(firebaseApp);
        const db = getFirestore(firebaseApp);

        // Load saved folder state from local storage
        const savedFolders = localStorage.getItem('magic_pouch_folders');

        const STATE = {
            user: null,
            syncKey: localStorage.getItem('magic_pouch_key') || Math.random().toString(36).substr(2, 6).toUpperCase(),
            data: {
                notes: [],
                profile: [],
                quickNotes: [],
                plan: {
                    daily: [
                        { id: 'def1', text: 'Apply to 5 Jobs', done: false },
                        { id: 'def2', text: 'Reach out to 2 Recruiters', done: false }
                    ],
                    weekly: '',
                    monthly: '',
                    lastLogin: '',
                    streak: 0,
                    hideDone: false,
                    // New Data for North Star
                    northStar: { company: '', role: '', status: 'Dreaming' }
                },
                stats: {
                    history: {},
                    dailyTarget: 5
                },
                userQuote: "Believe in yourself 🌟"
            },
            editingId: null,
            targetStatusId: null,
            templateFolder: null,
            renameTargetFolder: null,
            currentConfirmAction: null,
            editingTaskIdx: null,
            interviewFilter: 'all',
            pendingTemplateContent: '',
            pendingPlaceholders: [],

            openFolders: savedFolders ? new Set(JSON.parse(savedFolders)) : new Set(),
            hasInitializedFolders: !!savedFolders,
            unsubscribe: null,
            isSyncing: false,
            currentView: 'jobs'
        };

        const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
        const STATUS_PRIORITY = {
            'referral-received': 0, 'pending': 1, 'reminder': 2, 'referral-asked': 3,
            'applied': 4, 'completed': 4, 'referral': 3, 'referral-pending': 1
        };

        const getDaysDifference = (timestamp) => {
            const now = new Date();
            const date = new Date(timestamp);
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            return Math.floor((startOfToday - startOfDate) / MILLIS_PER_DAY);
        };

        // Helper to get Canvas Compliant Path
        const getDocRef = () => {
             // Standard path for direct deployment
             return doc(db, 'sync', STATE.syncKey);
        };

        const app = {

            saveJobFromExtension: (data) => {
                let role = data.title || '';
                let company = data.company || '';
                let finalTitle = role && company ? role + ' @ ' + company : (role || company || 'Captured Job');

                const newId = Date.now().toString();
                const status = data.status || 'applied';
                const itemData = {
                    title: finalTitle,
                    content: data.url || '',
                    linkType: data.url && data.url.includes('linkedin') ? 'linkedin' : 'job',
                    remarks: 'Auto-captured via Magic Pouch Extension',
                    category: 'job',
                    updated: Date.now(),
                    status: status
                };

                STATE.data.notes.unshift({ id: newId, created: Date.now(), ...itemData });
                app.recalculateStreak();
                app.saveToCloud();
                app.refreshUI();

                if (status === 'applied') {
                    app.toast('Captured Job Applied! 🔥');
                } else {
                    app.toast('Captured Job Saved! 💼');
                }
            },

            init: async () => {
                app.initTheme();

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['magic_pouch_pending_jobs'], (result) => {
                        const jobs = result.magic_pouch_pending_jobs || [];
                        if (jobs.length > 0) {
                            jobs.forEach(job => {
                                app.saveJobFromExtension(job);
                            });
                            chrome.storage.local.set({ magic_pouch_pending_jobs: [] });
                        }
                    });
                }

                // Initialize Auth
                try {
                    await signInAnonymously(auth);
                    console.log('Auth success');
                } catch (e) {
                    console.error('Auth error:', e);
                    app.toast('Auth setup failed', true);
                }

                onAuthStateChanged(auth, (user) => {
                    STATE.user = user;
                    if(user) {
                        app.setupSync();
                    }
                });

                localStorage.setItem('magic_pouch_key', STATE.syncKey);
                if(document.getElementById('sync-status-text')) document.getElementById('sync-status-text').textContent = STATE.syncKey;
                if(document.getElementById('sync-key-input')) document.getElementById('sync-key-input').value = STATE.syncKey;
            },

            initTheme: () => {
                const isDark = localStorage.getItem('theme') === 'dark' ||
                              (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) {
                    document.documentElement.classList.add('dark');
                    const toggle = document.getElementById('theme-toggle');
                    if(toggle) toggle.checked = true;
                } else {
                    document.documentElement.classList.remove('dark');
                    const toggle = document.getElementById('theme-toggle');
                    if(toggle) toggle.checked = false;
                }
            },

            toggleTheme: () => {
                if (document.documentElement.classList.contains('dark')) {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('theme', 'light');
                } else {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('theme', 'dark');
                }
            },

            setupSync: () => {
                if(!STATE.user) return;
                if(STATE.unsubscribe) STATE.unsubscribe();

                STATE.isSyncing = true;
                const docRef = getDocRef();

                STATE.unsubscribe = onSnapshot(docRef, (snap) => {
                    const indicator = document.getElementById('sync-indicator');
                    const statusText = document.getElementById('sync-status-text');
                    const headerIndicator = document.getElementById('header-sync-indicator');

                    const isConnected = snap.exists();
                    if(indicator) indicator.className = "w-2 h-2 rounded-full bg-green-500 animate-pulse";
                    if(statusText) statusText.textContent = STATE.syncKey + " ✓";
                    if(headerIndicator) headerIndicator.className = "absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm z-10 animate-pulse";

                    if(isConnected) {
                        const remoteData = snap.data().data || {};
                        STATE.data = app.sanitizeData(remoteData);
                        app.checkDailyReset();
                        app.cleanupOldJobs();
                        app.processAutomationRules();
                    } else {
                        STATE.data = app.sanitizeData({});
                    }
                    app.refreshUI();
                }, (error) => {
                    console.error('Sync error:', error);
                    if(document.getElementById('sync-indicator')) document.getElementById('sync-indicator').className = "w-2 h-2 rounded-full bg-red-400";
                    if(document.getElementById('header-sync-indicator')) document.getElementById('header-sync-indicator').className = "absolute bottom-0 right-0 w-3 h-3 rounded-full bg-red-400 border-2 border-white shadow-sm z-10";
                });
            },

            sanitizeData: (data) => {
                const safeData = data || {};
                if (!Array.isArray(safeData.notes)) safeData.notes = [];
                if (!Array.isArray(safeData.profile)) safeData.profile = [];
                if (!Array.isArray(safeData.quickNotes)) safeData.quickNotes = [];
                if (!safeData.plan || typeof safeData.plan !== 'object') safeData.plan = {};
                if (!Array.isArray(safeData.plan.networking)) safeData.plan.networking = [];

                if (!Array.isArray(safeData.plan.daily)) {
                    safeData.plan.daily = [
                        { id: 'def1', text: 'Apply to 5 Jobs', done: false },
                        { id: 'def2', text: 'Reach out to 2 Recruiters', done: false }
                    ];
                }
                if (typeof safeData.plan.weekly !== 'string') safeData.plan.weekly = '';
                if (typeof safeData.plan.monthly !== 'string') safeData.plan.monthly = '';
                if (typeof safeData.plan.postIt !== 'string') safeData.plan.postIt = '';
                if (typeof safeData.plan.lastLogin !== 'string') safeData.plan.lastLogin = '';
                if (typeof safeData.plan.streak !== 'number') safeData.plan.streak = 0;
                if (typeof safeData.plan.hideDone !== 'boolean') safeData.plan.hideDone = false;

                // Initialize North Star if missing
                if (!safeData.plan.northStar || typeof safeData.plan.northStar !== 'object') {
                    safeData.plan.northStar = { company: 'Dream Co.', role: 'Target Role', status: 'Planning' };
                }

                if (!safeData.stats || typeof safeData.stats !== 'object') {
                    safeData.stats = { history: {}, dailyTarget: 5 };
                }
                if (!safeData.stats.history) safeData.stats.history = {};
                if (typeof safeData.stats.dailyTarget !== 'number') safeData.stats.dailyTarget = 5;

                return safeData;
            },

            openSettings: () => { document.getElementById('modal-settings').classList.remove('hidden'); },
            openStreakModal: () => { document.getElementById('modal-streak').classList.remove('hidden'); app.updateProgressUI(); },
            openWeeklyModal: () => {
                document.getElementById('modal-weekly').classList.remove('hidden');
                setTimeout(() => {
                    app.calculateConversionRates();
                    app.renderWeeklyStats();
                    app.renderHeatmap(new Date(), STATE.data.stats.dailyTarget || 5);
                }, 100);
            },

            calculateConversionRates: () => {
                const notes = STATE.data.notes || [];
                let totalApplied = 0;
                let totalInterviews = 0;
                let totalOffers = 0;

                notes.forEach(note => {
                    // Count any job that was applied to or any interview record (which implies it was applied to)
                    if ((note.category === 'job' && (note.status === 'applied' || note.status === 'completed' || note.status === 'direct-apply')) || note.category === 'interview') {
                        totalApplied++;
                    }
                    if (note.category === 'interview') {
                        totalInterviews++;
                        if (note.status === 'Offer') {
                            totalOffers++;
                        }
                    }
                });

                const appToIntRate = totalApplied > 0 ? Math.round((totalInterviews / totalApplied) * 100) : 0;
                const intToOffRate = totalInterviews > 0 ? Math.round((totalOffers / totalInterviews) * 100) : 0;

                const appIntEl = document.getElementById('conv-app-int');
                const intOffEl = document.getElementById('conv-int-off');

                if (appIntEl) appIntEl.textContent = `${appToIntRate}%`;
                if (intOffEl) intOffEl.textContent = `${intToOffRate}%`;
            },

            getWeeklyStats: (weekOffset = 0) => {
                const history = STATE.data.stats.history || {};
                const today = new Date();
                const dayOfWeek = today.getDay();

                const startOfCurrentWeek = new Date(today);
                startOfCurrentWeek.setDate(today.getDate() - dayOfWeek);
                startOfCurrentWeek.setHours(0, 0, 0, 0);

                const startOfTargetWeek = new Date(startOfCurrentWeek);
                startOfTargetWeek.setDate(startOfCurrentWeek.getDate() - (weekOffset * 7));

                let total = 0;
                let breakdown = { 'direct': 0, 'cold-email': 0, 'referral': 0, 'recruiter': 0 };

                for (let i = 0; i < 7; i++) {
                    const d = new Date(startOfTargetWeek);
                    d.setDate(startOfTargetWeek.getDate() + i);
                    const dStr = d.toLocaleDateString('en-CA');
                    const entry = history[dStr];

                    if (typeof entry === 'number') {
                        total += entry;
                        breakdown['direct'] += entry;
                    } else if (entry && typeof entry === 'object') {
                        total += (entry.total || 0);
                        if (entry.methods) {
                            breakdown['direct'] += (entry.methods['direct'] || 0);
                            breakdown['cold-email'] += (entry.methods['cold-email'] || 0);
                            breakdown['referral'] += (entry.methods['referral'] || 0);
                            breakdown['recruiter'] += (entry.methods['recruiter'] || 0);
                        } else {
                            breakdown['direct'] += (entry.total || 0);
                        }
                    }
                }
                return { total, breakdown };
            },

            checkDailyReset: () => {
                const today = new Date().toLocaleDateString('en-CA');
                const lastLogin = STATE.data.plan.lastLogin;
                if (lastLogin !== today) {
                    app.recalculateStreak();
                    if (lastLogin) STATE.data.plan.daily.forEach(task => task.done = false);
                    STATE.data.plan.lastLogin = today;
                    app.saveToCloud();
                } else {
                    app.recalculateStreak();
                }
            },

            recalculateStreak: () => {
                const today = new Date();
                let currentStreak = 0;
                let checkDate = new Date(today);
                const todayStr = today.toLocaleDateString('en-CA');
                const getCount = (dStr) => {
                    const entry = STATE.data.stats.history[dStr];
                    if (typeof entry === 'number') return entry;
                    if (entry && typeof entry === 'object') return entry.total || 0;
                    return 0;
                };
                const todayCount = getCount(todayStr);
                const target = STATE.data.stats.dailyTarget || 5;
                if (todayCount >= target) currentStreak++;
                for (let i = 1; i < 365; i++) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    const dStr = checkDate.toLocaleDateString('en-CA');
                    const count = getCount(dStr);
                    if (count >= target) currentStreak++;
                    else {
                        if (i === 1 && todayCount < target) continue;
                        else break;
                    }
                }
                STATE.data.plan.streak = currentStreak;
                app.updateProgressUI();
            },

            updateProgressUI: () => {
                const today = new Date();
                const todayStr = today.toLocaleDateString('en-CA');
                const getCount = (dStr) => {
                    const entry = STATE.data.stats.history[dStr];
                    if (typeof entry === 'number') return entry;
                    if (entry && typeof entry === 'object') return entry.total || 0;
                    return 0;
                };
                const count = getCount(todayStr);
                const target = STATE.data.stats.dailyTarget || 5;

                const progressText = document.getElementById('today-progress-text');
                const progressBar = document.getElementById('streak-progress-bar');
                const streakCountEl = document.getElementById('streak-count');
                const tierLabel = document.getElementById('tier-label');
                const tierIcon = document.getElementById('tier-icon');
                const nextMilestoneText = document.getElementById('next-milestone-text');

                if(progressText) progressText.textContent = `${count} / ${target}`;

                const currentStreak = STATE.data.plan.streak;
                if(streakCountEl) streakCountEl.textContent = currentStreak;

                // Gamification Tiers Logic
                const tiers = [
                    { name: 'Bronze Tier', min: 0, next: 3, icon: 'fa-fire', color: 'bg-orange-500', iconColor: 'text-orange-500' },
                    { name: 'Silver Tier', min: 3, next: 7, icon: 'fa-bolt', color: 'bg-gray-400', iconColor: 'text-gray-400' },
                    { name: 'Gold Tier', min: 7, next: 14, icon: 'fa-star', color: 'bg-yellow-400', iconColor: 'text-yellow-400' },
                    { name: 'Diamond Tier', min: 14, next: null, icon: 'fa-gem', color: 'bg-cyan-400', iconColor: 'text-cyan-400' }
                ];

                let activeTier = tiers[0];
                for(let i = tiers.length - 1; i >= 0; i--) {
                    if (currentStreak >= tiers[i].min) {
                        activeTier = tiers[i];
                        break;
                    }
                }

                if (tierLabel) {
                    tierLabel.textContent = activeTier.name;
                    tierLabel.className = `px-2 py-0.5 rounded-full text-white ${activeTier.color} shadow-sm`;
                }

                if (tierIcon) {
                    tierIcon.className = `fas ${activeTier.icon} text-4xl animate-pulse ${activeTier.iconColor}`;
                }

                if(progressBar) {
                    if (activeTier.next !== null) {
                        const progressInTier = currentStreak - activeTier.min;
                        const tierSize = activeTier.next - activeTier.min;
                        const pct = Math.min(100, (progressInTier / tierSize) * 100);
                        progressBar.style.width = `${pct}%`;
                        progressBar.className = `h-full rounded-full transition-all duration-1000 shadow-sm ${activeTier.color}`;
                    } else {
                        progressBar.style.width = `100%`;
                        progressBar.className = `h-full rounded-full transition-all duration-1000 shadow-sm ${activeTier.color}`;
                    }
                }

                if (nextMilestoneText) {
                    if (activeTier.next !== null) {
                        const daysLeft = activeTier.next - currentStreak;
                        const nextTierName = tiers.find(t => t.min === activeTier.next).name;
                        nextMilestoneText.textContent = `${daysLeft} days to ${nextTierName}`;
                    } else {
                        nextMilestoneText.textContent = `Max Tier Reached!`;
                    }
                }

                const streakBtnBg = document.getElementById('streak-progress-bg');
                if (streakBtnBg) {
                    const pct = Math.min(100, (count / target) * 100);
                    streakBtnBg.style.background = `conic-gradient(from 0deg, #f97316 0%, #ef4444 ${pct}%, transparent ${pct}%)`;
                }

                app.renderStreakCalendar(today, target);
                const miniStreak = document.getElementById('mini-streak');
                if(miniStreak) miniStreak.textContent = STATE.data.plan.streak;

                const weeklyData = app.getWeeklyStats(0);
                const miniWeekly = document.getElementById('mini-weekly');
                const weeklyTotalEl = document.getElementById('weekly-total');
                const weeklyRefEl = document.getElementById('weekly-referrals');
                if(miniWeekly) miniWeekly.textContent = weeklyData.total;
                if(weeklyTotalEl) weeklyTotalEl.textContent = weeklyData.total;

                let referralCount = 0;
                STATE.data.notes.forEach(n => {
                    if (n.category === 'job' && n.status === 'referral-received') referralCount++;
                });
                if(weeklyRefEl) weeklyRefEl.textContent = referralCount;
            },

             renderStreakCalendar: (currentDate, target) => {
                const grid = document.getElementById('streak-calendar-grid');
                if(!grid) return;
                grid.innerHTML = '';
                const monthLabel = document.getElementById('streak-month-label');
                if(monthLabel) monthLabel.textContent = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const startDay = new Date(year, month, 1).getDay();
                for(let i=0; i<startDay; i++) { grid.appendChild(document.createElement('div')); }
                const history = STATE.data.stats.history || {};
                for(let d=1; d<=daysInMonth; d++) {
                    const dateObj = new Date(year, month, d);
                    const dateStr = dateObj.toLocaleDateString('en-CA');
                    let count = 0;
                    if(typeof history[dateStr] === 'number') count = history[dateStr];
                    else if(history[dateStr] && typeof history[dateStr] === 'object') count = history[dateStr].total;
                    const cell = document.createElement('div');
                    const isToday = d === currentDate.getDate();
                    let bgClass = "bg-gray-50 border-gray-100 text-gray-300 dark:bg-[#0a0a0a] dark:border-gray-800 dark:text-slate-600";
                    let content = `<span class="text-[9px] font-bold">${d}</span>`;
                    if (count >= target) {
                        bgClass = "bg-gray-100 border-gray-200 text-orange-50 shadow-sm dark:bg-gray-800 dark:border-orange-500/20 dark:text-orange-400";
                        content = `<i class="fas fa-fire text-sm animate-pulse"></i>`;
                    } else if (count > 0) bgClass = "bg-gray-100 border-gray-200 text-gray-400 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400";
                    if (isToday) bgClass += " border-2 border-blue-400 dark:border-blue-500";
                    cell.className = `w-full aspect-square rounded-xl ${bgClass} border flex items-center justify-center transition-all cursor-default`;
                    cell.innerHTML = content;
                    grid.appendChild(cell);
                }
            },

            renderHeatmap: (currentDate, target) => {
                const grid = document.getElementById('heatmap-grid');
                if(!grid) return;
                grid.innerHTML = '';

                const monthLabel = document.getElementById('current-month-label');
                if(monthLabel) monthLabel.textContent = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const startDay = new Date(year, month, 1).getDay(); // 0 = Sun

                // Empty slots for start of month
                for(let i=0; i<startDay; i++) {
                    grid.appendChild(document.createElement('div'));
                }

                const history = STATE.data.stats.history || {};

                for(let d=1; d<=daysInMonth; d++) {
                    const dateObj = new Date(year, month, d);
                    const dateStr = dateObj.toLocaleDateString('en-CA');

                    let count = 0;
                    if(typeof history[dateStr] === 'number') count = history[dateStr];
                    else if(history[dateStr] && typeof history[dateStr] === 'object') count = history[dateStr].total || 0;

                    const cell = document.createElement('div');

                    // Style based on count
                    let bgClass = "bg-gray-100 dark:bg-slate-700"; // Empty
                    if(count > 0) {
                        if(count >= target) bgClass = "bg-green-500 dark:bg-green-500"; // Target met
                        else bgClass = "bg-green-200 dark:bg-gray-800"; // Some activity
                    }

                    // Highlight today
                    const now = new Date();
                    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
                    const borderClass = isToday ? "border-2 border-blue-500" : "border border-transparent";

                    cell.className = `w-full aspect-square rounded-sm ${bgClass} ${borderClass} transition-all hover:opacity-80`;
                    cell.title = `${dateStr}: ${count} activities`;

                    grid.appendChild(cell);
                }
            },

            editDailyTarget: () => {
                document.getElementById('target-input').value = STATE.data.stats.dailyTarget || 5;
                document.getElementById('modal-target').classList.remove('hidden');
            },
            saveTarget: () => {
                const val = parseInt(document.getElementById('target-input').value);
                if(val > 0) {
                    STATE.data.stats.dailyTarget = val;
                    app.saveToCloud();
                    app.recalculateStreak();
                    document.getElementById('modal-target').classList.add('hidden');
                }
            },
            renderWeeklyStats: () => {
                const ctx = document.getElementById('insightsChart');
                if (!ctx) return;
                if (window.myChart) window.myChart.destroy();
                const rawData = [];
                const labels = ["3 Weeks Ago", "2 Weeks Ago", "Last Week", "This Week"];
                for(let i=3; i>=0; i--) { rawData.push(app.getWeeklyStats(i)); }

                const datasetTotal = { label: 'Total', data: rawData.map(d => d.total), backgroundColor: '#e0e7ff', borderRadius: 4, barPercentage: 0.6 };
                const datasetDirect = { label: 'Direct', data: rawData.map(d => d.breakdown['direct']), backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.8 };
                const datasetCold = { label: 'Cold Email', data: rawData.map(d => d.breakdown['cold-email']), backgroundColor: '#f97316', borderRadius: 4, barPercentage: 0.8 };
                const datasetReferral = { label: 'Referral', data: rawData.map(d => d.breakdown['referral']), backgroundColor: '#a855f7', borderRadius: 4, barPercentage: 0.8 };
                const datasetRecruiter = { label: 'Recruiter', data: rawData.map(d => d.breakdown['recruiter']), backgroundColor: '#14b8a6', borderRadius: 4, barPercentage: 0.8 };

                window.myChart = new Chart(ctx, {
                    type: 'bar',
                    data: { labels: labels, datasets: [datasetTotal, datasetDirect, datasetCold, datasetReferral, datasetRecruiter] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { display: false, beginAtZero: true } } }
                });
            },

            handleUrlInput: (url) => {
                const typeSelect = document.getElementById('job-type');
                const titleInput = document.getElementById('job-title');

                if (url.includes('linkedin.com')) typeSelect.value = 'linkedin';
                else if (url.includes('naukri.com')) typeSelect.value = 'naukri';
                else if (url.includes('glassdoor.com')) typeSelect.value = 'site';
                else if (url.includes('indeed.com')) typeSelect.value = 'site';

                if (!titleInput.value) {
                    try {
                        const urlObj = new URL(url.match(/^http/) ? url : `https://${url}`);
                        const hostname = urlObj.hostname.toLowerCase();
                        const pathParts = urlObj.pathname.split('/').filter(Boolean);

                        let company = '';
                        let role = '';

                        if (hostname.includes('greenhouse.io') || hostname.includes('lever.co') || hostname.includes('ashbyhq.com')) {
                            if (pathParts.length >= 1) company = pathParts[0];
                        } else if (hostname.includes('workdayjobs.com')) {
                            company = hostname.split('.')[0];
                            const jobIndex = pathParts.indexOf('job');
                            if (jobIndex !== -1 && jobIndex + 2 < pathParts.length) {
                                role = pathParts[jobIndex + 2].split('_')[0];
                            }
                        } else if (hostname.includes('wellfound.com') || hostname.includes('ycombinator.com')) {
                            const compIndex = pathParts.findIndex(p => p === 'company' || p === 'companies');
                            if (compIndex !== -1 && compIndex + 1 < pathParts.length) {
                                company = pathParts[compIndex + 1];
                            }
                        } else if (hostname.includes('workable.com')) {
                            if (pathParts.length >= 1) company = pathParts[0];
                        } else if (hostname.includes('linkedin.com')) {
                            // Let the fallback logic handle linkedin if it can find a non-generic path
                        } else if (!hostname.includes('indeed.com') && !hostname.includes('glassdoor.com') && !hostname.includes('naukri.com')) {
                            const hostParts = hostname.split('.');
                            if (hostParts.length >= 2) {
                                let offset = 2;
                                if (hostParts.length >= 3 && (hostParts[hostParts.length - 2] === 'co' || hostParts[hostParts.length - 2] === 'com' || hostParts[hostParts.length - 2] === 'org' || hostParts[hostParts.length - 2] === 'net')) {
                                    offset = 3;
                                }
                                company = hostParts[hostParts.length - offset];
                            }
                        }

                        if (!company && !role) {
                            const pathSegments = pathParts.filter(p => p.length > 2 && !p.match(/^\d+$/) && !p.match(/^[a-zA-Z0-9_-]{10,}$/));
                            if (pathSegments.length > 0) {
                                const last = pathSegments[pathSegments.length - 1];
                                if (last.toLowerCase() !== 'view') {
                                    role = last;
                                }
                            }
                        }

                        if (company) company = company.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        if (role) role = role.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                        let titleValue = '';
                        if (company && role) titleValue = `${role} @ ${company}`;
                        else if (company) titleValue = company;
                        else if (role) titleValue = role;

                        if (titleValue) {
                            titleInput.value = titleValue;
                        }
                    } catch(e) {
                        // Invalid URL
                    }
                }
            },

            toggleQuickNote: (text) => {
                const textarea = document.getElementById('job-remarks');
                let current = textarea.value;
                const notePattern = `• ${text}`;

                // Check if the note is roughly present (handling variations)
                if (current.includes(text)) {
                    // Remove logic: try to remove bullet version first, then just text
                    if (current.includes(notePattern)) {
                        current = current.replace(notePattern, '');
                    } else {
                        current = current.replace(text, '');
                    }
                    // Cleanup newlines (replace double newlines with single, trim)
                    current = current.replace(/\n\s*\n/g, '\n').trim();
                } else {
                    // Add logic
                    current = current.trim();
                    current = current ? `${current}\n${notePattern}` : notePattern;
                }

                textarea.value = current;
                app.renderQuickNotesChips();
            },

            // Replaced old addQuickNoteOption with full modal management logic
            openQuickNotesModal: () => {
                app.renderQuickNotesList();
                document.getElementById('modal-quick-notes').classList.remove('hidden');
                setTimeout(() => document.getElementById('quick-note-input').focus(), 100);
            },

            renderQuickNotesList: () => {
                const list = document.getElementById('quick-notes-manage-list');
                if(!list) return;
                list.innerHTML = '';
                const notes = STATE.data.quickNotes || [];

                if(notes.length === 0) {
                    list.innerHTML = `<div class="text-center text-gray-400 text-xs py-6 italic">No custom notes yet.<br>Add one below!</div>`;
                    return;
                }

                // Match colors with the chips
                const colors = ['purple', 'blue', 'emerald', 'orange', 'rose', 'cyan', 'indigo', 'fuchsia', 'amber', 'lime'];

                notes.forEach((note, idx) => {
                    const color = colors[idx % colors.length];
                    const div = document.createElement('div');
                    div.className = "flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 group dark:bg-slate-700/50 dark:border-slate-600";
                    div.innerHTML = `
                        <div class="flex items-center gap-2 overflow-hidden">
                            <div class="w-2 h-2 rounded-full bg-${color}-400 shrink-0 shadow-sm"></div>
                            <span class="text-sm font-bold text-gray-700 truncate dark:text-slate-200">${note}</span>
                        </div>
                        <button onclick="app.deleteQuickNote(${idx})" class="text-gray-300 hover:text-red-500 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 transition active:scale-90 dark:hover:bg-red-900/30 dark:text-slate-500 dark:hover:text-red-400">
                            <i class="fas fa-trash text-xs"></i>
                        </button>
                    `;
                    list.appendChild(div);
                });
            },

            saveQuickNote: () => {
                const input = document.getElementById('quick-note-input');
                const val = input.value.trim();
                if(val) {
                    if(!STATE.data.quickNotes) STATE.data.quickNotes = [];
                    STATE.data.quickNotes.push(val);
                    app.saveToCloud();
                    input.value = '';
                    app.renderQuickNotesList();
                    app.renderQuickNotesChips(); // Update chips in background
                }
            },

            deleteQuickNote: (idx) => {
                if(!STATE.data.quickNotes) return;
                STATE.data.quickNotes.splice(idx, 1);
                app.saveToCloud();
                app.renderQuickNotesList();
                app.renderQuickNotesChips(); // Update chips in background
            },

            // Legacy wrapper to maintain compatibility if called elsewhere
            addQuickNoteOption: () => { app.openQuickNotesModal(); },

            // Legacy wrapper for addQuickNote to support existing buttons if any
            addQuickNote: (text) => { app.toggleQuickNote(text); },

            renderQuickNotesChips: () => {
                const container = document.getElementById('quick-notes-container');
                if(!container) return;
                container.innerHTML = '';

                const notes = STATE.data.quickNotes || [];
                const textarea = document.getElementById('job-remarks');
                const currentRemarks = textarea ? textarea.value : '';

                if (notes.length === 0) {
                    container.innerHTML = `<span class="text-[10px] text-gray-300 dark:text-gray-600 italic pl-1">No notes. Click '+ / -' to add.</span>`;
                    return;
                }

                // Vibrant Palette for unique coloring
                const colors = ['purple', 'blue', 'emerald', 'orange', 'rose', 'cyan', 'indigo', 'fuchsia', 'amber', 'lime'];

                notes.forEach((note, index) => {
                    const color = colors[index % colors.length];
                    const isActive = currentRemarks.includes(note);

                    const btn = document.createElement('button');

                    if (isActive) {
                        // Vibrant Active Style
                        btn.className = `px-3 py-1.5 rounded-lg bg-${color}-100 text-${color}-700 text-xs font-bold border border-${color}-200 transition active:scale-95 dark:bg-${color}-900/40 dark:text-${color}-300 dark:border-${color}-700 shadow-sm`;
                    } else {
                        // Default Grey Style
                        btn.className = `px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 text-xs font-bold border border-gray-200 hover:bg-gray-200 transition active:scale-95 dark:bg-[#0a0a0a] dark:text-slate-400 dark:border-gray-800 dark:hover:bg-slate-700`;
                    }

                    btn.textContent = note;
                    btn.onclick = () => app.toggleQuickNote(note);
                    container.appendChild(btn);
                });
            },

            openJobModal: (id = null) => {
                STATE.editingId = id;
                const modal = document.getElementById('modal-job');
                const title = document.getElementById('job-title');
                const content = document.getElementById('job-content');
                const type = document.getElementById('job-type');
                const remarks = document.getElementById('job-remarks');

                if(id) {
                    const item = STATE.data.notes.find(n => n.id === id);
                    title.value = item.title;
                    content.value = item.content;
                    type.value = item.linkType || 'job';
                    remarks.value = item.remarks || '';
                } else {
                    title.value = '';
                    content.value = '';
                    type.value = 'job';
                    remarks.value = '';
                }

                // Render chips AFTER value is set so they detect active state correctly
                app.renderQuickNotesChips();

                modal.classList.remove('hidden');
                setTimeout(() => {
                    if(!id) content.focus();
                }, 100);
            },

            saveJob: (statusOrFlag = null) => {
                const title = document.getElementById('job-title').value;
                const content = document.getElementById('job-content').value;
                const linkType = document.getElementById('job-type').value;
                const remarks = document.getElementById('job-remarks').value;

                if(!title && !content) {
                     app.toast("Please add a link or title", true);
                     return;
                }
                const finalTitle = title || "Untitled Job";

                const newId = STATE.editingId || Date.now().toString();

                // Determine new status and behavior
                let newStatus = 'pending';
                let isAppliedAction = false;

                if (statusOrFlag === true) {
                    isAppliedAction = true;
                    // If explicitly Applied button clicked, we let status modal handle final status
                    // but we default to pending effectively until user chooses in next step
                } else if (typeof statusOrFlag === 'string') {
                    newStatus = statusOrFlag;
                }

                const itemData = { title: finalTitle, content, linkType, remarks, category: 'job', updated: Date.now() };

                if(STATE.editingId) {
                    const idx = STATE.data.notes.findIndex(n => n.id === STATE.editingId);
                    if(idx > -1) {
                        const currentNote = STATE.data.notes[idx];
                        // Only update status if a specific string status was passed (e.g. 'direct-apply')
                        // If 'true' was passed, we preserve current status and let modal update it
                        // If null passed (Save button), preserve current status
                        const statusToSave = (typeof statusOrFlag === 'string') ? statusOrFlag : currentNote.status;
                        STATE.data.notes[idx] = { ...currentNote, ...itemData, status: statusToSave };
                    }
                } else {
                    STATE.data.notes.unshift({ id: newId, created: Date.now(), status: newStatus, ...itemData });
                    app.recalculateStreak();
                }

                app.saveToCloud();
                document.getElementById('modal-job').classList.add('hidden');

                if (isAppliedAction) {
                    setTimeout(() => {
                        app.openStatusModal(newId);
                        app.toast("Job saved! Select how you applied...");
                    }, 300);
                } else {
                    let msg = "Job Saved";
                    if (newStatus === 'direct-apply') msg = "Added to Direct Apply queue";
                    app.toast(msg);
                    app.refreshUI();
                }
            },

            openStatusModal: (id) => {
                STATE.targetStatusId = id;
                const note = STATE.data.notes.find(n => n.id === id);
                if(note) document.getElementById('status-modal-title').textContent = `Update: ${note.title}`;
                document.getElementById('modal-status').classList.remove('hidden');
            },

            closeStatusModal: () => {
                document.getElementById('modal-status').classList.add('hidden');
                STATE.targetStatusId = null;
            },

             updateStatus: (newStatus, medium = null) => {
                if (STATE.targetStatusId) {
                    const note = STATE.data.notes.find(n => n.id === STATE.targetStatusId);
                    if (note) {
                        const oldStatus = note.status || 'pending';
                        const isOldDone = oldStatus === 'applied' || oldStatus === 'completed';
                        const isNewDone = newStatus === 'applied' || newStatus === 'completed';
                        if (note.category === 'job') {
                            const todayStr = new Date().toLocaleDateString('en-CA');
                            if (!STATE.data.stats) STATE.data.stats = { history: {}, dailyTarget: 5 };
                            if (!STATE.data.stats.history) STATE.data.stats.history = {};
                            let entry = STATE.data.stats.history[todayStr];
                            if (entry === undefined) {
                                entry = { total: 0, methods: {} };
                                STATE.data.stats.history[todayStr] = entry;
                            } else if (typeof entry === 'number') {
                                entry = { total: entry, methods: { 'direct': entry } };
                                STATE.data.stats.history[todayStr] = entry;
                            }
                            if (isNewDone && !isOldDone) {
                                entry.total++;
                                const finalMedium = medium || 'direct';
                                if (!entry.methods) entry.methods = {};
                                if (!entry.methods[finalMedium]) entry.methods[finalMedium] = 0;
                                entry.methods[finalMedium]++;
                                note.applicationMedium = finalMedium;
                                app.toast("Job Applied! 🔥");
                            } else if (!isNewDone && isOldDone) {
                                if (entry.total > 0) entry.total--;
                                const oldMedium = note.applicationMedium || 'direct';
                                if (entry.methods && entry.methods[oldMedium] > 0) {
                                    entry.methods[oldMedium]--;
                                }
                            }
                        }
                        note.status = newStatus;
                        note.updated = Date.now();
                        app.saveToCloud();
                        app.renderJobs();
                        app.recalculateStreak();
                        app.renderVelocity(); // Ensure speedometer updates immediately
                    }
                }
                app.closeStatusModal();
            },

            promoteToInterview: () => {
                if(STATE.targetStatusId) {
                    const note = STATE.data.notes.find(n => n.id === STATE.targetStatusId);
                    if(note) {
                        // Switch type
                        note.category = 'interview';

                        // Extract Role and Company
                        if (note.title && note.title.includes(' @ ')) {
                            const parts = note.title.split(' @ ');
                            note.role = parts[0].trim();
                            note.company = parts.slice(1).join(' @ ').trim();
                        } else {
                            note.company = note.title; // Map title to company if no separator
                            note.role = '';
                        }

                        note.status = 'Test Received';
                        note.updated = Date.now();

                        // Initial history entry
                        if (!note.history) note.history = [];
                        note.history.push({
                            status: "Test Received",
                            date: Date.now(),
                            completed: false,
                            notes: "Started Interview Process"
                        });

                        app.saveToCloud();
                        app.closeStatusModal();

                        // Switch view and open modal for details
                        app.switchView('interviews');
                        setTimeout(() => {
                            app.openInterviewModal(note.id);
                            app.toast("Moved to Interview Pipeline 🚀");
                        }, 300);
                    }
                }
            },

            deleteNote: (id) => {
                app.openConfirm("Delete this item?", () => {
                    const noteIndex = STATE.data.notes.findIndex(n => n.id === id);
                    if (noteIndex > -1) {
                        const note = STATE.data.notes[noteIndex];
                        const isDone = note.status === 'applied' || note.status === 'completed';
                        if (note.category === 'job' && isDone && note.updated) {
                             const dateStr = new Date(note.updated).toLocaleDateString('en-CA');
                             const entry = STATE.data.stats.history[dateStr];
                             if (entry) {
                                 if (typeof entry === 'number' && entry > 0) {
                                     STATE.data.stats.history[dateStr]--;
                                 } else if (typeof entry === 'object' && entry.total > 0) {
                                     entry.total--;
                                     const med = note.applicationMedium || 'direct';
                                     if (entry.methods && entry.methods[med] > 0) entry.methods[med]--;
                                 }
                             }
                        }
                        STATE.data.notes.splice(noteIndex, 1);
                        app.recalculateStreak();
                        app.saveToCloud();
                        app.refreshUI();
                        // renderVelocity is called in refreshUI, so it's covered here
                    }
                });
            },

            // --- FIX: Correct toggle logic for new folder IDs ---
            toggleFolder: (id) => {
                const list = document.getElementById(id);
                // Correctly derive icon ID for groups ending in "-list"
                let iconId = id.replace('-list', '-icon');

                // Fallback for legacy IDs (job-group-*) if any exist
                if (id.startsWith('job-group-')) {
                    iconId = id.replace('job', 'icon');
                }

                const icon = document.getElementById(iconId);

                if (list) {
                    if (list.classList.contains('hidden')) {
                        list.classList.remove('hidden');
                        if (icon) icon.classList.add('rotate-90');
                        STATE.openFolders.add(id);
                    } else {
                        list.classList.add('hidden');
                        if (icon) icon.classList.remove('rotate-90');
                        STATE.openFolders.delete(id);
                    }
                    // Save new configuration to local storage
                    localStorage.setItem('magic_pouch_folders', JSON.stringify([...STATE.openFolders]));
                }
            },

            // --- INTERVIEW LOGIC ---

            downloadICS: (id) => {
                const item = STATE.data.notes.find(n => n.id === id);
                if(!item || !item.deadline) return;

                const start = new Date(item.deadline);
                // Add 1 hour duration by default
                const end = new Date(start.getTime() + (60 * 60 * 1000));

                const formatTime = (date) => {
                     return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                };

                const icsContent = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'BEGIN:VEVENT',
                    `SUMMARY:Interview: ${item.company} (${item.role})`,
                    `DTSTART:${formatTime(start)}`,
                    `DTEND:${formatTime(end)}`,
                    `DESCRIPTION:Stage: ${item.status}\\nNotes: ${item.notes || ''}`,
                    'END:VEVENT',
                    'END:VCALENDAR'
                ].join('\r\n');

                const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `interview_${item.company.replace(/\s/g,'_')}.ics`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                app.toast("Calendar Event Downloaded");
            },

            // NEW: Interactive Timeline Rendering
            renderTimeline: () => {
                const container = document.getElementById('interview-timeline');
                if(!container) return;
                container.innerHTML = '';

                const today = new Date();
                const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

                const interviews = (STATE.data.notes || []).filter(n => n.category === 'interview' && n.deadline);

                for(let i=0; i<7; i++) {
                    const d = new Date(startToday);
                    d.setDate(startToday.getDate() + i);
                    const isoDate = d.toISOString();

                    // Find interviews for this day
                    const dailyInts = interviews.filter(n => {
                        const nDate = new Date(n.deadline);
                        return nDate.getDate() === d.getDate() &&
                               nDate.getMonth() === d.getMonth() &&
                               nDate.getFullYear() === d.getFullYear();
                    });

                    const isToday = i === 0;
                    const hasEvent = dailyInts.length > 0;

                    // Styling
                    let bgClass = isToday ? "bg-indigo-600 text-white shadow-md ring-2 ring-indigo-200 dark:ring-indigo-900" : "bg-white text-gray-500 border border-gray-100 hover:border-gray-200 dark:bg-[#0a0a0a] dark:border-gray-800 dark:text-slate-400 dark:hover:border-slate-600";
                    let dateClass = isToday ? "text-white" : "text-gray-800 dark:text-white";

                    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNum = d.getDate();

                    const el = document.createElement('div');
                    // Added active:scale-95 for touch feedback
                    el.className = `flex-shrink-0 w-14 h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all snap-start cursor-pointer active:scale-95 ${bgClass}`;
                    el.onclick = () => app.openDaySummary(isoDate);

                    // Dot indicators
                    let dotsHtml = '';
                    if(hasEvent) {
                        dotsHtml = `<div class="flex gap-0.5 mt-0.5">`;
                        // Limit dots to 3 to prevent overflow
                        dailyInts.slice(0, 3).forEach(int => {
                            let dotColor = "bg-indigo-400";
                            if(isToday) dotColor = "bg-white";
                            // Urgent check
                            const now = new Date();
                            const diffH = (new Date(int.deadline) - now) / 36e5;
                            if(diffH < 24 && diffH > 0 && !isToday) dotColor = "bg-red-500";

                            dotsHtml += `<div class="w-1 h-1 rounded-full ${dotColor}"></div>`;
                        });
                         if(dailyInts.length > 3) {
                             dotsHtml += `<div class="w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-gray-300'} opacity-50"></div>`;
                         }
                        dotsHtml += `</div>`;
                    } else {
                         dotsHtml = `<div class="w-1 h-1 rounded-full bg-transparent mt-0.5"></div>`; // spacer
                    }

                    el.innerHTML = `
                        <span class="text-[9px] font-bold uppercase tracking-wide opacity-80">${dayName}</span>
                        <span class="text-base font-black ${dateClass}">${dayNum}</span>
                        ${dotsHtml}
                    `;
                    container.appendChild(el);
                }
            },

            // NEW: Day Summary Logic
            openDaySummary: (isoDate) => {
                const date = new Date(isoDate);
                const list = document.getElementById('day-summary-list');
                const title = document.getElementById('day-summary-date');
                const modal = document.getElementById('modal-day-summary');
                const bg = document.getElementById('modal-day-summary-bg');
                const content = document.getElementById('modal-day-summary-content');

                // Set Title
                const isToday = new Date().toDateString() === date.toDateString();
                title.textContent = isToday ? "Today's Agenda" : date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' });

                // Find Events
                const events = (STATE.data.notes || []).filter(n => {
                    if (n.category !== 'interview' || !n.deadline) return false;
                    const d = new Date(n.deadline);
                    return d.getDate() === date.getDate() &&
                           d.getMonth() === date.getMonth() &&
                           d.getFullYear() === date.getFullYear();
                });

                list.innerHTML = '';
                if (events.length === 0) {
                    list.innerHTML = `<div class="text-center text-gray-400 py-8 italic dark:text-slate-500">Nothing scheduled for this day.<br>Enjoy the focus time! ☕</div>`;
                } else {
                    events.sort((a,b) => new Date(a.deadline) - new Date(b.deadline));
                    events.forEach(evt => {
                        const timeStr = new Date(evt.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        const div = document.createElement('div');
                        div.className = "bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between dark:bg-[#0a0a0a] dark:border-gray-800";
                        div.innerHTML = `
                            <div>
                                <div class="text-xs font-bold text-indigo-500 mb-1">${timeStr}</div>
                                <div class="font-bold text-gray-800 dark:text-white">${evt.company}</div>
                                <div class="text-xs text-gray-500 dark:text-slate-400">${evt.status}</div>
                            </div>
                            <button onclick="app.openInterviewModal('${evt.id}'); app.closeDaySummary()" class="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-indigo-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300">
                                <i class="fas fa-chevron-right text-xs"></i>
                            </button>
                        `;
                        list.appendChild(div);
                    });
                }

                // Show Modal with Animation
                modal.classList.remove('hidden');
                // Small delay to allow display:block to apply before opacity transition
                requestAnimationFrame(() => {
                    bg.classList.remove('opacity-0');
                    content.classList.remove('translate-y-full');
                });
            },

            closeDaySummary: () => {
                const modal = document.getElementById('modal-day-summary');
                const bg = document.getElementById('modal-day-summary-bg');
                const content = document.getElementById('modal-day-summary-content');

                bg.classList.add('opacity-0');
                content.classList.add('translate-y-full');

                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300); // Match CSS transition duration
            },

            renderInterviews: (filter = 'all', searchQuery = '') => {
                const list = document.getElementById('interviews-list');
                if (!list) return;
                list.innerHTML = '';

                let interviews = (STATE.data.notes || []).filter(n => n.category === 'interview');

                // 1. Stats Calculation
                const activeCount = interviews.filter(i => !['Offer', 'Rejected', 'Ghosted'].includes(i.status)).length;
                const offerCount = interviews.filter(i => i.status === 'Offer').length;

                const now = Date.now();
                let urgentCount = 0;
                interviews.forEach(i => {
                    if (i.deadline && !['Offer', 'Rejected', 'Ghosted'].includes(i.status) && !i.stageCompleted) {
                        const diffHours = (new Date(i.deadline).getTime() - now) / (1000 * 60 * 60);
                        if (diffHours > 0 && diffHours < 48) urgentCount++;
                    }
                });

                document.getElementById('stats-int-active').textContent = activeCount;
                document.getElementById('stats-int-offers').textContent = offerCount;
                document.getElementById('stats-int-urgent').textContent = urgentCount;

                // 2. Filtering
                if (filter === 'active') interviews = interviews.filter(i => !['Offer', 'Rejected', 'Ghosted'].includes(i.status));
                if (filter === 'offers') interviews = interviews.filter(i => i.status === 'Offer');
                if (filter === 'archived') interviews = interviews.filter(i => ['Rejected', 'Ghosted'].includes(i.status));

                // 3. Search
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    interviews = interviews.filter(i =>
                        (i.company || '').toLowerCase().includes(q) ||
                        (i.role || '').toLowerCase().includes(q)
                    );
                }

                // 4. Render
                if (interviews.length === 0) {
                    list.innerHTML = `<div class="text-center text-gray-400 mt-10 dark:text-gray-500">No interviews found.</div>`;
                    return;
                }

                // Sort: High Priority > Urgent Deadline > Date Updated
                interviews.sort((a, b) => {
                    if (a.priority !== b.priority) return (b.priority ? 1 : 0) - (a.priority ? 1 : 0);

                    const aUrgent = (a.deadline && !['Offer', 'Rejected'].includes(a.status)) ? new Date(a.deadline).getTime() : Infinity;
                    const bUrgent = (b.deadline && !['Offer', 'Rejected'].includes(b.status)) ? new Date(b.deadline).getTime() : Infinity;

                    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
                    return (b.updated || b.created) - (a.updated || a.created);
                });

                // --- NEW: Dynamic Theme Helper ---
                const getStageTheme = (status) => {
                    switch (status) {
                        case 'Test Received': return { border: 'border-indigo-500', bg: 'bg-gray-50', text: 'text-indigo-700', badge: 'bg-gray-100 text-indigo-700', icon: 'fa-laptop-code' };
                        case 'HR Screen': return { border: 'border-blue-500', bg: 'bg-gray-50', text: 'text-blue-700', badge: 'bg-gray-100 text-blue-700', icon: 'fa-phone-alt' };
                        case 'Technical': return { border: 'border-purple-500', bg: 'bg-gray-50', text: 'text-purple-700', badge: 'bg-gray-100 text-purple-700', icon: 'fa-code' };
                        case 'Final Round': return { border: 'border-orange-500', bg: 'bg-gray-50', text: 'text-orange-700', badge: 'bg-gray-100 text-orange-700', icon: 'fa-user-tie' };
                        case 'Offer': return { border: 'border-emerald-500', bg: 'bg-gray-50', text: 'text-emerald-700', badge: 'bg-gray-100 text-emerald-700', icon: 'fa-gift' };
                        case 'Rejected': return { border: 'border-red-400', bg: 'bg-gray-50', text: 'text-red-700', badge: 'bg-gray-100 text-red-700', icon: 'fa-times-circle' };
                        case 'Ghosted': return { border: 'border-gray-400', bg: 'bg-gray-50', text: 'text-gray-700', badge: 'bg-gray-200 text-gray-500', icon: 'fa-ghost' };
                        case 'Follow Up': return { border: 'border-yellow-500', bg: 'bg-gray-50', text: 'text-yellow-700', badge: 'bg-gray-100 text-yellow-700', icon: 'fa-clock' };
                        default: return { border: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-600', icon: 'fa-circle' };
                    }
                };

                interviews.forEach(interview => {
                    const el = document.createElement('div');
                    const theme = getStageTheme(interview.status);

                    // Deadline Logic - Simplified Badge
                    let deadlineBadge = '';
                    let showCalButton = false;

                    if (interview.stageCompleted) {
                         deadlineBadge = `<span class="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400"><i class="fas fa-check-circle"></i> Done</span>`;
                    } else if (interview.deadline && !['Offer', 'Rejected', 'Ghosted'].includes(interview.status)) {
                        showCalButton = true;
                        const deadlineDate = new Date(interview.deadline);
                        const diffMs = deadlineDate.getTime() - now;
                        const diffHours = diffMs / (1000 * 60 * 60);

                        let dateColor = "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300";
                        let animateClass = "";

                        if (diffMs > 0) {
                            if (diffHours < 24) {
                                dateColor = "bg-gray-100 text-red-600 animate-pulse dark:bg-gray-800 dark:text-red-400";
                            } else if (diffHours < 72) {
                                dateColor = "bg-gray-100 text-orange-600 dark:bg-gray-800 dark:text-orange-400";
                            }
                        } else {
                            dateColor = "bg-gray-200 text-gray-400 dark:bg-[#0a0a0a] dark:text-slate-500";
                        }

                        // Calendar Leaf Visual
                        const month = deadlineDate.toLocaleDateString('en-US', {month:'short'}).toUpperCase();
                        const day = deadlineDate.getDate();
                        const time = deadlineDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                        deadlineBadge = `
                            <div class="flex flex-col items-center justify-center w-10 h-10 rounded-lg ${dateColor} border border-white/10 shadow-sm shrink-0">
                                <span class="text-[8px] font-bold leading-none">${month}</span>
                                <span class="text-sm font-bold leading-none">${day}</span>
                            </div>
                        `;
                    }

                    // Priority Star
                    const starHtml = interview.priority ? `<i class="fas fa-star text-yellow-400 text-xs ml-1" title="High Priority"></i>` : '';

                    // Action Buttons (Streamlined Row)
                    let actionArea = '';

                    if (interview.stageCompleted) {
                        actionArea = `
                            <button onclick="app.promoteStage('${interview.id}')" class="flex-1 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition shadow-sm">
                                Next Stage <i class="fas fa-arrow-right ml-1"></i>
                            </button>
                        `;
                    } else if (!['Offer', 'Rejected', 'Ghosted'].includes(interview.status)) {
                        actionArea = `
                            <button onclick="app.markStageComplete('${interview.id}')" class="flex-1 bg-white border border-${theme.border.replace('border-', '')} ${theme.text} text-xs font-bold py-2 rounded-lg hover:bg-gray-50 active:scale-95 transition flex items-center justify-center gap-1.5 dark:bg-[#0a0a0a] dark:border-slate-600 dark:${theme.text}">
                                <i class="fas fa-check"></i> Mark Done
                            </button>
                        `;
                    } else {
                        // Archived states
                        actionArea = `<div class="text-[10px] text-gray-400 italic flex-1 text-center">Process Ended</div>`;
                    }

                    // COMPACT CARD LAYOUT
                    el.className = `relative bg-white dark:bg-[#0a0a0a] rounded-xl p-3 shadow-sm border-l-4 ${theme.border} mb-3 active:scale-[0.99] transition`;
                    el.innerHTML = `
                        <div class="flex justify-between items-start mb-2">
                            <div class="min-w-0 pr-2">
                                <h3 class="font-bold text-gray-800 dark:text-white text-base truncate leading-tight">${interview.company} ${starHtml}</h3>
                                <p class="text-xs text-gray-500 dark:text-slate-400 font-medium truncate">${interview.role}</p>
                            </div>
                            <div class="flex items-start gap-2">
                                ${deadlineBadge}
                            </div>
                        </div>

                        <!-- Badge Row -->
                        <div class="flex items-center gap-2 mb-3">
                             <div class="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${theme.badge} dark:bg-opacity-20">
                                <i class="fas ${theme.icon}"></i> ${interview.status}
                             </div>
                             ${interview.deadline ? `<div class="text-[10px] font-mono text-gray-400 dark:text-slate-500">${new Date(interview.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>` : ''}
                        </div>

                        <!-- Actions Footer -->
                        <div class="flex items-center gap-2 pt-2 border-t border-gray-50 dark:border-gray-800/50">
                            <!-- Utilities -->
                            <div class="flex gap-1">
                                <button onclick="app.openInterviewModal('${interview.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-zinc-900 transition dark:hover:bg-slate-700"><i class="fas fa-pen text-xs"></i></button>
                                <button onclick="app.openHistoryModal('${interview.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-indigo-500 transition dark:hover:bg-slate-700"><i class="fas fa-history text-xs"></i></button>
                                ${showCalButton ? `<button onclick="app.downloadICS('${interview.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-green-500 transition dark:hover:bg-slate-700"><i class="fas fa-calendar-plus text-xs"></i></button>` : ''}
                                <button onclick="app.deleteNote('${interview.id}')" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-red-500 transition dark:hover:bg-slate-700"><i class="fas fa-trash text-xs"></i></button>
                            </div>
                            <!-- Primary Action -->
                            ${actionArea}
                        </div>
                    `;
                    list.appendChild(el);
                });
            },

            markStageComplete: (id) => {
                const note = STATE.data.notes.find(n => n.id === id);
                if(note) {
                    note.stageCompleted = true;
                    // Logic to set specific completion message
                    let logMsg = `${note.status} Completed`;
                    if(note.status === 'Test Received') logMsg = "Test Completed";
                    else if(note.status === 'Technical') logMsg = "Technical Round Completed";
                    else if(note.status === 'HR Screen') logMsg = "HR Call Completed";

                    if (!note.history) note.history = [];
                    note.history.push({
                        status: note.status,
                        date: Date.now(),
                        completed: true,
                        notes: logMsg
                    });

                    app.saveToCloud();
                    app.renderInterviews(STATE.interviewFilter);
                    app.renderTimeline();
                    app.toast("Stage Completed! 🎉");
                }
            },

            promoteStage: (id) => {
                const note = STATE.data.notes.find(n => n.id === id);
                if(note) {
                     // Open modal to set new details, passing true to indicate promotion
                     app.openInterviewModal(id, true);
                     app.toast("Select the next stage & deadline");
                }
            },

            setFollowUp: (id) => {
                const note = STATE.data.notes.find(n => n.id === id);
                if(note) {
                    note.status = "Follow Up";
                    note.stageCompleted = false;
                    note.updated = Date.now();

                     if (!note.history) note.history = [];
                     note.history.push({ status: "Waiting", date: Date.now(), notes: "Moved to Follow Up" });

                    app.saveToCloud();
                    app.renderInterviews(STATE.interviewFilter);
                    app.toast("Moved to Follow Up");
                }
            },

             setGhosted: (id) => {
                const note = STATE.data.notes.find(n => n.id === id);
                if(note) {
                    note.status = "Ghosted";
                    note.stageCompleted = false;
                    note.updated = Date.now();

                     if (!note.history) note.history = [];
                     note.history.push({ status: "Waiting", date: Date.now(), notes: "Marked Ghosted" });

                    app.saveToCloud();
                    app.renderInterviews(STATE.interviewFilter);
                    app.toast("Moved to Archived");
                }
            },

            filterInterviews: (type) => {
                STATE.interviewFilter = type;
                document.querySelectorAll('.int-filter-btn').forEach(btn => {
                    if (btn.dataset.filter === type) {
                        btn.classList.add('bg-gray-800', 'text-white', 'dark:bg-white', 'dark:text-slate-900', 'shadow-sm');
                        btn.classList.remove('bg-gray-100', 'text-gray-500', 'dark:bg-[#0a0a0a]', 'dark:text-slate-400');
                    } else {
                        btn.classList.remove('bg-gray-800', 'text-white', 'dark:bg-white', 'dark:text-slate-900', 'shadow-sm');
                        btn.classList.add('bg-gray-100', 'text-gray-500', 'dark:bg-[#0a0a0a]', 'dark:text-slate-400');
                    }
                });
                app.renderInterviews(type, document.getElementById('global-search').value);
            },

            openInterviewModal: (id = null, isPromoting = false) => {
                STATE.editingId = id;
                STATE.isPromoting = isPromoting;
                const modal = document.getElementById('modal-interview');
                const company = document.getElementById('int-company');
                const role = document.getElementById('int-role');
                const status = document.getElementById('int-status');
                const deadline = document.getElementById('int-deadline');
                const priority = document.getElementById('int-priority');
                const notes = document.getElementById('int-notes');

                if (id) {
                    const item = STATE.data.notes.find(n => n.id === id);
                    company.value = item.company || '';
                    role.value = item.role || '';
                    status.value = item.status || 'Test Received';
                    deadline.value = item.deadline || '';
                    priority.checked = !!item.priority;
                    notes.value = item.notes || '';
                } else {
                    company.value = '';
                    role.value = '';
                    status.value = 'Test Received';

                    // Set default deadline to Today 11:59 PM
                    const now = new Date();
                    const pad = (n) => n < 10 ? '0' + n : n;
                    deadline.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T23:59`;

                    priority.checked = false;
                    notes.value = '';
                }
                modal.classList.remove('hidden');
            },

            // New: Open History Modal from Card
            openHistoryModal: (id) => {
                 const modal = document.getElementById('modal-history');
                 const list = document.getElementById('history-list-content');
                 const item = STATE.data.notes.find(n => n.id === id);

                 if (!item || !item.history || item.history.length === 0) {
                     list.innerHTML = `<div class="text-center text-gray-400 py-6 italic text-sm">No history recorded yet.</div>`;
                 } else {
                     list.innerHTML = '';
                     // Sort by date desc
                     const sortedHist = [...item.history].sort((a,b) => b.date - a.date);
                     sortedHist.forEach(h => {
                        const d = new Date(h.date);
                        // Format: 14/02/2026 12:58 PM
                        const dateStr = d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                        const div = document.createElement('div');
                        div.className = "flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 dark:bg-[#0a0a0a] dark:border-gray-800";

                        let icon = '<i class="fas fa-circle text-[8px] text-gray-400 mt-1.5"></i>';
                        let titleClass = "text-gray-700 dark:text-slate-300";

                        if (h.completed) {
                            icon = '<i class="fas fa-check-circle text-green-500 mt-0.5"></i>';
                            titleClass = "text-green-700 dark:text-green-400";
                        } else if (h.notes && (h.notes.includes("Moved to") || h.notes.includes("Started") || h.notes.includes("New Round:"))) {
                            icon = '<i class="fas fa-arrow-circle-right text-indigo-500 mt-0.5"></i>';
                            titleClass = "text-indigo-700 dark:text-indigo-400";
                        }

                        div.innerHTML = `
                            <div class="shrink-0 pt-0.5">${icon}</div>
                            <div>
                                <div class="font-bold text-sm ${titleClass}">${h.notes || h.status}</div>
                                <div class="text-[10px] text-gray-400 font-mono mt-0.5 dark:text-slate-500">${dateStr}</div>
                            </div>
                        `;
                        list.appendChild(div);
                     });
                 }
                 modal.classList.remove('hidden');
            },

            saveInterview: () => {
                const company = document.getElementById('int-company').value.trim();
                const role = document.getElementById('int-role').value.trim();
                const status = document.getElementById('int-status').value;
                const deadline = document.getElementById('int-deadline').value;
                const priority = document.getElementById('int-priority').checked;
                const notes = document.getElementById('int-notes').value.trim();

                if (!company) {
                    app.toast('Company Name Required', true);
                    return;
                }

                // Get previous item to check for status change
                let oldStatus = null;
                let isStageReset = false;

                if (STATE.editingId) {
                     const oldItem = STATE.data.notes.find(n => n.id === STATE.editingId);
                     if(oldItem) {
                         oldStatus = oldItem.status;
                         // If status changed OR it's an explicit promotion
                         if (oldItem.status !== status || STATE.isPromoting) {
                             isStageReset = true;
                         }
                     }
                }

                const itemData = {
                    company,
                    role,
                    status,
                    deadline,
                    priority,
                    notes,
                    category: 'interview',
                    updated: Date.now()
                };

                if (isStageReset) {
                    itemData.stageCompleted = false; // Reset completed flag for new stage
                }

                if (STATE.editingId) {
                    const idx = STATE.data.notes.findIndex(n => n.id === STATE.editingId);
                    if (idx > -1) {
                        const oldItem = STATE.data.notes[idx];
                        // If status changed OR it's an explicit promotion, log the transition
                        if (oldItem.status !== status || STATE.isPromoting) {
                             if (!oldItem.history) oldItem.history = [];

                             let notesMsg = `Moved to ${status}`;
                             if (STATE.isPromoting && oldItem.status === status) {
                                 notesMsg = `New Round: ${status}`;
                             }

                             oldItem.history.push({
                                 status: status,
                                 date: Date.now(),
                                 completed: false,
                                 notes: notesMsg
                             });
                        }

                        STATE.data.notes[idx] = { ...oldItem, ...itemData };
                    }
                } else {
                    STATE.data.notes.unshift({
                        id: Date.now().toString(),
                        created: Date.now(),
                        history: [{status: status, date: Date.now(), completed: false, notes: `Started: ${status}`}],
                        stageCompleted: false,
                        ...itemData
                    });
                }

                app.saveToCloud();
                document.getElementById('modal-interview').classList.add('hidden');
                app.renderInterviews(STATE.interviewFilter);
                app.renderTimeline(); // Update timeline
                app.toast('Pipeline Updated');
            },

            renderJobs: (filter = '') => {
                const list = document.getElementById('jobs-list');
                list.innerHTML = '';
                let jobs = (STATE.data.notes || []).filter(n => n.category === 'job');

                if(filter) {
                    const q = filter.toLowerCase();
                    jobs = jobs.filter(n => n.title.toLowerCase().includes(q));
                    if(jobs.length === 0) {
                        list.innerHTML = `<div class="text-center text-gray-400 mt-10 dark:text-gray-500">No match.</div>`;
                        return;
                    }
                    const container = document.createElement('div');
                    container.className = "space-y-3 fade-in";
                    jobs.forEach(job => container.appendChild(app.createJobCard(job)));
                    list.appendChild(container);
                    return;
                }

                if(jobs.length === 0) {
                    list.innerHTML = `<div class="text-center text-gray-400 mt-10 dark:text-gray-500">No active jobs.<br>Added jobs expire in 7 days.</div>`;
                    return;
                }

                // --- PRIORITY GROUPING LOGIC ---

                // Helper to render a group
                const renderGroup = (title, items, iconClass, colorClass, borderClass, idPrefix, isOpenDefault = false) => {
                    if (items.length === 0) return;

                    const listId = `${idPrefix}-list`;
                    const iconId = `${idPrefix}-icon`;

                    let isOpen = STATE.openFolders.has(listId);
                    if (!STATE.hasInitializedFolders && isOpenDefault) {
                        isOpen = true;
                        STATE.openFolders.add(listId);
                    }

                    const listClass = isOpen ? "pl-2 border-l-2 border-gray-100 ml-3 space-y-3 mb-4 dark:border-gray-700" : "hidden pl-2 border-l-2 border-gray-100 ml-3 space-y-3 mb-4 dark:border-gray-700";
                    const arrowClass = isOpen ? `fas fa-chevron-right text-xs transition-transform duration-200 rotate-90` : `fas fa-chevron-right text-xs transition-transform duration-200`;

                    const groupWrapper = document.createElement('div');
                    groupWrapper.className = "fade-in mb-4";
                    groupWrapper.innerHTML = `
                        <div data-click="app.toggleFolder(this.getAttribute('data-list-id'))" data-list-id="${listId}" class="flex items-center justify-between p-3 rounded-xl border ${borderClass} shadow-sm cursor-pointer mb-2 active:scale-[0.99] transition select-none ${colorClass} dark:opacity-100">
                            <div class="flex items-center gap-3">
                                <i id="${iconId}" class="${arrowClass} text-gray-400"></i>
                                <div class="flex items-center gap-2">
                                    <i class="${iconClass}"></i>
                                    <span class="font-bold text-sm">${title}</span>
                                </div>
                            </div>
                            <span class="text-[10px] font-bold opacity-60 bg-white/50 px-2 py-0.5 rounded-full">${items.length}</span>
                        </div>
                    `;

                    const itemsContainer = document.createElement('div');
                    itemsContainer.id = listId;
                    itemsContainer.className = listClass;
                    items.forEach(job => itemsContainer.appendChild(app.createJobCard(job)));

                    groupWrapper.appendChild(itemsContainer);
                    list.appendChild(groupWrapper);
                };

                // 1. GROUP 1: Referrals Received (Sea Green)
                const referralReceivedJobs = jobs.filter(j => j.status === 'referral-received' && getDaysDifference(j.created) <= 7);
                renderGroup(
                    "Referrals Received",
                    referralReceivedJobs,
                    "fas fa-handshake text-teal-600",
                    "bg-zinc-50 text-teal-900 border-gray-200 dark:bg-zinc-900 dark:text-teal-100 dark:border-teal-800",
                    "border-gray-200",
                    "group-ref",
                    true
                );

                // 2. GROUP 2: Direct Apply (Purple)
                const directApplyJobs = jobs.filter(j => j.status === 'direct-apply' && getDaysDifference(j.created) <= 7);
                renderGroup(
                    "Direct Apply",
                    directApplyJobs,
                    "fas fa-location-arrow text-purple-600",
                    "bg-zinc-50 text-purple-900 border-gray-200 dark:bg-zinc-900 dark:text-purple-100 dark:border-purple-800",
                    "border-gray-200",
                    "group-direct",
                    true
                );

                // 3. GROUP 3: Chronological Flow (7 Days Ago -> Today)
                const remainingJobs = jobs.filter(j => j.status !== 'referral-received' && j.status !== 'direct-apply');

                const groups = {};
                remainingJobs.forEach(job => {
                    const daysOld = getDaysDifference(job.created);
                    if(daysOld > 7) return;
                    if(!groups[daysOld]) groups[daysOld] = [];
                    groups[daysOld].push(job);
                });

                // Sort Descending: 7, 6, 5... 0 (Today)
                const sortedKeysDesc = Object.keys(groups).map(Number).sort((a,b) => b - a);

                sortedKeysDesc.forEach(day => {
                    let label = day === 0 ? "Today" : day === 1 ? "Yesterday" : `${day} Days Ago`;
                    let dayJobs = groups[day];

                    // Sort by priority inside date group
                    dayJobs.sort((a, b) => {
                        const sA = (a.status === 'referral' ? 'referral-asked' : (a.status || 'pending'));
                        const sB = (b.status === 'referral' ? 'referral-asked' : (b.status || 'pending'));
                        const pA = STATUS_PRIORITY[sA] !== undefined ? STATUS_PRIORITY[sA] : 1;
                        const pB = STATUS_PRIORITY[sB] !== undefined ? STATUS_PRIORITY[sB] : 1;
                        return pA - pB;
                    });

                    const counts = { 'pending': 0, 'reminder': 0, 'referral-asked': 0, 'applied': 0 };
                    dayJobs.forEach(j => {
                        let s = j.status || 'pending';
                        if(s === 'referral') s = 'referral-asked';
                        if(s === 'completed') s = 'applied';
                        if(s === 'referral-pending') s = 'pending';
                        if(counts[s] !== undefined) counts[s]++;
                    });

                    let badgeHtml = '';
                    if(counts.pending > 0) badgeHtml += `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 mr-1 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">${counts.pending} To Apply</span>`;
                    if(counts.reminder > 0) badgeHtml += `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-red-700 border border-gray-200 mr-1 dark:bg-gray-800 dark:text-red-300 dark:border-red-800">${counts.reminder} Due</span>`;
                    if(counts['referral-asked'] > 0) badgeHtml += `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-orange-700 border border-gray-200 mr-1 dark:bg-gray-800 dark:text-orange-300 dark:border-orange-800">${counts['referral-asked']} Asked</span>`;
                    if(counts.applied > 0) badgeHtml += `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-50 text-green-600 border border-gray-100 dark:bg-gray-800 dark:text-green-300 dark:border-green-800">${counts.applied} Done</span>`;

                    // Style Logic
                    let bgClasses = "";
                    let borderColor = "";
                    let textColor = "";
                    let iconColor = "";
                    if (day === 0) {
                        bgClasses = "bg-zinc-50 dark:bg-zinc-900 ";
                        borderColor = "border-gray-100 dark:border-blue-800";
                        textColor = "text-blue-900 dark:text-blue-100";
                        iconColor = "text-blue-500 dark:text-blue-400";
                    } else if (day === 1) {
                        bgClasses = "bg-zinc-50 dark:bg-zinc-900 ";
                        borderColor = "border-gray-200 dark:border-orange-800";
                        textColor = "text-orange-900 dark:text-orange-100";
                        iconColor = "text-orange-600 dark:text-orange-400";
                    } else if (day <= 3) {
                        bgClasses = "bg-zinc-50 dark:bg-zinc-900 ";
                        borderColor = "border-gray-200 dark:border-red-800";
                        textColor = "text-red-900 dark:text-red-100";
                        iconColor = "text-red-500 dark:text-red-400";
                    } else {
                        bgClasses = "bg-red-50 dark:bg-red-900/30 ";
                        borderColor = "border-red-300 dark:border-red-900";
                        textColor = "text-red-950 dark:text-red-200";
                        iconColor = "text-red-700 dark:text-red-500";
                    }

                    const listId = `job-group-${day}`;
                    const iconId = `icon-group-${day}`;
                    const isOpen = STATE.openFolders.has(listId);
                    const listClass = isOpen ? "pl-2 border-l-2 border-gray-100 ml-3 space-y-3 mb-4 dark:border-gray-700" : "hidden pl-2 border-l-2 border-gray-100 ml-3 space-y-3 mb-4 dark:border-gray-700";
                    const iconClass = isOpen ? `fas fa-chevron-right text-xs ${iconColor} transition-transform duration-200 rotate-90` : `fas fa-chevron-right text-xs ${iconColor} transition-transform duration-200`;
                    const groupWrapper = document.createElement('div');
                    groupWrapper.className = "fade-in";
                    groupWrapper.innerHTML = `
                        <div data-click="app.toggleFolder(this.getAttribute('data-list-id'))" data-list-id="${listId}" class="flex items-center justify-between p-3 rounded-xl border ${borderColor} shadow-sm cursor-pointer mb-2 active:scale-[0.99] transition select-none ${bgClasses} dark:opacity-100">
                            <div class="flex items-center gap-3">
                                <i id="${iconId}" class="${iconClass}"></i>
                                <span class="font-bold text-sm ${textColor}">${label}</span>
                            </div>
                            <div class="flex gap-1 flex-wrap justify-end max-w-[60%]">${badgeHtml}</div>
                        </div>
                    `;
                    const itemsContainer = document.createElement('div');
                    itemsContainer.id = listId;
                    itemsContainer.className = listClass;
                    dayJobs.forEach(job => itemsContainer.appendChild(app.createJobCard(job)));
                    groupWrapper.appendChild(itemsContainer);
                    list.appendChild(groupWrapper);
                });
                if (!STATE.hasInitializedFolders && sortedKeysDesc.length > 0) STATE.hasInitializedFolders = true;
            },

            createJobCard: (job) => {
                const el = document.createElement('div');
                let status = job.status || 'pending';
                if(status === 'referral') status = 'referral-asked';
                if(status === 'referral-pending') status = 'pending';
                const isDone = status === 'applied' || status === 'completed';
                const dateStr = new Date(job.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                let borderColor = "border-gray-100 dark:border-gray-700";
                let badgeHtml = "";
                let statusIcon = "fa-ellipsis-h";
                let statusBtnClass = "bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500";

                if (status === 'referral-received') {
                    // SEA GREEN THEME
                    borderColor = "border-gray-200 border-l-4 border-l-teal-400 dark:border-teal-900 dark:border-l-teal-500";
                    badgeHtml = `<span class="text-[9px] font-bold text-teal-600 bg-gray-50 px-1.5 py-0.5 rounded mr-2 dark:bg-gray-800 dark:text-teal-300">REFERRAL RECEIVED</span>`;
                    statusIcon = "fa-handshake";
                    statusBtnClass = "bg-gray-100 text-teal-500 dark:bg-gray-800 dark:text-teal-400";
                } else if (status === 'direct-apply') {
                    // PURPLE THEME
                    borderColor = "border-gray-200 border-l-4 border-l-purple-400 dark:border-purple-900 dark:border-l-purple-500";
                    badgeHtml = `<span class="text-[9px] font-bold text-purple-600 bg-gray-50 px-1.5 py-0.5 rounded mr-2 dark:bg-gray-800 dark:text-purple-300">DIRECT APPLY</span>`;
                    statusIcon = "fa-location-arrow";
                    statusBtnClass = "bg-gray-100 text-purple-500 dark:bg-gray-800 dark:text-purple-400";
                } else if (status === 'referral-asked') {
                    borderColor = "border-gray-200 border-l-4 border-l-orange-400 dark:border-orange-900 dark:border-l-orange-500";
                    badgeHtml = `<span class="text-[9px] font-bold text-orange-600 bg-gray-50 px-1.5 py-0.5 rounded mr-2 dark:bg-gray-800 dark:text-orange-300">REFERRAL ASKED</span>`;
                    statusIcon = "fa-paper-plane";
                    statusBtnClass = "bg-gray-100 text-orange-500 dark:bg-gray-800 dark:text-orange-400";
                } else if (status === 'reminder') {
                    borderColor = "border-gray-200 border-l-4 border-l-red-500 dark:border-red-900 dark:border-l-red-500";
                    badgeHtml = `<span class="text-[9px] font-bold text-red-600 bg-gray-50 px-1.5 py-0.5 rounded mr-2 animate-pulse dark:bg-gray-800 dark:text-red-300">FOLLOW-UP DUE</span>`;
                    statusIcon = "fa-bell";
                    statusBtnClass = "bg-gray-100 text-red-500 dark:bg-gray-800 dark:text-red-400";
                } else if (isDone) {
                    borderColor = "border-gray-100 bg-gray-50 dark:border-green-900 dark:bg-gray-800";
                    statusIcon = "fa-check";
                    statusBtnClass = "bg-gray-100 text-green-600 dark:bg-gray-800 dark:text-green-400";
                    if (job.applicationMedium) {
                        let medLabel = job.applicationMedium;
                        if (medLabel === 'cold-email') medLabel = 'Cold Email';
                        if (medLabel === 'direct') medLabel = 'Direct';
                        badgeHtml = `<span class="text-[9px] font-bold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded mr-2 dark:bg-gray-700 dark:text-gray-400 uppercase tracking-wider">${medLabel}</span>`;
                    }
                } else {
                    statusIcon = "fa-circle";
                    statusBtnClass = "bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600";
                }

                el.className = `p-3 rounded-xl shadow-sm border ${borderColor} bg-white relative active:scale-[0.99] transition flex justify-between items-start ${isDone ? 'opacity-60' : ''} dark:bg-dark-card`;
                let iconClass = "fa-briefcase";
                if(job.linkType === 'linkedin') iconClass = "fa-brands fa-linkedin";
                if(job.linkType === 'site') iconClass = "fa-globe";

                let url = job.content.trim();
                if (!url.match(/^https?:\/\//i) && !url.match(/^mailto:/i)) url = 'https://' + url;
                const safeUrl = url.replace(/"/g, '&quot;');
                const remarksHtml = job.remarks ?
                    `<div class="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100 flex gap-2 items-start dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400">
                        <i class="fas fa-sticky-note text-gray-300 mt-0.5 dark:text-gray-600"></i>
                        <span class="line-clamp-2 whitespace-pre-wrap">${job.remarks}</span>
                     </div>` : '';

                el.innerHTML = `
                    <div class="flex-1 min-w-0">
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 cursor-pointer no-underline text-inherit block mb-1">
                            <div class="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-blue-600 text-xs dark:bg-gray-800 dark:border-blue-800 dark:text-blue-400">
                                <i class="${job.linkType === 'linkedin' ? 'fab' : 'fas'} ${iconClass}"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="flex flex-wrap items-center gap-y-0.5">
                                    ${badgeHtml}
                                    <h4 class="font-bold text-gray-800 text-sm leading-tight break-words ${isDone ? 'line-through decoration-green-500' : ''} dark:text-gray-200 mr-1">${job.title}</h4>
                                </div>
                                <p class="text-[10px] text-gray-400 truncate dark:text-gray-500">${job.content}</p>
                            </div>
                        </a>
                        ${remarksHtml}
                    </div>
                    <div class="flex items-center gap-2 ml-2 self-start mt-1">
                        <div class="flex flex-col items-end gap-1">
                            <span class="text-[9px] text-gray-400 font-medium whitespace-nowrap dark:text-gray-600">${dateStr}</span>
                            <div class="flex items-center gap-2">
                                <button onclick="app.copyText('${job.content.replace(/'/g, "\\'")}')" class="text-gray-300 hover:text-zinc-900 p-2 dark:text-gray-600 dark:hover:text-zinc-100" title="Copy Link"><i class="fas fa-link text-xs"></i></button>
                                <button onclick="app.openStatusModal('${job.id}')" class="w-8 h-8 rounded-full ${statusBtnClass} flex items-center justify-center shadow-sm hover:brightness-95 transition">
                                    <i class="fas ${statusIcon} text-xs"></i>
                                </button>
                                <button onclick="app.openJobModal('${job.id}')" class="text-gray-300 hover:text-zinc-900 p-2 dark:text-gray-600 dark:hover:text-zinc-100"><i class="fas fa-pen text-xs"></i></button>
                                <button onclick="app.deleteNote('${job.id}')" class="text-gray-300 hover:text-red-500 p-2 dark:text-gray-600 dark:hover:text-red-400"><i class="fas fa-trash text-xs"></i></button>
                            </div>
                        </div>
                    </div>
                `;
                return el;
            },

            renderTemplates: (filter = '') => {
                 const list = document.getElementById('templates-list');
                 list.innerHTML = '';
                 let templates = (STATE.data.notes || []).filter(n => n.category === 'template');
                 if(filter) {
                    const q = filter.toLowerCase();
                    templates = templates.filter(t => (t.title || '').toLowerCase().includes(q) || (t.folder || '').toLowerCase().includes(q) || String(t.tags || '').toLowerCase().includes(q));
                    if (templates.length === 0) { list.innerHTML = `<div class="text-center text-gray-400 mt-10 dark:text-gray-500">No matching templates.</div>`; return; }
                    templates.forEach(t => list.appendChild(app.createTemplateCard(t)));
                    return;
                 }
                 if (templates.length === 0) { list.innerHTML = `<div class="text-center text-gray-400 mt-10 dark:text-gray-500">No templates. <br>Create one to save time!</div>`; return; }
                 const folders = {};
                 templates.forEach(t => { const f = t.folder ? t.folder.trim() : 'General'; if(!folders[f]) folders[f] = []; folders[f].push(t); });
                 if (STATE.templateFolder) {
                     document.getElementById('btn-template-back').classList.remove('hidden');
                     document.getElementById('template-view-title').textContent = STATE.templateFolder;
                     document.getElementById('template-view-subtitle').textContent = "Tap to edit • Swipe to delete";
                     const folderTpls = folders[STATE.templateFolder] || [];
                     folderTpls.forEach(t => list.appendChild(app.createTemplateCard(t)));
                     if(folderTpls.length === 0) app.closeFolder();
                 } else {
                     document.getElementById('btn-template-back').classList.add('hidden');
                     document.getElementById('template-view-title').textContent = "Library";
                     document.getElementById('template-view-subtitle').textContent = "Manage Templates & Links";
                     Object.keys(folders).sort().forEach(folderName => {
                         const count = folders[folderName].length;
                         const div = document.createElement('div');
                         div.className = "bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center cursor-pointer active:scale-[0.99] transition dark:bg-dark-card dark:border-dark-border";
                         div.onclick = (e) => { app.openFolder(folderName); };
                         div.innerHTML = `<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-yellow-500 dark:bg-gray-800 dark:text-yellow-400"><i class="fas fa-folder"></i></div><div><h4 class="font-bold text-gray-800 text-sm dark:text-gray-200">${folderName}</h4><p class="text-[10px] text-gray-400 dark:text-gray-500">${count} items</p></div></div><div class="flex gap-2"><button onclick="event.stopPropagation(); app.openRenameFolder('${folderName}')" class="text-gray-300 hover:text-zinc-900 p-2 dark:text-gray-600 dark:hover:text-zinc-100"><i class="fas fa-pen text-xs"></i></button><i class="fas fa-chevron-right text-gray-300 text-xs dark:text-gray-600"></i></div>`;
                         list.appendChild(div);
                     });
                 }
                 const datalist = document.getElementById('folder-list-data'); datalist.innerHTML = '';
                 Object.keys(folders).forEach(f => { const op = document.createElement('option'); op.value = f; datalist.appendChild(op); });
            },

            openFolder: (name) => { STATE.templateFolder = name; app.renderTemplates(); },
            closeFolder: () => { STATE.templateFolder = null; app.renderTemplates(); },

            createTemplateCard: (t) => {
                const div = document.createElement('div');
                div.className = "bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative group dark:bg-dark-card dark:border-dark-border";
                const tagsStr = (typeof t.tags === 'string') ? t.tags : '';
                const tagsHtml = tagsStr ? tagsStr.split(',').map(tag => `<span class="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider dark:bg-gray-800 dark:text-gray-400">${tag.trim()}</span>`).join('') : '';
                const isEasy = t.easyAccess ? '<i class="fas fa-bolt text-yellow-400 text-xs" title="Easy Access"></i>' : '';
                div.innerHTML = `<div class="flex justify-between items-start mb-2"><div><div class="flex items-center gap-2"><h4 class="font-bold text-gray-800 text-sm dark:text-gray-200">${t.title}</h4>${isEasy}</div><div class="flex flex-wrap gap-1 mt-1">${tagsHtml}</div></div><div class="flex gap-1"><button onclick="app.openTemplateModal('${t.id}')" class="text-gray-300 hover:text-zinc-900 p-2 dark:text-gray-600 dark:hover:text-zinc-100"><i class="fas fa-pen text-xs"></i></button><button onclick="app.deleteNote('${t.id}')" class="text-gray-300 hover:text-red-500 p-2 dark:text-gray-600 dark:hover:text-red-400"><i class="fas fa-trash text-xs"></i></button></div></div><div class="bg-gray-50 p-3 rounded-lg text-xs text-gray-600 font-mono leading-relaxed relative group-hover:bg-gray-100 transition cursor-pointer dark:bg-gray-800 dark:text-gray-400 dark:group-hover:bg-gray-700 line-clamp-2" onclick="app.handleTemplateCopy(decodeURIComponent('${encodeURIComponent(t.content)}'))">${t.content}<div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-copy text-gray-400 dark:text-gray-500"></i></div></div>`;
                return div;
            },

            openTemplateModal: (id = null) => { STATE.editingId = id; const modal = document.getElementById('modal-template'); const title = document.getElementById('tpl-title'); const folder = document.getElementById('tpl-folder'); const tags = document.getElementById('tpl-tags'); const content = document.getElementById('tpl-content'); const easy = document.getElementById('tpl-easy'); if (id) { const t = STATE.data.notes.find(n => n.id === id); title.value = t.title; folder.value = t.folder || ''; tags.value = t.tags || ''; content.value = t.content; easy.checked = !!t.easyAccess; } else { title.value = ''; folder.value = STATE.templateFolder || ''; tags.value = ''; content.value = ''; easy.checked = false; } modal.classList.remove('hidden'); },
            saveTemplate: () => { const title = document.getElementById('tpl-title').value; const folder = document.getElementById('tpl-folder').value.trim() || 'General'; const tags = document.getElementById('tpl-tags').value; const content = document.getElementById('tpl-content').value; const easyAccess = document.getElementById('tpl-easy').checked; if(!title) return; const itemData = { title, folder, tags, content, easyAccess, category: 'template', updated: Date.now() }; if (STATE.editingId) { const idx = STATE.data.notes.findIndex(n => n.id === STATE.editingId); if(idx > -1) STATE.data.notes[idx] = { ...STATE.data.notes[idx], ...itemData }; } else { STATE.data.notes.unshift({ id: Date.now().toString(), created: Date.now(), ...itemData }); } app.saveToCloud(); document.getElementById('modal-template').classList.add('hidden'); app.refreshUI(); },
            openRenameFolder: (oldName) => { STATE.renameTargetFolder = oldName; document.getElementById('rename-input').value = oldName; document.getElementById('modal-rename').classList.remove('hidden'); },
            confirmRename: () => { const newName = document.getElementById('rename-input').value.trim(); if (newName && newName !== STATE.renameTargetFolder) { STATE.data.notes.forEach(n => { if (n.category === 'template' && (n.folder || 'General') === STATE.renameTargetFolder) { n.folder = newName; } }); app.saveToCloud(); app.renderTemplates(); } document.getElementById('modal-rename').classList.add('hidden'); },

            renderProfileManageList: () => { const list = document.getElementById('profile-manage-list'); if(!list) return; list.innerHTML = ''; const profiles = STATE.data.profile || []; profiles.forEach((p, idx) => { const div = document.createElement('div'); div.className = "flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100 dark:bg-gray-800 dark:border-gray-700"; div.innerHTML = `<div class="overflow-hidden"><div class="font-bold text-xs text-gray-700 dark:text-gray-300">${p.label}</div><div class="text-[10px] text-gray-400 truncate dark:text-gray-500">${p.value}</div></div><button onclick="app.deleteProfileItem(${idx})" class="text-gray-300 hover:text-red-500 p-2 dark:text-gray-600 dark:hover:text-red-400"><i class="fas fa-trash text-xs"></i></button>`; list.appendChild(div); }); },
            openProfileModal: () => { app.renderProfileManageList(); document.getElementById('modal-profile').classList.remove('hidden'); },
            saveProfileItem: () => { const label = document.getElementById('profile-label').value.trim(); const value = document.getElementById('profile-value').value.trim(); if (label && value) { STATE.data.profile.push({ label, value }); app.saveToCloud(); app.renderProfileManageList(); app.renderQuickActions(); document.getElementById('profile-label').value = ''; document.getElementById('profile-value').value = ''; } },
            deleteProfileItem: (idx) => { STATE.data.profile.splice(idx, 1); app.saveToCloud(); app.renderProfileManageList(); app.renderQuickActions(); },

            renderQuote: () => {
                const quoteEl = document.getElementById('quote-display');
                if(quoteEl) quoteEl.textContent = STATE.data.userQuote || "Dream Big 🚀";
            },
            openQuoteModal: () => {
                document.getElementById('quote-input').value = STATE.data.userQuote;
                document.getElementById('modal-quote').classList.remove('hidden');
                setTimeout(() => document.getElementById('quote-input').focus(), 100);
            },
            saveQuote: () => {
                const val = document.getElementById('quote-input').value.trim();
                if(val) {
                    STATE.data.userQuote = val;
                    app.saveToCloud();
                    app.renderQuote();
                    document.getElementById('modal-quote').classList.add('hidden');
                }
            },
            // Legacy editQuote for reference, now replaced by openQuoteModal
            editQuote: () => { app.openQuoteModal(); },

            handleTemplateCopy: (content) => {
                const regex = /\[\[(.*?)\]\]/g;
                const matches = [...content.matchAll(regex)];

                if (matches.length === 0) {
                    app.copyText(content);
                    return;
                }

                const uniqueKeys = [...new Set(matches.map(m => m[1]))];
                STATE.pendingTemplateContent = content;
                STATE.pendingPlaceholders = uniqueKeys;

                const container = document.getElementById('placeholders-container');
                if (container) {
                    container.innerHTML = '';
                    uniqueKeys.forEach((key, idx) => {
                        const wrapper = document.createElement('div');
                        wrapper.innerHTML = `
                            <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 dark:text-slate-500">${key}</label>
                            <input type="text" id="ph-input-${idx}" class="w-full bg-gray-50 rounded-xl py-2 px-3 outline-none text-sm border border-gray-200 focus:border-blue-500 transition-colors dark:bg-slate-700 dark:text-white dark:border-slate-600" placeholder="Enter ${key}">
                        `;
                        container.appendChild(wrapper);
                    });
                }

                document.getElementById('modal-placeholders').classList.remove('hidden');

                setTimeout(() => {
                    const firstInput = document.getElementById('ph-input-0');
                    if (firstInput) firstInput.focus();
                }, 100);
            },

            executeTemplateCopy: () => {
                let finalContent = STATE.pendingTemplateContent;

                STATE.pendingPlaceholders.forEach((key, idx) => {
                    const inputEl = document.getElementById(`ph-input-${idx}`);
                    const val = inputEl ? inputEl.value : '';

                    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const replaceRegex = new RegExp(`\\[\\[${escapedKey}\\]\\]`, 'g');

                    finalContent = finalContent.replace(replaceRegex, val !== '' ? val : `[[${key}]]`);
                });

                app.copyText(finalContent);
                document.getElementById('modal-placeholders').classList.add('hidden');
                STATE.pendingTemplateContent = '';
                STATE.pendingPlaceholders = [];
            },

            renderQuickActions: () => {
                const container = document.getElementById('job-quick-actions'); container.innerHTML = '';
                const profiles = STATE.data.profile || [];
                profiles.forEach(p => {
                    const btn = document.createElement('button');
                    const labelLower = p.label.toLowerCase();
                    let iconClass = "fas fa-link"; let isIconOnly = false; let specificClasses = "";
                    if (labelLower.includes('linkedin')) { iconClass = "fab fa-linkedin-in"; isIconOnly = true; specificClasses = "text-blue-700 dark:text-blue-400"; }
                    else if (labelLower.includes('github')) { iconClass = "fab fa-github"; isIconOnly = true; specificClasses = "text-gray-800 dark:text-white"; }
                    else if (labelLower.includes('email') || labelLower.includes('mail') || labelLower.includes('gmail')) { iconClass = "fas fa-envelope"; isIconOnly = true; specificClasses = "text-red-500 dark:text-red-400"; }
                    else if (labelLower.includes('resume') || labelLower.includes('cv')) { iconClass = "fas fa-file-alt"; isIconOnly = true; specificClasses = "text-green-600 dark:text-green-400"; }
                    else if (labelLower.includes('contact') || labelLower.includes('phone') || labelLower.includes('call')) { iconClass = "fas fa-phone"; isIconOnly = true; specificClasses = "text-indigo-600 dark:text-indigo-400"; }
                    if (isIconOnly) { btn.className = `w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-gray-50 flex items-center justify-center transition active:scale-90 dark:bg-[#0a0a0a] dark:border-gray-800 dark:hover:bg-slate-700 ${specificClasses}`; btn.innerHTML = `<i class="${iconClass} text-sm"></i>`; btn.title = p.label; }
                    else { btn.className = "bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 transition active:scale-95 flex items-center gap-1 dark:bg-[#0a0a0a] dark:border-gray-800 dark:text-slate-300 dark:hover:bg-slate-700"; btn.innerHTML = `<i class="${iconClass} text-[10px] opacity-50"></i> ${p.label}`; }
                    btn.onclick = () => app.copyText(p.value);
                    container.appendChild(btn);
                });
                const easyTpls = (STATE.data.notes || []).filter(n => n.category === 'template' && n.easyAccess);
                easyTpls.forEach(t => { const btn = document.createElement('button'); btn.className = "bg-gray-50 hover:bg-gray-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-100 transition active:scale-95 flex items-center gap-1 dark:bg-gray-800 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/50"; btn.innerHTML = `<i class="fas fa-bolt text-[10px] opacity-50"></i> ${t.title}`; btn.onclick = () => app.handleTemplateCopy(t.content); container.appendChild(btn); });
                if (profiles.length === 0 && easyTpls.length === 0) { container.innerHTML = `<span class="text-[10px] text-gray-300 dark:text-gray-600">Add profile links or 'Easy Access' templates to see them here.</span>`; }
            },

            toast: (msg, isError = false) => { const el = document.getElementById('toast'); const msgEl = document.getElementById('toast-msg'); const icon = el.querySelector('i'); msgEl.textContent = msg; if(isError) { icon.className = "fas fa-exclamation-circle text-red-400"; } else { icon.className = "fas fa-check-circle text-green-400"; } el.classList.remove('hidden'); el.classList.remove('opacity-0'); if(app.toastTimeout) clearTimeout(app.toastTimeout); app.toastTimeout = setTimeout(() => { el.classList.add('opacity-0'); setTimeout(() => el.classList.add('hidden'), 300); }, 2000); },
            copyText: (text) => { if(!text) return; if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => app.toast("Copied!")); } else { const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.left = "-9999px"; document.body.appendChild(textArea); textArea.focus(); textArea.select(); try { document.execCommand('copy'); app.toast("Copied!"); } catch (err) { app.toast("Copy failed", true); } document.body.removeChild(textArea); } },
            openConfirm: (msg, actionFn) => { document.getElementById('confirm-msg').textContent = msg; STATE.currentConfirmAction = actionFn; document.getElementById('modal-confirm').classList.remove('hidden'); },
            confirmYes: () => { if (STATE.currentConfirmAction) { STATE.currentConfirmAction(); STATE.currentConfirmAction = null; } document.getElementById('modal-confirm').classList.add('hidden'); },
            cleanupOldJobs: () => { const now = Date.now(); const initialLen = STATE.data.notes.length; STATE.data.notes = STATE.data.notes.filter(n => { if(n.category !== 'job') return true; const daysOld = Math.floor((now - n.created) / MILLIS_PER_DAY); return daysOld <= 7; }); if(STATE.data.notes.length !== initialLen) app.saveToCloud(); },
            exportData: () => { const dataStr = JSON.stringify(STATE.data, null, 2); const blob = new Blob([dataStr], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `magic_pouch_backup_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); },
            importData: (input) => { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { try { const imported = JSON.parse(ev.target.result); app.openConfirm("Replace current data with backup?", () => { STATE.data = app.sanitizeData(imported); app.saveToCloud(); app.refreshUI(); app.toast('Restored!'); document.getElementById('modal-settings').classList.add('hidden'); }); } catch(err) { app.toast('Invalid file', true); } input.value = ''; }; reader.readAsText(file); },
            handleGlobalSearch: (query) => {
                if (STATE.currentView === 'jobs') app.renderJobs(query);
                else if (STATE.currentView === 'templates') app.renderTemplates(query);
                else if (STATE.currentView === 'interviews') {
                    app.renderInterviews(STATE.interviewFilter, query);
                }
            },

            renderPlan: () => {
                const plan = STATE.data.plan;
                const listEl = document.getElementById('plan-daily-list');
                listEl.innerHTML = '';

                // --- DAILY WINS RENDER LOGIC ---
                const toggleBtn = document.getElementById('btn-toggle-done');
                if (toggleBtn) {
                    if (plan.hideDone) {
                        toggleBtn.innerHTML = `<i class="fas fa-eye"></i> <span>Show Done</span>`;
                        toggleBtn.className = "flex items-center gap-1.5 text-[10px] font-bold text-blue-500 bg-gray-50 px-2 py-1 rounded-lg transition-colors dark:bg-gray-800 dark:text-blue-300";
                    } else {
                        toggleBtn.innerHTML = `<i class="fas fa-eye-slash"></i> <span>Hide Done</span>`;
                        toggleBtn.className = "flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-gray-600 bg-gray-50 px-2 py-1 rounded-lg transition-colors dark:bg-slate-700 dark:text-slate-400 dark:hover:text-slate-200";
                    }
                }

                if (!app.sortable && listEl) {
                    app.sortable = new Sortable(listEl, {
                        animation: 150,
                        handle: '.drag-handle', // Only allow dragging via the handle
                        ghostClass: 'opacity-50',
                        onEnd: function (evt) {
                             const item = STATE.data.plan.daily.splice(evt.oldIndex, 1)[0];
                             STATE.data.plan.daily.splice(evt.newIndex, 0, item);
                             app.saveToCloud();
                        },
                    });
                }
                // Enable dragging on the whole row since we removed the handle
                if (app.sortable) app.sortable.option("disabled", plan.hideDone);

                let completedCount = 0;
                let visibleCount = 0;

                if (plan.daily.length === 0) {
                    listEl.innerHTML = `<div class="text-center text-gray-300 text-xs py-3 dark:text-slate-600 italic">No tasks. Time to win the day!</div>`;
                }

                plan.daily.forEach((task, idx) => {
                    if(task.done) completedCount++;
                    if (plan.hideDone && task.done) return;
                    visibleCount++;

                    const div = document.createElement('div');
                    // Compact, clean row
                    div.className = "group flex items-center gap-3 py-2 px-2 hover:bg-gray-50 rounded-lg transition-colors cursor-default dark:hover:bg-slate-700/30";

                    const isEditing = STATE.editingTaskIdx === idx;

                    if (isEditing) {
                        div.innerHTML = `
                            <div class="w-5 h-5 flex items-center justify-center text-gray-300"><i class="fas fa-edit text-xs"></i></div>
                            <input type="text" id="inline-edit-${idx}" class="flex-1 bg-white border border-blue-300 rounded px-2 py-1 text-sm outline-none dark:bg-slate-700 dark:border-blue-500 dark:text-white" value="${task.text.replace(/"/g, '&quot;')}" onblur="app.saveInlineEdit(${idx})" onkeydown="if(event.key === 'Enter') app.saveInlineEdit(${idx})">
                        `;
                    } else {
                        div.innerHTML = `
                            <!-- Drag Handle -->
                            <div class="drag-handle shrink-0 w-6 h-6 flex items-center justify-center cursor-grab touch-none text-gray-300 hover:text-gray-500 active:text-blue-500 transition-colors dark:text-slate-600 dark:hover:text-slate-400">
                                <i class="fas fa-grip-vertical text-xs"></i>
                            </div>

                            <!-- Checkbox -->
                            <div onclick="app.togglePlanTask(${idx})" class="shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${task.done ? 'bg-yellow-400 border-yellow-400 text-white' : 'border-gray-200 text-transparent hover:border-yellow-400 bg-white dark:bg-[#0a0a0a] dark:border-slate-600'}">
                                <i class="fas fa-check text-[10px]"></i>
                            </div>

                            <!-- Text -->
                            <span class="text-sm font-medium text-gray-700 flex-1 truncate select-none ${task.done ? 'text-gray-400 line-through decoration-gray-300 dark:text-slate-600' : 'dark:text-slate-200'}" onclick="app.enableInlineEdit(${idx})" title="Tap to edit">
                                ${task.text}
                            </span>

                            <!-- Simple Delete 'x' -->
                            <button onclick="app.deletePlanTask(${idx})" class="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 dark:text-slate-600 dark:hover:text-red-400">
                                <i class="fas fa-times text-xs"></i>
                            </button>
                        `;
                    }
                    listEl.appendChild(div);
                });

                if (plan.hideDone && visibleCount === 0 && plan.daily.length > 0) {
                     listEl.innerHTML = `<div class="text-center text-gray-300 text-xs py-2 dark:text-slate-600 italic">All clear! (Toggle 'Show Done' to view)</div>`;
                }

                if (STATE.editingTaskIdx !== null) { setTimeout(() => { const inp = document.getElementById(`inline-edit-${STATE.editingTaskIdx}`); if(inp) inp.focus(); }, 10); }

                const total = plan.daily.length;
                const pct = total === 0 ? 0 : Math.round((completedCount / total) * 100);
                const progressBar = document.getElementById('daily-plan-progress');
                const progressText = document.getElementById('daily-progress-text');

                if(progressBar) {
                    progressBar.style.width = `${pct}%`;
                    if(pct === 100) progressBar.classList.replace('bg-yellow-400', 'bg-green-500');
                    else progressBar.classList.replace('bg-green-500', 'bg-yellow-400');
                }
                if(progressText) progressText.textContent = `${completedCount}/${total}`;

                // --- NEW: NETWORKING RADAR RENDER ---
                const netListContainer = document.getElementById('plan-networking-list-container');
                if (netListContainer) {
                    netListContainer.innerHTML = '';
                    if (!plan.networking || plan.networking.length === 0) {
                        netListContainer.innerHTML = `<div class="w-full text-center text-xs text-gray-300 italic py-2 px-5 dark:text-slate-600">No active contacts. Add someone to start networking!</div>`;
                    } else {
                        const groupBy = document.getElementById('network-group-by') ? document.getElementById('network-group-by').value : 'none';
                        let groups = {};

                        if (groupBy === 'none') {
                            groups['All Contacts'] = plan.networking;
                        } else {
                            plan.networking.forEach(contact => {
                                const key = contact[groupBy] || 'Unspecified';
                                if (!groups[key]) groups[key] = [];
                                groups[key].push(contact);
                            });
                        }

                        // Render Groups
                        Object.keys(groups).sort().forEach(groupName => {
                            if (groupBy !== 'none') {
                                const groupHeader = document.createElement('h4');
                                groupHeader.className = "text-xs font-bold text-gray-500 mt-4 mb-2 uppercase tracking-wider dark:text-slate-400";
                                groupHeader.textContent = groupName;
                                netListContainer.appendChild(groupHeader);
                            }

                            const scrollContainer = document.createElement('div');
                            scrollContainer.className = "flex gap-4 overflow-x-auto no-scrollbar py-2 -mx-2 px-2";

                            // Spacer for scroll padding
                            scrollContainer.appendChild(document.createElement('div'));

                            groups[groupName].forEach(contact => {
                                // Find original index
                                const originalIdx = plan.networking.indexOf(contact);

                                const statusColors = {
                                    'todo': 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600',
                                    'contacted': 'bg-gray-50 text-blue-600 border-gray-100 dark:bg-gray-800 dark:text-blue-300 dark:border-blue-800',
                                    'meeting': 'bg-gray-50 text-purple-600 border-gray-100 dark:bg-gray-800 dark:text-purple-300 dark:border-purple-800',
                                    'done': 'bg-gray-50 text-green-600 border-gray-100 dark:bg-gray-800 dark:text-green-300 dark:border-green-800'
                                };
                                const statusLabels = { 'todo': 'To Contact', 'contacted': 'Sent', 'meeting': 'Talking', 'done': 'Done' };
                                const s = contact.status || 'todo';
                                const initials = contact.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();

                                const card = document.createElement('div');
                                card.className = "flex-shrink-0 w-36 bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex flex-col gap-2 relative group snap-start dark:bg-[#0a0a0a] dark:border-gray-800";

                                let contactIcons = '';
                                if(contact.email) contactIcons += `<i class="fas fa-envelope text-xs text-gray-400" title="${contact.email}"></i>`;
                                if(contact.mobile) contactIcons += `<i class="fas fa-phone text-xs text-gray-400" title="${contact.mobile}"></i>`;

                                card.innerHTML = `
                                    <div class="flex justify-between items-start w-full">
                                        <div class="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-[10px] border border-white shadow-sm dark:bg-indigo-900/50 dark:border-slate-600 dark:text-indigo-300 shrink-0">${initials}</div>
                                        <div class="flex gap-1">
                                            <button onclick="app.openNetworkModal(${originalIdx})" class="text-gray-300 hover:text-indigo-500 p-1 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-pen text-[10px]"></i></button>
                                            <button onclick="app.deleteNetworkContact(${originalIdx})" class="text-gray-300 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition"><i class="fas fa-times text-[10px]"></i></button>
                                        </div>
                                    </div>
                                    <div class="w-full">
                                        <div class="font-bold text-xs text-gray-800 truncate dark:text-slate-200">${contact.name}</div>
                                        ${contact.company ? `<div class="text-[9px] font-bold text-indigo-500 truncate dark:text-indigo-400">${contact.company}</div>` : ''}
                                        <div class="text-[9px] text-gray-400 truncate dark:text-slate-500">${contact.role || 'Contact'}</div>
                                    </div>
                                    <div class="flex justify-between items-center w-full mt-auto">
                                        <div class="flex gap-1.5">${contactIcons}</div>
                                        <button onclick="app.toggleNetworkStatus(${originalIdx})" class="text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColors[s]} transition truncate">${statusLabels[s]}</button>
                                    </div>
                                `;
                                scrollContainer.appendChild(card);
                            });
                            // Spacer for scroll padding
                            const spacer = document.createElement('div'); spacer.className = "w-1 shrink-0"; scrollContainer.appendChild(spacer);
                            netListContainer.appendChild(scrollContainer);
                        });
                    }
                }


                // --- NEW: PREP DOJO RENDER ---
                const prepList = document.getElementById('plan-prep-list');
                if (prepList) {
                    prepList.innerHTML = '';
                    if (!plan.prep || plan.prep.length === 0) {
                        prepList.innerHTML = `<div class="text-center text-xs text-gray-300 italic py-2 dark:text-slate-600">Add a topic to master (e.g. React, Behavioral).</div>`;
                    } else {
                        plan.prep.forEach((item, idx) => {
                            const levels = ['w-1/4 bg-red-400', 'w-2/3 bg-yellow-400', 'w-full bg-green-500'];
                            const levelLabels = ['Novice', 'Learning', 'Mastered'];
                            const currentLevel = item.level || 0;

                            const row = document.createElement('div');
                            row.className = "flex items-center gap-3";
                            row.innerHTML = `
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-xs font-bold text-gray-700 dark:text-slate-200 truncate">${item.topic}</span>
                                        <span class="text-[9px] font-bold text-gray-400 uppercase dark:text-slate-500">${levelLabels[currentLevel]}</span>
                                    </div>
                                    <div class="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden cursor-pointer dark:bg-slate-700" onclick="app.togglePrepStatus(${idx})">
                                        <div class="h-full rounded-full transition-all duration-300 ${levels[currentLevel]}"></div>
                                    </div>
                                </div>
                                <button onclick="app.deletePrepItem(${idx})" class="text-gray-300 hover:text-red-400 p-1 dark:text-slate-600 dark:hover:text-red-400"><i class="fas fa-trash text-xs"></i></button>
                            `;
                            prepList.appendChild(row);
                        });
                    }
                }

                // Restore Text Areas
                const weeklyEl = document.getElementById('plan-weekly-text');
                const monthlyEl = document.getElementById('plan-monthly-text');
                const postItEl = document.getElementById('plan-postIt-text');
                if (weeklyEl) weeklyEl.value = plan.weekly || '';
                if (monthlyEl) monthlyEl.value = plan.monthly || '';
                if (postItEl) postItEl.value = plan.postIt || '';

                // Render Top Dashboard Features
                app.renderVelocity();
                app.renderNorthStar();
            },

            // --- 🚀 VELOCITY GAUGE LOGIC ---
            renderVelocity: () => {
                const countEl = document.getElementById('velocity-count');
                const needle = document.getElementById('gauge-needle');
                const path = document.getElementById('gauge-path');
                const label = document.getElementById('velocity-label');

                if(!countEl) return;

                // Calculate 7-day sum
                const history = STATE.data.stats.history || {};
                let total = 0;
                const today = new Date();
                for(let i=0; i<7; i++) {
                    const d = new Date(today);
                    d.setDate(today.getDate() - i);
                    const dStr = d.toLocaleDateString('en-CA');
                    const entry = history[dStr];
                    if (typeof entry === 'number') total += entry;
                    else if (entry && typeof entry === 'object') total += (entry.total || 0);
                }

                // Update Big Number
                countEl.textContent = total;

                // --- Gauge Animation Logic ---
                // Scale: 0 to 30 apps per week
                const maxApps = 30;
                // Cap percentage at 1.0 (100%)
                const percentage = Math.min(total, maxApps) / maxApps;

                // 1. Rotate Needle
                // Range: -90deg (start) to 90deg (end) = 180deg span
                const deg = -90 + (percentage * 180);
                if(needle) needle.style.transform = `rotate(${deg}deg)`;

                // 2. Fill Track
                // The SVG arc length is approx 110 units (Radius 35 * PI = ~110 for half circle)
                const arcLength = 110;
                const dashVal = percentage * arcLength;
                if(path) {
                    path.style.strokeDasharray = `${dashVal} ${arcLength}`;

                    // Dynamic Color
                    let color = "#3b82f6"; // Blue
                    if (total > 5) color = "#10b981"; // Green
                    if (total > 15) color = "#f59e0b"; // Orange
                    if (total >= 30) color = "#9333ea"; // Purple
                    path.style.stroke = color;
                }

                // 3. Update Label Text
                let text = "Warming Up";
                let labelClass = "text-blue-600 bg-gray-50 dark:bg-gray-800 dark:text-blue-300";

                if (total <= 0) {
                     text = "Idle";
                     labelClass = "text-gray-400 bg-gray-100 dark:bg-slate-700 dark:text-slate-400";
                } else if (total > 5) {
                    text = "Cruising";
                    labelClass = "text-green-600 bg-gray-50 dark:bg-gray-800 dark:text-green-300";
                }
                if (total > 15) {
                    text = "High Speed";
                    labelClass = "text-orange-600 bg-gray-50 dark:bg-gray-800 dark:text-orange-300";
                }
                if (total >= 30) {
                    text = "WARP SPEED 🚀";
                    labelClass = "text-purple-600 bg-gray-50 dark:bg-gray-800 dark:text-purple-300";
                }

                if(label) {
                    label.textContent = text;
                    label.className = `text-[9px] font-bold px-2 py-0.5 rounded-full ${labelClass}`;
                }
            },

            // --- 🌟 NORTH STAR LOGIC ---
            renderNorthStar: () => {
                const ns = STATE.data.plan.northStar;
                const coEl = document.getElementById('ns-company');
                const roleEl = document.getElementById('ns-role');
                const stEl = document.getElementById('ns-status');

                if(coEl) coEl.textContent = ns.company || "Set Dream Job";
                if(roleEl) roleEl.textContent = ns.role || "Tap to define target";
                if(stEl) stEl.textContent = ns.status || "Planning";
            },

            // Updated to use Modal instead of prompt
            openNorthStarModal: () => {
                const ns = STATE.data.plan.northStar || { company: '', role: '', status: 'Dreaming' };
                document.getElementById('ns-input-company').value = ns.company || '';
                document.getElementById('ns-input-role').value = ns.role || '';
                document.getElementById('ns-input-status').value = ns.status || 'Dreaming';

                document.getElementById('modal-northstar').classList.remove('hidden');
            },

            saveNorthStar: () => {
                const company = document.getElementById('ns-input-company').value.trim();
                const role = document.getElementById('ns-input-role').value.trim();
                const status = document.getElementById('ns-input-status').value;

                if (company) {
                    STATE.data.plan.northStar = { company, role, status };
                    app.saveToCloud();
                    app.renderNorthStar();
                    document.getElementById('modal-northstar').classList.add('hidden');
                    app.toast("North Star Updated 🌟");
                } else {
                    app.toast("Company name required", true);
                }
            },

            // Legacy wrapper removed as we are using direct modal calls now
            // editNorthStar: () => { app.openNorthStarModal(); },

            togglePlanTask: (idx) => {
                STATE.data.plan.daily[idx].done = !STATE.data.plan.daily[idx].done;
                app.saveToCloud();
                app.renderPlan();
                if(STATE.data.plan.daily[idx].done) app.toast("Nice work! 🎉");
            },

            toggleHideDone: () => {
                STATE.data.plan.hideDone = !STATE.data.plan.hideDone;
                app.saveToCloud();
                app.renderPlan();
            },

            // --- FOCUS TIMER LOGIC REMOVED ---

            // New: Inline Edit Logic
            enableInlineEdit: (idx) => {
                STATE.editingTaskIdx = idx;
                app.renderPlan();
            },

            saveInlineEdit: (idx) => {
                const inp = document.getElementById(`inline-edit-${idx}`);
                if (inp) {
                    const val = inp.value.trim();
                    if (val) {
                        STATE.data.plan.daily[idx].text = val;
                        app.saveToCloud();
                    }
                }
                STATE.editingTaskIdx = null;
                app.renderPlan();
            },

            // New: Quick Add Logic
            addQuickTask: () => {
                const input = document.getElementById('quick-task-input');
                const text = input.value.trim();
                if (text) {
                    STATE.data.plan.daily.push({ id: Date.now().toString(), text, done: false });
                    input.value = '';
                    app.saveToCloud();
                    app.renderPlan();
                    app.toast("Added");
                }
            },

            addNetworkContact: () => { app.openNetworkModal(); },

            openNetworkModal: (idx = null) => {
                const idInp = document.getElementById('network-input-id');
                const nameInp = document.getElementById('network-input-name');
                const companyInp = document.getElementById('network-input-company');
                const roleInp = document.getElementById('network-input-role');
                const emailInp = document.getElementById('network-input-email');
                const mobileInp = document.getElementById('network-input-mobile');

                if (idx !== null && STATE.data.plan.networking && STATE.data.plan.networking[idx]) {
                    const contact = STATE.data.plan.networking[idx];
                    idInp.value = idx;
                    nameInp.value = contact.name || '';
                    companyInp.value = contact.company || '';
                    roleInp.value = contact.role || 'Other';
                    emailInp.value = contact.email || '';
                    mobileInp.value = contact.mobile || '';
                } else {
                    idInp.value = '';
                    nameInp.value = '';
                    companyInp.value = '';
                    roleInp.value = 'Recruiter';
                    emailInp.value = '';
                    mobileInp.value = '';
                }

                document.getElementById('modal-network').classList.remove('hidden');
            },

            saveNetworkContact: () => {
                const idxStr = document.getElementById('network-input-id').value;
                const name = document.getElementById('network-input-name').value.trim();
                const company = document.getElementById('network-input-company').value.trim();
                const role = document.getElementById('network-input-role').value;
                const email = document.getElementById('network-input-email').value.trim();
                const mobile = document.getElementById('network-input-mobile').value.trim();

                if (name) {
                    if (!STATE.data.plan.networking) STATE.data.plan.networking = [];

                    const contactData = { name, company, role, email, mobile };

                    if (idxStr !== '') {
                        const idx = parseInt(idxStr);
                        contactData.status = STATE.data.plan.networking[idx].status || 'todo';
                        STATE.data.plan.networking[idx] = contactData;
                        app.toast("Contact updated");
                    } else {
                        contactData.status = 'todo';
                        STATE.data.plan.networking.push(contactData);
                        app.toast("Contact added");
                    }

                    app.saveToCloud();
                    app.renderPlan();
                    document.getElementById('modal-network').classList.add('hidden');
                } else {
                    app.toast("Please enter a name", true);
                }
            },

            deleteNetworkContact: (idx) => {
                app.openConfirm("Remove this contact?", () => {
                    if (STATE.data.plan.networking && STATE.data.plan.networking.length > idx) {
                        STATE.data.plan.networking.splice(idx, 1);
                        app.saveToCloud();
                        app.renderPlan();
                        app.toast("Contact removed");
                    }
                });
            },

            toggleNetworkStatus: (idx) => {
                if (STATE.data.plan.networking && STATE.data.plan.networking[idx]) {
                    const statuses = ['todo', 'contacted', 'meeting', 'done'];
                    const current = STATE.data.plan.networking[idx].status || 'todo';
                    let nextIdx = statuses.indexOf(current) + 1;
                    if (nextIdx >= statuses.length) nextIdx = 0;
                    STATE.data.plan.networking[idx].status = statuses[nextIdx];
                    app.saveToCloud();
                    app.renderPlan();
                }
            },

            addSuggestion: (text) => {
                STATE.data.plan.daily.push({ id: Date.now().toString(), text, done: false });
                app.saveToCloud();
                app.renderPlan();
                app.toast("Added");
            },

            clearCompletedTasks: () => {
                app.openConfirm("Remove all completed tasks?", () => {
                     STATE.data.plan.daily = STATE.data.plan.daily.filter(t => !t.done);
                     app.saveToCloud();
                     app.renderPlan();
                     app.toast("List cleaned up ✨");
                });
            },

            copyPlanText: (type) => {
                const text = STATE.data.plan[type];
                app.copyText(text);
            },

            // Combined Modal for Add & Edit (Legacy support / Fallback if needed, though inline handles add now)
            openDailyTaskModal: (idx = null) => {
                STATE.editingTaskIdx = idx; // Used for inline logic now mainly
                if (idx === null) {
                    // Focus quick input instead of modal
                    document.getElementById('quick-task-input').focus();
                } else {
                    app.enableInlineEdit(idx);
                }
            },

            openAddDailyTaskModal: () => { app.openDailyTaskModal(null); },

            // Replaced by addQuickTask, kept for compatibility with any old buttons
            saveDailyTask: () => { app.addQuickTask(); document.getElementById('modal-add-task').classList.add('hidden'); },

            deletePlanTask: (idx) => { app.openConfirm("Remove this task?", () => { STATE.data.plan.daily.splice(idx, 1); app.saveToCloud(); app.renderPlan(); }); },
            savePlanText: (type) => { const val = document.getElementById(`plan-${type}-text`).value; STATE.data.plan[type] = val; if(app.planSaveTimeout) clearTimeout(app.planSaveTimeout); app.planSaveTimeout = setTimeout(() => { app.saveToCloud(); }, 1000); },
            processAutomationRules: () => { const now = Date.now(); let hasChanges = false; STATE.data.notes.forEach(note => { const statusToCheck = note.status === 'referral' ? 'referral-asked' : note.status; if (note.category === 'job' && statusToCheck === 'referral-asked') { const lastUpdated = note.updated || note.created; if ((now - lastUpdated) > MILLIS_PER_DAY) { note.status = 'reminder'; note.updated = now; hasChanges = true; } } }); if (hasChanges) { app.saveToCloud(); app.toast("Checked follow-ups", false); } },
            refreshUI: () => {
                app.renderJobs();
                app.renderTemplates();
                app.renderPlan();
                app.renderQuickActions();
                app.renderProfileManageList();
                app.renderQuote();
                if (STATE.currentView === 'interviews') {
                    app.renderInterviews(STATE.interviewFilter);
                    app.renderTimeline();
                }
            },
            saveToCloud: async () => { if(!STATE.user) return; try { const docRef = doc(db, 'sync', STATE.syncKey); await setDoc(docRef, { data: STATE.data, userId: STATE.user.uid, lastUpdated: new Date().toISOString() }); } catch (e) { console.error('Save error:', e); } },
            saveSyncKey: () => { const newKey = document.getElementById('sync-key-input').value.trim().toUpperCase(); if(newKey && newKey !== STATE.syncKey) { STATE.syncKey = newKey; localStorage.setItem('magic_pouch_key', newKey); if(document.getElementById('sync-status-text')) document.getElementById('sync-status-text').textContent = newKey; app.setupSync(); document.getElementById('modal-sync').classList.add('hidden'); app.toast("Switched Sync Channel"); } else if(newKey === STATE.syncKey) { app.toast("Same key - already connected"); } },
            generateSyncKey: () => {
                const newKey = Math.random().toString(36).substr(2, 6).toUpperCase();
                document.getElementById('sync-key-input').value = newKey;
            },

            switchView: (viewName) => {
                STATE.currentView = viewName;
                const vJobs = document.getElementById('view-jobs');
                const vPlan = document.getElementById('view-plan');
                const vTpls = document.getElementById('view-templates');
                const vInts = document.getElementById('view-interviews');

                vJobs.style.transform = 'translateX(100%)';
                vPlan.style.transform = 'translateX(100%)';
                vTpls.style.transform = 'translateX(100%)';
                vInts.style.transform = 'translateX(100%)';

                if(viewName === 'jobs') vJobs.style.transform = 'translateX(0)';
                if(viewName === 'plan') vPlan.style.transform = 'translateX(0)';
                if(viewName === 'templates') vTpls.style.transform = 'translateX(0)';
                if(viewName === 'interviews') vInts.style.transform = 'translateX(0)';

                document.querySelectorAll('.nav-btn').forEach(btn => {
                    btn.classList.remove('text-zinc-900', 'active', 'dark:text-zinc-100');
                    btn.classList.add('text-gray-400', 'dark:text-slate-500');
                    const indicator = btn.querySelector('.nav-indicator');
                    if (indicator) {
                        indicator.classList.remove('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
                    }
                });

                const navIndex = viewName === 'jobs' ? 0 : viewName === 'interviews' ? 1 : viewName === 'plan' ? 2 : 3;
                const activeBtn = document.querySelectorAll('.nav-btn')[navIndex];

                if (activeBtn) {
                    activeBtn.classList.add('text-zinc-900', 'active', 'dark:text-zinc-100');
                    activeBtn.classList.remove('text-gray-400', 'dark:text-slate-500');
                    const indicator = activeBtn.querySelector('.nav-indicator');
                    if (indicator) {
                        indicator.classList.add('bg-blue-100', 'text-blue-700', 'dark:bg-blue-900/40', 'dark:text-blue-300');
                    }
                }

                if (viewName === 'plan') app.renderPlan();
                if (viewName === 'templates') app.renderTemplates();
                if (viewName === 'jobs') app.renderJobs();
                if (viewName === 'interviews') {
                    app.renderInterviews(STATE.interviewFilter);
                    app.renderTimeline();
                }
            }
        };
        window.app = app;


        window.addEventListener('DOMContentLoaded', () => {
            app.init();
            app.refreshUI();
            app.switchView('jobs');
        });



// Safe Event Delegator for MV3 (Dynamic code execution)
document.addEventListener('DOMContentLoaded', () => {
    ['click', 'change', 'input', 'keydown'].forEach(eventName => {
        document.body.addEventListener(eventName, (event) => {
            let el = event.target.closest('[data-' + eventName + ']');
            if (!el) return;

            const codeStr = el.getAttribute('data-' + eventName);
            if (codeStr) {
                // Decode HTML entities if necessary, but getAttribute usually does this
                const codes = codeStr.split(';').map(c => c.trim()).filter(Boolean);

                for (let code of codes) {
                    if (code.startsWith("if")) {
                        const conditionMatch = code.match(/if\s*\((.*?)\)\s*(.*)/);
                        if (conditionMatch) {
                            const condition = conditionMatch[1].trim();
                            code = conditionMatch[2].trim();

                            if (condition === "event.key === 'Enter'" && event.key !== 'Enter') {
                                continue;
                            }
                            if (condition === "event.target === this" && event.target !== el) {
                                continue;
                            }
                        }
                    }

                    const methodMatch = code.match(/app\.(\w+)\((.*)\)/);

                    if (methodMatch) {
                        const method = methodMatch[1];
                        const argsStr = methodMatch[2];
                        let args = [];

                        if (argsStr) {
                            if (argsStr === 'this') {
                                args = [el];
                            } else if (argsStr === 'this.value') {
                                args = [el.value];
                            } else if (argsStr.startsWith("this.getAttribute('") && argsStr.endsWith("')")) {
                                const attrName = argsStr.slice(19, -2);
                                args = [el.getAttribute(attrName)];
                            } else if (argsStr.startsWith('this.getAttribute("') && argsStr.endsWith('")')) {
                                const attrName = argsStr.slice(19, -2);
                                args = [el.getAttribute(attrName)];
                            } else {
                                // Simple parser for arguments
                                args = argsStr.split(/,\s*(?=(?:[^\'"]*['"][^\'"]*['"])*[^\'"]*$)/).map(a => {
                                    a = a.trim();
                                    if (a === 'true') return true;
                                    if (a === 'false') return false;
                                    if (!isNaN(a) && a !== '') return Number(a);
                                    if (a.startsWith("'") && a.endsWith("'")) return a.slice(1, -1);
                                    if (a.startsWith('"') && a.endsWith('"')) return a.slice(1, -1);
                                    return a;
                                });
                            }
                        }

                        if (typeof app[method] === 'function') {
                            app[method](...args);
                        } else {
                            console.error('Method not found:', method);
                        }
                    } else if (code.includes('classList.add') || code.includes('classList.remove')) {
                        const elMatch = code.match(/document\.getElementById\(['"]([^'"]+)['"]\)\.classList\.(add|remove)\(['"]([^'"]+)['"]\)/);
                        if (elMatch) {
                            const targetEl = document.getElementById(elMatch[1]);
                            if (targetEl) {
                                targetEl.classList[elMatch[2]](elMatch[3]);
                            }
                        }
                        const classMatch = code.match(/this\.classList\.(add|remove)\(['"]([^'"]+)['"]\)/);
                        if (classMatch) {
                            el.classList[classMatch[1]](classMatch[2]);
                        }
                    } else if (code.includes('stepDown()')) {
                        document.getElementById('target-input').stepDown();
                    } else if (code.includes('stepUp()')) {
                        document.getElementById('target-input').stepUp();
                    } else if (code.includes('click()')) {
                         const elMatch = code.match(/document\.getElementById\(['"]([^'"]+)['"]\)\.click\(\)/);
                         if (elMatch) {
                             const targetEl = document.getElementById(elMatch[1]);
                             if (targetEl) targetEl.click();
                         }
                    } else {
                        console.error('Could not interpret:', code);
                    }
                }
            }
        });
    });
});


// --- Chrome Extension Integration ---
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SYNC_JOB_TO_PAL' || message.type === 'SYNC_JOB_TO_POUCH') {
            const data = message.payload;
            const roleStr = data.title || data.role || '';
            const companyStr = data.company || '';
            const title = (roleStr && companyStr) ? (roleStr + ' @ ' + companyStr) : (roleStr || companyStr || 'Captured Job');

            // Assuming STATE and app.saveToCloud are available in scope.
            // In app.js, STATE is globally accessible because it's defined at the top level.

            // We can interact with the global app object
            if (window.app && window.app.saveJobFromExtension) {
                window.app.saveJobFromExtension(data);
            }
        }
    });
}
