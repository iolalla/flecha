// ============================================================
// Vector Stock Dashboard - Quantitative Calculation Engine
// Author: Israel Olalla <iolalla@gmail.com> + Windsurf
// ============================================================

const POPULAR_TICKERS = [
    { code: 'AAPL', name: 'Apple Inc.' },
    { code: 'NVDA', name: 'NVIDIA Corporation' },
    { code: 'TSLA', name: 'Tesla Inc.' },
    { code: 'MSFT', name: 'Microsoft Corp.' },
    { code: 'GOOGL', name: 'Alphabet Inc.' },
    { code: 'AMZN', name: 'Amazon.com Inc.' },
    { code: 'META', name: 'Meta Platforms' },
    { code: 'SPY', name: 'S&P 500 ETF' },
    { code: 'QQQ', name: 'Nasdaq 100 ETF' },
    { code: 'BTC-USD', name: 'Bitcoin USD' },
    { code: 'ETH-USD', name: 'Ethereum USD' },
    { code: 'AMD', name: 'Advanced Micro Devices' },
    { code: 'NFLX', name: 'Netflix Inc.' },
    { code: 'JPM', name: 'JPMorgan Chase' },
    { code: 'V', name: 'Visa Inc.' },
    { code: 'DIS', name: 'Walt Disney Co.' },
    { code: 'BABA', name: 'Alibaba Group' },
    { code: 'COIN', name: 'Coinbase Global' },
    { code: 'PLTR', name: 'Palantir Technologies' },
    { code: 'SOFI', name: 'SoFi Technologies' },
    { code: 'SAN.MC', name: 'Banco Santander, S.A.' },
    { code: 'DOCS.L', name: 'Dr. Martens plc' },
    { code: 'JYSK.CO', name: 'Jyske Bank A/S' },
];

const COMPARISON_COLORS = [
    '#00d4aa', // Mint/teal
    '#7c3aed', // Purple
    '#3b82f6', // Blue
    '#f59e0b', // Amber/orange
    '#ec4899', // Pink
    '#10b981', // Emerald green
    '#ef4444', // Red
    '#06b6d4', // Cyan
];

// State
let currentData = null;
let currentMetrics = null;
let appConfig = null;
const TICKER_META_CACHE_PREFIX = 'vector-stock:meta:';
const TICKER_META_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Dynamic State
let selectedTickers = [];
let currentComparisonResults = null;
let allTickers = [...POPULAR_TICKERS];
const MAX_COMPARE_COUNT = 6;

// DOM Elements
const tickerInput = document.getElementById('ticker-input');
const analyzeBtn = document.getElementById('analyze-btn');
const autocompleteList = document.getElementById('autocomplete-list');
const quickChips = document.getElementById('quick-chips');
const loadingEl = document.getElementById('loading');
const dashboardEl = document.getElementById('dashboard');
const chartTickerEl = document.getElementById('chart-ticker');
const chartPeriodEl = document.getElementById('chart-period');
const priceCanvas = document.getElementById('price-chart');
const compassCanvas = document.getElementById('compass-chart');
const metricsContent = document.getElementById('metrics-content');
const copyBtn = document.getElementById('copy-report-btn');
const toastEl = document.getElementById('toast');
const compassAngleEl = document.getElementById('compass-angle');
const compassIntensityEl = document.getElementById('compass-intensity');
const signalBadgeEl = document.getElementById('signal-badge');
const signalValueEl = document.getElementById('signal-value');
const signalConfidenceEl = document.getElementById('signal-confidence');
const signalConfidenceFillEl = document.getElementById('signal-confidence-fill');
const targetProfitPctEl = document.getElementById('target-profit-pct');
const targetProfitValEl = document.getElementById('target-profit-val');
const targetLossPctEl = document.getElementById('target-loss-pct');
const targetLossValEl = document.getElementById('target-loss-val');
const signalHelpBtn = document.getElementById('signal-help-btn');
const signalHelpDialog = document.getElementById('signal-help-dialog');
const closeSignalHelpBtn = document.getElementById('close-signal-help-btn');
const helpCalcLookbackEl = document.getElementById('help-calc-lookback');
const helpLookbackEl = document.getElementById('help-lookback');
const helpSignalThresholdEl = document.getElementById('help-signal-threshold');
const helpTrendLookbackEl = document.getElementById('help-trend-lookback');
const helpProfitTakeEl = document.getElementById('help-profit-take');
const helpStopLossEl = document.getElementById('help-stop-loss');
const helpAngleThresholdEl = document.getElementById('help-angle-threshold');
const helpIntensityThresholdEl = document.getElementById('help-intensity-threshold');
const helpConfidenceMultiplierEl = document.getElementById('help-confidence-multiplier');

// New DOM Elements (Simplified Layout)
const analyzeBtnText = document.getElementById('analyze-btn-text');
const comparisonTags = document.getElementById('comparison-tags');
const tagsList = document.getElementById('tags-list');
const clearTagsBtn = document.getElementById('clear-tags-btn');
const comparisonDashboardEl = document.getElementById('comparison-dashboard');
const comparisonPeriodLabelEl = document.getElementById('comparison-period-label');
const thReturnPeriodEl = document.getElementById('th-return-period');
const comparisonCanvas = document.getElementById('comparison-chart');
const comparisonLegendEl = document.getElementById('comparison-legend');
const comparisonTableBody = document.getElementById('comparison-table-body');
const copyComparisonBtn = document.getElementById('copy-comparison-report-btn');

// ============================================================
// AUTOCOMPLETE & INPUT HANDLERS
// ============================================================

tickerInput.addEventListener('input', () => {
    const val = tickerInput.value.trim().toUpperCase();
    if (!val) {
        autocompleteList.classList.add('hidden');
        return;
    }
    const tickersList = allTickers.length > 0 ? allTickers : POPULAR_TICKERS;
    const matches = tickersList.filter(t =>
        t.code.includes(val) || t.name.toUpperCase().includes(val)
    ).slice(0, 8);

    if (matches.length === 0) {
        autocompleteList.classList.add('hidden');
        return;
    }

    autocompleteList.innerHTML = matches.map(t =>
        `<li data-ticker="${t.code}"><span class="ticker-code">${t.code}</span><span class="ticker-name">${t.name}</span></li>`
    ).join('');
    autocompleteList.classList.remove('hidden');
});

function handleTickerSelection(ticker) {
    ticker = ticker.trim().toUpperCase();
    if (!ticker) return;
    
    // Check if already selected
    if (selectedTickers.includes(ticker)) {
        tickerInput.value = '';
        autocompleteList.classList.add('hidden');
        return;
    }

    if (selectedTickers.length >= MAX_COMPARE_COUNT) {
        alert(`You can analyze or compare up to ${MAX_COMPARE_COUNT} stocks at a time.`);
        return;
    }

    selectedTickers.push(ticker);
    tickerInput.value = '';
    autocompleteList.classList.add('hidden');
    
    updateDashboardState();
}

autocompleteList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) {
        handleTickerSelection(li.dataset.ticker);
    }
});

tickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const ticker = tickerInput.value.trim().toUpperCase();
        if (ticker) {
            handleTickerSelection(ticker);
        }
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        autocompleteList.classList.add('hidden');
    }
});

analyzeBtn.addEventListener('click', () => {
    const ticker = tickerInput.value.trim().toUpperCase();
    if (ticker) {
        handleTickerSelection(ticker);
    } else if (selectedTickers.length > 0) {
        runActiveAnalysis();
    }
});

quickChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
        handleTickerSelection(chip.dataset.ticker);
    }
});

// Tags Management
function removeTicker(ticker) {
    selectedTickers = selectedTickers.filter(t => t !== ticker);
    updateDashboardState();
}

function clearAllTickers() {
    selectedTickers = [];
    currentData = null;
    currentMetrics = null;
    currentComparisonResults = null;
    updateDashboardState();
}

clearTagsBtn.addEventListener('click', clearAllTickers);

comparisonTags.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.tag-close');
    if (closeBtn) {
        removeTicker(closeBtn.dataset.ticker);
    }
});

function renderTags() {
    if (selectedTickers.length === 0) {
        comparisonTags.classList.add('hidden');
        tagsList.innerHTML = '';
    } else {
        comparisonTags.classList.remove('hidden');
        tagsList.innerHTML = selectedTickers.map(t => {
            return `<span class="tag" data-ticker="${t}">
                <span>${t}</span>
                <span class="tag-close" data-ticker="${t}">×</span>
            </span>`;
        }).join('');
    }
}

// State Coordinator
function updateDashboardState() {
    renderTags();
    
    // Update button text
    if (selectedTickers.length <= 1) {
        analyzeBtnText.textContent = 'Analyze';
    } else {
        analyzeBtnText.textContent = `Compare (${selectedTickers.length})`;
    }

    runActiveAnalysis();
}

async function runActiveAnalysis() {
    if (selectedTickers.length === 0) {
        dashboardEl.classList.add('hidden');
        comparisonDashboardEl.classList.add('hidden');
        loadingEl.classList.add('hidden');
        return;
    }

    if (selectedTickers.length === 1) {
        const ticker = selectedTickers[0];
        runAnalysis(ticker);
    } else {
        runComparison();
    }
};

copyBtn.addEventListener('click', copyReport);

function updateSignalHelpConfig() {
    const cfg = (appConfig && appConfig.signal) || {};
    const lookback = cfg.lookback ?? 30;
    const trendLookback = cfg.trendLookback ?? 0;
    const signalThresholdPct = cfg.signalThresholdPct ?? 0.0;
    const profitTakeThreshold = cfg.profitTakeThreshold ?? 0.10;
    const stopLossThreshold = cfg.stopLossThreshold ?? -0.02;

    if (helpCalcLookbackEl) helpCalcLookbackEl.textContent = `${lookback}`;
    if (helpLookbackEl) helpLookbackEl.textContent = `${lookback} days`;
    if (helpSignalThresholdEl) helpSignalThresholdEl.textContent = `${(signalThresholdPct * 100).toFixed(1)}%`;
    if (helpTrendLookbackEl) helpTrendLookbackEl.textContent = trendLookback > 0 ? `${trendLookback} days` : 'Disabled (0)';
    if (helpProfitTakeEl) helpProfitTakeEl.textContent = `+${(profitTakeThreshold * 100).toFixed(1)}%`;
    if (helpStopLossEl) helpStopLossEl.textContent = `${(stopLossThreshold * 100).toFixed(1)}%`;
    if (helpAngleThresholdEl) helpAngleThresholdEl.textContent = `${cfg.angleThresholdDegrees ?? 5}°`;
    if (helpIntensityThresholdEl) helpIntensityThresholdEl.textContent = cfg.intensityThreshold ?? 1.0;
    if (helpConfidenceMultiplierEl) helpConfidenceMultiplierEl.textContent = cfg.confidenceMultiplier ?? 25;

    if (chartPeriodEl) chartPeriodEl.textContent = `${lookback} days`;
    if (comparisonPeriodLabelEl) comparisonPeriodLabelEl.textContent = `${lookback} Days`;
    if (thReturnPeriodEl) thReturnPeriodEl.textContent = `${lookback}-Day Return`;
    if (targetProfitPctEl) targetProfitPctEl.textContent = `+${(profitTakeThreshold * 100).toFixed(0)}%`;
    if (targetLossPctEl) targetLossPctEl.textContent = `${(stopLossThreshold * 100).toFixed(0)}%`;
}

function openSignalHelp() {
    signalHelpDialog.classList.add('is-open');
    signalHelpDialog.setAttribute('aria-hidden', 'false');
    signalHelpBtn.setAttribute('aria-expanded', 'true');
    closeSignalHelpBtn.focus();
}

function closeSignalHelp() {
    signalHelpDialog.classList.remove('is-open');
    signalHelpDialog.setAttribute('aria-hidden', 'true');
    signalHelpBtn.setAttribute('aria-expanded', 'false');
    signalHelpBtn.focus();
}

signalHelpBtn.addEventListener('click', openSignalHelp);
closeSignalHelpBtn.addEventListener('click', closeSignalHelp);
signalHelpDialog.addEventListener('click', (event) => {
    if (event.target === signalHelpDialog) closeSignalHelp();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && signalHelpDialog.classList.contains('is-open')) closeSignalHelp();
});

// ============================================================
// DATA FETCHING (via proxy or fallback)
// ============================================================

async function fetchStockData(ticker) {
    // Use Yahoo Finance API via a CORS proxy with 1y range for sufficient lookback and trend history
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
    
    // Try multiple approaches
    try {
        // Try with corsproxy.io
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const resp = await fetch(proxyUrl);
        if (resp.ok) {
            const data = await resp.json();
            return parseYahooData(data, ticker);
        }
    } catch (e) {
        console.warn('Proxy 1 failed, trying alternative...');
    }

    try {
        // Try with allorigins
        const proxyUrl2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const resp2 = await fetch(proxyUrl2);
        if (resp2.ok) {
            const data = await resp2.json();
            return parseYahooData(data, ticker);
        }
    } catch (e) {
        console.warn('Proxy 2 failed, using demo data...');
    }

    // Fallback: generate synthetic data for demonstration
    return generateDemoData(ticker);
}

function parseYahooData(data, ticker) {
    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];
    const meta = getCachedTickerMeta(ticker) || {
        currency: result.meta.currency || 'N/D',
        exchange: result.meta.fullExchangeName || result.meta.exchangeName || 'N/D',
        name: result.meta.longName || result.meta.shortName || result.meta.displayName || ticker,
        quoteType: result.meta.quoteType || 'N/D',
        all: result.meta
    };
    cacheTickerMeta(ticker, meta);
    
    const prices = [];
    for (let i = 0; i < timestamps.length; i++) {
        if (quotes.close[i] != null) {
            prices.push({
                date: new Date(timestamps[i] * 1000),
                open: quotes.open[i],
                high: quotes.high[i],
                low: quotes.low[i],
                close: quotes.close[i],
                volume: quotes.volume[i]
            });
        }
    }
    return { ticker, prices, meta };
}

function getCachedTickerMeta(ticker) {
    try {
        const cached = JSON.parse(localStorage.getItem(`${TICKER_META_CACHE_PREFIX}${ticker}`));
        if (cached && Date.now() - cached.cachedAt < TICKER_META_CACHE_TTL_MS) {
            return cached.meta;
        }
        localStorage.removeItem(`${TICKER_META_CACHE_PREFIX}${ticker}`);
    } catch {
        localStorage.removeItem(`${TICKER_META_CACHE_PREFIX}${ticker}`);
    }
    return null;
}

function cacheTickerMeta(ticker, meta) {
    try {
        localStorage.setItem(`${TICKER_META_CACHE_PREFIX}${ticker}`, JSON.stringify({
            cachedAt: Date.now(),
            meta
        }));
    } catch {
        return;
    }
}

function generateDemoData(ticker) {
    // Synthetic but realistic 120-day data for flexible lookback and trend analysis
    const prices = [];
    let basePrice = 150 + Math.random() * 200;
    const trend = (Math.random() - 0.4) * 0.008;
    const volatility = 0.015 + Math.random() * 0.02;
    
    const now = new Date();
    for (let i = 119; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        
        const dailyReturn = trend + (Math.random() - 0.5) * volatility * 2;
        basePrice *= (1 + dailyReturn);
        
        const open = basePrice * (1 + (Math.random() - 0.5) * 0.005);
        const close = basePrice;
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);
        const volume = Math.floor(20000000 + Math.random() * 50000000);
        
        prices.push({ date, open, high, low, close, volume });
    }
    const cachedMeta = getCachedTickerMeta(ticker);
    return {
        ticker,
        prices,
        meta: cachedMeta || {
            currency: 'N/D',
            exchange: 'Demo data',
            name: ticker,
            quoteType: 'N/D'
        }
    };
}

// ============================================================
// QUANTITATIVE ENGINE
// ============================================================

function calculateMetrics(data) {
    const { prices } = data;
    if (!prices || prices.length < 5) return null;

    const cfg = (appConfig && appConfig.signal) || {};
    const lookback = Math.min(Math.max(5, cfg.lookback ?? 30), prices.length);
    const trendLookback = cfg.trendLookback ?? 0;
    const signalThresholdPct = cfg.signalThresholdPct ?? 0.0;
    const profitTakeThreshold = cfg.profitTakeThreshold ?? 0.10;
    const stopLossThreshold = cfg.stopLossThreshold ?? -0.02;

    // Slice the active lookback window
    const windowPrices = prices.slice(-lookback);
    const n = windowPrices.length;

    const closes = windowPrices.map(p => p.close);
    const opens = windowPrices.map(p => p.open);
    const volumes = windowPrices.map(p => p.volume);

    // --- DIRECTION ---
    const firstClose = closes[0];
    const normalized = closes.map(c => c / firstClose);
    
    // Linear regression on normalized prices (sessions 0 .. n-1)
    const xMean = (n - 1) / 2;
    const yMean = normalized.reduce((a, b) => a + b, 0) / n;
    
    let ssXY = 0, ssXX = 0;
    for (let i = 0; i < n; i++) {
        ssXY += (i - xMean) * (normalized[i] - yMean);
        ssXX += (i - xMean) * (i - xMean);
    }
    const beta = ssXX !== 0 ? ssXY / ssXX : 0; // slope per day (normalized)
    const intercept = yMean - beta * xMean;
    
    // R-squared
    const yHat = Array.from({length: n}, (_, i) => intercept + beta * i);
    const ssTot = normalized.reduce((s, y) => s + (y - yMean) ** 2, 0);
    const ssRes = normalized.reduce((s, y, i) => s + (y - yHat[i]) ** 2, 0);
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

    // Angle: θ = arctan(β × lookback) in degrees
    const angle = Math.atan(beta * lookback) * (180 / Math.PI);
    
    // Return % over lookback days
    const returnLookback = ((closes[n - 1] - closes[0]) / closes[0]) * 100;

    // --- INTENSITY ---
    const returns = [];
    for (let i = 1; i < n; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    
    const retMean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const volatility = returns.length > 1 ? Math.sqrt(
        returns.reduce((s, r) => s + (r - retMean) ** 2, 0) / (returns.length - 1)
    ) : 0.01;

    // Volume ratio: last 3 days avg vs lookback window avg
    const avgVolumeLookback = volumes.reduce((a, b) => a + b, 0) / n;
    const avgVolumeLast3 = volumes.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, n);
    const volumeRatio = avgVolumeLookback > 0 ? avgVolumeLast3 / avgVolumeLookback : 1.0;

    // Intensity score: |Return| × VolumeRatio / Volatility
    const intensity = (Math.abs(returnLookback / 100) * volumeRatio) / (volatility || 0.001);

    // --- OPENING GAP ---
    const lastClose = n >= 2 ? closes[n - 2] : closes[0];
    const todayOpen = opens[n - 1] ?? closes[n - 1];
    const openingGap = lastClose > 0 ? ((todayOpen - lastClose) / lastClose) * 100 : 0;

    // --- MACRO TREND FILTER ---
    let isTrendBullish = true;
    let hasTrendFilter = false;
    if (trendLookback > lookback && prices.length >= trendLookback) {
        hasTrendFilter = true;
        const trendSlice = prices.slice(-trendLookback);
        const tCloses = trendSlice.map(p => p.close);
        const tFirst = tCloses[0];
        const tNorm = tCloses.map(c => c / tFirst);
        const tMeanX = (tCloses.length - 1) / 2;
        const tMeanY = tNorm.reduce((a, b) => a + b, 0) / tCloses.length;
        let tSSXY = 0, tSSXX = 0;
        for (let i = 0; i < tCloses.length; i++) {
            tSSXY += (i - tMeanX) * (tNorm[i] - tMeanY);
            tSSXX += (i - tMeanX) * (i - tMeanX);
        }
        const tSlope = tSSXX !== 0 ? tSSXY / tSSXX : 0;
        isTrendBullish = tSlope > 0;
    }

    // --- RISK & TARGET LEVELS ---
    const currentPrice = closes[n - 1];
    const takeProfitPrice = currentPrice * (1 + profitTakeThreshold);
    const stopLossPrice = currentPrice * (1 + stopLossThreshold);

    // Regression line points (for chart)
    const regressionLine = Array.from({length: n}, (_, i) => (intercept + beta * i) * firstClose);

    return {
        lookback,
        direction: {
            beta: beta,
            angle: angle,
            returnLookback: returnLookback,
            return30d: returnLookback,
            rSquared: rSquared
        },
        intensity: {
            volatility: volatility,
            volumeRatio: volumeRatio,
            magnitude: intensity
        },
        opening: {
            gap: openingGap,
            lastClose: lastClose,
            todayOpen: todayOpen
        },
        trend: {
            trendLookback,
            isTrendBullish,
            hasTrendFilter
        },
        targets: {
            currentPrice,
            takeProfitPrice,
            takeProfitPct: profitTakeThreshold * 100,
            stopLossPrice,
            stopLossPct: stopLossThreshold * 100
        },
        regressionLine,
        isBullish: angle >= 0
    };
}

function computeSignal(metrics) {
    const { direction, intensity, trend } = metrics;
    const absAngle = Math.abs(direction.angle);
    const magnitude = intensity.magnitude;
    const rSquared = direction.rSquared;
    const returnPct = direction.returnLookback;
    const netReturnDecimal = returnPct / 100;

    // Thresholds from config.json (synced with HP search)
    const cfg = (appConfig && appConfig.signal) || {};
    const angleThreshold = cfg.angleThresholdDegrees ?? 5;
    const intensityThreshold = cfg.intensityThreshold ?? 1.0;
    const confidenceMultiplier = cfg.confidenceMultiplier ?? 25;
    const signalThresholdPct = cfg.signalThresholdPct ?? 0.0;

    // Confidence blends intensity magnitude with regression fit quality.
    let confidence = Math.min(100, Math.max(0, magnitude * rSquared * confidenceMultiplier));
    confidence = Math.round(confidence);

    const meetsAngle = absAngle >= angleThreshold;
    const meetsIntensity = magnitude >= intensityThreshold;
    const meetsBullishReturn = signalThresholdPct <= 1e-6 || netReturnDecimal >= signalThresholdPct;
    const meetsBearishReturn = signalThresholdPct <= 1e-6 || netReturnDecimal <= -signalThresholdPct;
    const meetsTrend = !trend?.hasTrendFilter || trend.isTrendBullish;

    let signal;
    if (metrics.isBullish && meetsAngle && meetsIntensity && meetsBullishReturn && meetsTrend) {
        signal = 'BUY';
    } else if (!metrics.isBullish && meetsAngle && meetsIntensity && meetsBearishReturn) {
        signal = 'SELL';
    } else {
        signal = 'HOLD';
    }

    return { signal, confidence };
}

// ============================================================
// MAIN ANALYSIS FLOW
// ============================================================

async function runAnalysis(ticker) {
    loadingEl.classList.remove('hidden');
    dashboardEl.classList.add('hidden');
    comparisonDashboardEl.classList.add('hidden');

    try {
        const data = await fetchStockData(ticker);
        if (!data || data.prices.length < 5) {
            alert(`Could not retrieve data for ${ticker}. Try another ticker.`);
            loadingEl.classList.add('hidden');
            return;
        }

        const metrics = calculateMetrics(data);
        if (!metrics) {
            alert('Insufficient data to calculate metrics.');
            loadingEl.classList.add('hidden');
            return;
        }

        currentData = data;
        currentMetrics = metrics;

        chartTickerEl.textContent = ticker;
        loadingEl.classList.add('hidden');
        dashboardEl.classList.remove('hidden');

        // Render after dashboard is visible so getBoundingClientRect works
        requestAnimationFrame(() => {
            renderPriceChart(data, metrics);
            renderCompass(metrics);
        });
        renderMetrics(metrics, data);
        renderSignal(metrics);
    } catch (err) {
        console.error(err);
        alert(`Error analyzing ${ticker}: ${err.message}`);
        loadingEl.classList.add('hidden');
    }
}

// ============================================================
// PRICE CHART (Canvas)
// ============================================================

function getCurrencySymbol(currencyCode) {
    try {
        return new Intl.NumberFormat('en', {
            style: 'currency',
            currency: currencyCode,
            currencyDisplay: 'narrowSymbol'
        }).formatToParts(0).find((part) => part.type === 'currency')?.value || currencyCode;
    } catch {
        return currencyCode;
    }
}

function renderPriceChart(data, metrics) {
    const canvas = priceCanvas;
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = (rect.width - 40) * dpr;
    canvas.height = (rect.height - 70) * dpr;
    canvas.style.width = (rect.width - 40) + 'px';
    canvas.style.height = (rect.height - 70) + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const w = rect.width - 40;
    const h = rect.height - 70;
    const pad = { top: 20, right: 100, bottom: 40, left: 60 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const lookback = metrics.lookback || 30;
    const windowPrices = data.prices.slice(-lookback);
    const closes = windowPrices.map(p => p.close);
    const n = closes.length;
    const minP = Math.min(...closes) * 0.995;
    const maxP = Math.max(...closes) * 1.005;

    const xScale = (i) => pad.left + (i / (n - 1)) * plotW;
    const yScale = (v) => pad.top + (1 - (v - minP) / (maxP - minP)) * plotH;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        
        const val = maxP - (i / 4) * (maxP - minP);
        ctx.fillStyle = '#64748b';
        ctx.font = '11px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(2), pad.left - 8, y + 4);
    }

    // X-axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) {
        const d = windowPrices[i].date;
        const label = `${d.getDate()}/${d.getMonth() + 1}`;
        ctx.fillText(label, xScale(i), h - pad.bottom + 20);
    }

    // Area fill under price curve
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    if (metrics.isBullish) {
        gradient.addColorStop(0, 'rgba(0, 212, 170, 0.15)');
        gradient.addColorStop(1, 'rgba(0, 212, 170, 0.0)');
    } else {
        gradient.addColorStop(0, 'rgba(255, 71, 87, 0.15)');
        gradient.addColorStop(1, 'rgba(255, 71, 87, 0.0)');
    }
    
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(closes[0]));
    for (let i = 1; i < n; i++) {
        ctx.lineTo(xScale(i), yScale(closes[i]));
    }
    ctx.lineTo(xScale(n - 1), pad.top + plotH);
    ctx.lineTo(xScale(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Price line
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(closes[0]));
    for (let i = 1; i < n; i++) {
        ctx.lineTo(xScale(i), yScale(closes[i]));
    }
    ctx.strokeStyle = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Regression line
    const regLine = metrics.regressionLine;
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(regLine[0]));
    for (let i = 1; i < n; i++) {
        ctx.lineTo(xScale(i), yScale(regLine[i]));
    }
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vector arrow FROM last point pointing TO the future
    const lastX = xScale(n - 1);
    const lastY = yScale(closes[n - 1]);
    const arrowLen = 80;
    const arrowAngleRad = metrics.direction.angle * (Math.PI / 180);
    
    // End point: projects to the right (future) with angle determining up/down
    // Negative sin because canvas Y is inverted (up = negative Y)
    const endX = lastX + arrowLen * Math.cos(arrowAngleRad);
    const endY = lastY - arrowLen * Math.sin(arrowAngleRad);
    
    // Clamp intensity for arrow thickness
    const arrowWidth = Math.min(5, 2 + metrics.intensity.magnitude * 0.4);
    
    // Arrow glow
    ctx.save();
    ctx.shadowColor = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.shadowBlur = 10;
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.lineWidth = arrowWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Arrow head (filled triangle) at the end point
    const headLen = 16;
    const headWidth = 0.45;
    const headAngle = Math.atan2(endY - lastY, endX - lastX);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headLen * Math.cos(headAngle - headWidth), endY - headLen * Math.sin(headAngle - headWidth));
    ctx.lineTo(endX - headLen * Math.cos(headAngle + headWidth), endY - headLen * Math.sin(headAngle + headWidth));
    ctx.closePath();
    ctx.fillStyle = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.fill();
    ctx.restore();

    // Last price dot
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fillStyle = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.fill();
    ctx.strokeStyle = '#0a0e17';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Price label
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 12px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(`${getCurrencySymbol(data.meta.currency)}${closes[n-1].toFixed(2)}`, lastX + 10, lastY - 10);
}

// ============================================================
// COMPASS GAUGE (Canvas)
// ============================================================

function renderCompass(metrics) {
    const canvas = compassCanvas;
    const dpr = window.devicePixelRatio || 1;
    const size = 260;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const cx = size / 2;
    const cy = size / 2;
    const radius = 100;

    ctx.clearRect(0, 0, size, size);

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#2a3550';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Background gradient arc
    const bgGrad = ctx.createConicGradient(0, cx, cy);
    bgGrad.addColorStop(0, 'rgba(0, 212, 170, 0.1)');
    bgGrad.addColorStop(0.25, 'rgba(0, 212, 170, 0.05)');
    bgGrad.addColorStop(0.5, 'rgba(255, 71, 87, 0.05)');
    bgGrad.addColorStop(0.75, 'rgba(255, 71, 87, 0.1)');
    bgGrad.addColorStop(1, 'rgba(0, 212, 170, 0.1)');
    
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Tick marks
    for (let deg = 0; deg < 360; deg += 15) {
        const rad = (deg - 90) * Math.PI / 180;
        const isMajor = deg % 45 === 0;
        const innerR = isMajor ? radius - 15 : radius - 8;
        
        ctx.beginPath();
        ctx.moveTo(cx + innerR * Math.cos(rad), cy + innerR * Math.sin(rad));
        ctx.lineTo(cx + radius * Math.cos(rad), cy + radius * Math.sin(rad));
        ctx.strokeStyle = isMajor ? '#64748b' : '#2a3550';
        ctx.lineWidth = isMajor ? 2 : 1;
        ctx.stroke();
    }

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labels = [
        { text: '0°', deg: 0 },
        { text: '+45°', deg: 45 },
        { text: '+90°', deg: 90 },
        { text: '-45°', deg: -45 },
        { text: '-90°', deg: -90 }
    ];
    labels.forEach(l => {
        const rad = (-l.deg - 0) * Math.PI / 180; // 0° is right
        const lx = cx + (radius + 20) * Math.cos(rad);
        const ly = cy - (radius + 20) * Math.sin(rad);
        ctx.fillText(l.text, lx, ly);
    });

    // Intensity ring (filled arc proportional to magnitude)
    const intensityClamped = Math.min(metrics.intensity.magnitude, 10) / 10;
    const arcAngle = intensityClamped * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 20, -Math.PI / 2, -Math.PI / 2 + arcAngle);
    ctx.strokeStyle = metrics.isBullish ? 'rgba(0, 212, 170, 0.4)' : 'rgba(255, 71, 87, 0.4)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Vector needle
    const angleRad = -metrics.direction.angle * (Math.PI / 180); // negative because canvas Y is inverted
    const needleLen = radius - 30;
    const needleX = cx + needleLen * Math.cos(angleRad);
    const needleY = cy + needleLen * Math.sin(angleRad);

    // Needle shadow
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(needleX, needleY);
    ctx.strokeStyle = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Arrowhead on needle
    const headLen = 10;
    const headAngle = Math.atan2(needleY - cy, needleX - cx);
    ctx.beginPath();
    ctx.moveTo(needleX, needleY);
    ctx.lineTo(needleX - headLen * Math.cos(headAngle - 0.5), needleY - headLen * Math.sin(headAngle - 0.5));
    ctx.lineTo(needleX - headLen * Math.cos(headAngle + 0.5), needleY - headLen * Math.sin(headAngle + 0.5));
    ctx.closePath();
    ctx.fillStyle = metrics.isBullish ? '#00d4aa' : '#ff4757';
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2235';
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Update legend
    compassAngleEl.textContent = `${metrics.direction.angle >= 0 ? '+' : ''}${metrics.direction.angle.toFixed(1)}°`;
    compassAngleEl.style.color = metrics.isBullish ? '#00d4aa' : '#ff4757';
    compassIntensityEl.textContent = `Strength: ${metrics.intensity.magnitude.toFixed(2)}`;
}

// ============================================================
// SIGNAL PANEL
// ============================================================

function renderSignal(metrics) {
    const { signal, confidence } = computeSignal(metrics);
    const lower = signal.toLowerCase();
    const { targets } = metrics;
    const currency = (currentData && currentData.meta && currentData.meta.currency) || '$';

    signalValueEl.textContent = signal;
    signalValueEl.className = `signal-value ${lower}`;
    signalBadgeEl.textContent = signal;
    signalBadgeEl.className = `signal-badge ${lower}`;
    signalConfidenceEl.textContent = `${confidence}%`;
    signalConfidenceFillEl.style.width = `${confidence}%`;

    // Color-code the confidence fill based on signal direction.
    const color = lower === 'buy' ? '#00d4aa' : lower === 'sell' ? '#ff4757' : '#3b82f6';
    signalConfidenceFillEl.style.background = `linear-gradient(90deg, var(--accent-purple), ${color})`;

    if (targets && targetProfitValEl && targetLossValEl) {
        targetProfitPctEl.textContent = `+${targets.takeProfitPct.toFixed(0)}%`;
        targetProfitValEl.textContent = `${currency} ${targets.takeProfitPrice.toFixed(2)}`;
        targetLossPctEl.textContent = `${targets.stopLossPct.toFixed(0)}%`;
        targetLossValEl.textContent = `${currency} ${targets.stopLossPrice.toFixed(2)}`;
    }
}

// ============================================================
// METRICS PANEL
// ============================================================

function renderMetrics(metrics, data) {
    const { direction, intensity, opening, targets, trend, lookback } = metrics;
    const { ticker, meta } = data;
    const allInfo = JSON.stringify(meta.all || meta, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    const dirColor = metrics.isBullish ? 'positive' : 'negative';
    const gapColor = opening.gap >= 0 ? 'positive' : 'negative';

    metricsContent.innerHTML = `
        <div class="metric-block ${metrics.isBullish ? '' : 'red'}">
            <div class="metric-block-title">Movement Direction (${lookback}d)</div>
            <div class="metric-row">
                <span class="metric-label">Slope (β)</span>
                <span class="metric-value ${dirColor}">${direction.beta >= 0 ? '+' : ''}${(direction.beta * 100).toFixed(4)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Vector Angle</span>
                <span class="metric-value ${dirColor}">${direction.angle >= 0 ? '+' : ''}${direction.angle.toFixed(2)}°</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">${lookback}-Day Return</span>
                <span class="metric-value ${dirColor}">${direction.returnLookback >= 0 ? '+' : ''}${direction.returnLookback.toFixed(2)}%</span>
            </div>
        </div>
        <div class="metric-block purple">
            <div class="metric-block-title">Intensity & Confidence</div>
            <div class="metric-row">
                <span class="metric-label">Daily Volatility</span>
                <span class="metric-value">${(intensity.volatility * 100).toFixed(3)}%</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Volume Ratio</span>
                <span class="metric-value">${intensity.volumeRatio.toFixed(3)}x</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Vector Magnitude</span>
                <span class="metric-value">${intensity.magnitude.toFixed(3)}</span>
            </div>
        </div>
        <div class="metric-block ${opening.gap >= 0 ? '' : 'red'}">
            <div class="metric-block-title">Today's Open</div>
            <div class="metric-row">
                <span class="metric-label">Opening Gap</span>
                <span class="metric-value ${gapColor}">${opening.gap >= 0 ? '+' : ''}${opening.gap.toFixed(3)}%</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Previous Close</span>
                <span class="metric-value">${meta.currency} ${opening.lastClose.toFixed(2)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Today's Open</span>
                <span class="metric-value">${meta.currency} ${opening.todayOpen.toFixed(2)}</span>
            </div>
        </div>
        <div class="metric-block purple">
            <div class="metric-block-title">Strategy & Risk Targets</div>
            <div class="metric-row">
                <span class="metric-label">Target (+${targets.takeProfitPct.toFixed(0)}%)</span>
                <span class="metric-value positive">${meta.currency} ${targets.takeProfitPrice.toFixed(2)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Stop Loss (${targets.stopLossPct.toFixed(0)}%)</span>
                <span class="metric-value negative">${meta.currency} ${targets.stopLossPrice.toFixed(2)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Macro Trend (${trend.trendLookback > 0 ? trend.trendLookback + 'd' : 'None'})</span>
                <span class="metric-value">${trend.hasTrendFilter ? (trend.isTrendBullish ? 'BULLISH' : 'BEARISH') : 'Aligned'}</span>
            </div>
        </div>
        <div class="metric-block purple">
            <div class="metric-block-title metric-block-title-with-action">
                <span>Ticker Information</span>
                <button class="btn-show-info" type="button" aria-label="Show all stock information" aria-expanded="false">
                    Show All Info
                </button>
            </div>
            <div class="metric-row">
                <span class="metric-label">Symbol</span>
                <span class="metric-value">${ticker}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Ticker Name</span>
                <span class="metric-value">${meta.name}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Currency</span>
                <span class="metric-value">${meta.currency}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Market</span>
                <span class="metric-value">${meta.exchange}</span>
            </div>
        </div>
        <div class="stock-info-dialog" role="dialog" aria-modal="true" aria-label="All stock information" aria-hidden="true">
            <div class="stock-info-window">
                <div class="stock-info-window-header">
                    <h3>All Stock Information — ${ticker}</h3>
                    <button class="btn-close-info" type="button" aria-label="Close stock information">×</button>
                </div>
                <div class="stock-info-window-content"><pre>${allInfo}</pre></div>
            </div>
        </div>
    `;

    const showInfoBtn = metricsContent.querySelector('.btn-show-info');
    const stockInfoDialog = metricsContent.querySelector('.stock-info-dialog');
    const closeInfoBtn = metricsContent.querySelector('.btn-close-info');
    const openStockInfo = () => {
        stockInfoDialog.classList.add('is-open');
        stockInfoDialog.setAttribute('aria-hidden', 'false');
        showInfoBtn.setAttribute('aria-expanded', 'true');
    };
    const closeStockInfo = () => {
        stockInfoDialog.classList.remove('is-open');
        stockInfoDialog.setAttribute('aria-hidden', 'true');
        showInfoBtn.setAttribute('aria-expanded', 'false');
    };

    showInfoBtn.addEventListener('mouseenter', openStockInfo);
    showInfoBtn.addEventListener('focus', openStockInfo);
    showInfoBtn.addEventListener('click', openStockInfo);
    closeInfoBtn.addEventListener('click', closeStockInfo);
    stockInfoDialog.addEventListener('click', (event) => {
        if (event.target === stockInfoDialog) closeStockInfo();
    });
}

// ============================================================
// COPY REPORT
// ============================================================

function copyReport() {
    if (!currentMetrics || !currentData) return;

    const { direction, intensity, opening, targets, lookback } = currentMetrics;
    const { ticker, meta } = currentData;
    const { signal, confidence } = computeSignal(currentMetrics);

    const report = `
══════════════════════════════════════
  VECTOR STOCK REPORT - ${ticker}
══════════════════════════════════════

▸ TRADING SIGNAL
  Recommendation:    ${signal}
  Confidence:        ${confidence}%
  Target (+${targets.takeProfitPct.toFixed(0)}%):    ${meta.currency} ${targets.takeProfitPrice.toFixed(2)}
  Stop Loss (${targets.stopLossPct.toFixed(0)}%): ${meta.currency} ${targets.stopLossPrice.toFixed(2)}

▸ MOVEMENT DIRECTION (${lookback}d)
  Slope (β):         ${direction.beta >= 0 ? '+' : ''}${(direction.beta * 100).toFixed(4)}
  Vector Angle:      ${direction.angle >= 0 ? '+' : ''}${direction.angle.toFixed(2)}°
  ${lookback}-Day Return:     ${direction.returnLookback >= 0 ? '+' : ''}${direction.returnLookback.toFixed(2)}%

▸ INTENSITY & CONFIDENCE
  Daily Volatility:  ${(intensity.volatility * 100).toFixed(3)}%
  Volume Ratio:      ${intensity.volumeRatio.toFixed(3)}x
  Magnitude (Strength): ${intensity.magnitude.toFixed(3)}

▸ TODAY'S OPEN
  Opening Gap:       ${opening.gap >= 0 ? '+' : ''}${opening.gap.toFixed(3)}%
  Previous Close:    ${meta.currency} ${opening.lastClose.toFixed(2)}
  Today's Open:      ${meta.currency} ${opening.todayOpen.toFixed(2)}

▸ TICKER INFORMATION
  Currency:          ${meta.currency}
  Market:            ${meta.exchange}

══════════════════════════════════════
  Signal: ${signal} (${confidence}% confidence) | Lookback: ${lookback}d | Magnitude: ${intensity.magnitude.toFixed(2)}
══════════════════════════════════════
`.trim();

    navigator.clipboard.writeText(report).then(() => {
        showToast();
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = report;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast();
    });
}

function showToast() {
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 2500);
}

// ============================================================
// COMPARISON FLOW & RENDERING
// ============================================================

async function runComparison() {
    if (selectedTickers.length < 2) return;

    loadingEl.querySelector('span').textContent = 'Fetching and analyzing comparison data...';
    loadingEl.classList.remove('hidden');
    dashboardEl.classList.add('hidden');
    comparisonDashboardEl.classList.add('hidden');

    try {
        const promises = selectedTickers.map(t => fetchStockData(t));
        const results = await Promise.all(promises);

        const validResults = [];
        for (let i = 0; i < results.length; i++) {
            const data = results[i];
            if (data && data.prices.length >= 5) {
                const metrics = calculateMetrics(data);
                if (metrics) {
                    validResults.push({ data, metrics });
                }
            }
        }

        if (validResults.length < 2) {
            alert('Insufficient data to compare the selected stocks. Make sure they are valid tickers.');
            loadingEl.classList.add('hidden');
            return;
        }

        currentComparisonResults = validResults;
        loadingEl.classList.add('hidden');
        comparisonDashboardEl.classList.remove('hidden');

        // Render charts
        requestAnimationFrame(() => {
            renderComparisonChart(validResults);
        });
        renderComparisonTable(validResults);
    } catch (err) {
        console.error(err);
        alert(`Error comparing stocks: ${err.message}`);
        loadingEl.classList.add('hidden');
    }
}

function renderComparisonChart(results) {
    const canvas = comparisonCanvas;
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = (rect.width - 40) * dpr;
    canvas.height = (rect.height - 110) * dpr;
    canvas.style.width = (rect.width - 40) + 'px';
    canvas.style.height = (rect.height - 110) + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const w = rect.width - 40;
    const h = rect.height - 110;
    const pad = { top: 20, right: 100, bottom: 40, left: 60 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Normalize prices for all stocks
    const normalizedData = results.map((r, idx) => {
        const lookback = r.metrics.lookback || 30;
        const windowPrices = r.data.prices.slice(-lookback);
        const closes = windowPrices.map(p => p.close);
        const firstClose = closes[0];
        const normalizedCloses = closes.map(c => (c / firstClose) * 100);
        return {
            ticker: r.data.ticker,
            prices: normalizedCloses,
            rawPrices: closes,
            dates: windowPrices.map(p => p.date),
            metrics: r.metrics,
            color: COMPARISON_COLORS[idx % COMPARISON_COLORS.length]
        };
    });

    // Find global min and max normalized values
    let minVal = 100;
    let maxVal = 100;
    normalizedData.forEach(nd => {
        const min = Math.min(...nd.prices);
        const max = Math.max(...nd.prices);
        if (min < minVal) minVal = min;
        if (max > maxVal) maxVal = max;
    });

    // Add padding to min/max
    minVal = minVal * 0.995;
    maxVal = maxVal * 1.005;

    const n = normalizedData[0].prices.length;
    const xScale = (i) => pad.left + (i / (n - 1)) * plotW;
    const yScale = (v) => pad.top + (1 - (v - minVal) / (maxVal - minVal)) * plotH;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        
        const val = maxVal - (i / 4) * (maxVal - minVal);
        ctx.fillStyle = '#64748b';
        ctx.font = '11px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(1), pad.left - 8, y + 4);
    }

    // X-axis labels (dates from the first stock)
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(n / 6));
    const firstStockDates = normalizedData[0].dates;
    for (let i = 0; i < n; i += step) {
        const d = firstStockDates[i];
        const label = `${d.getDate()}/${d.getMonth() + 1}`;
        ctx.fillText(label, xScale(i), h - pad.bottom + 20);
    }

    // Draw reference line at 100 (starting baseline)
    ctx.beginPath();
    ctx.moveTo(pad.left, yScale(100));
    ctx.lineTo(w - pad.right, yScale(100));
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw each stock's line and vector arrow
    normalizedData.forEach(nd => {
        // Line
        ctx.beginPath();
        ctx.moveTo(xScale(0), yScale(nd.prices[0]));
        for (let i = 1; i < n; i++) {
            ctx.lineTo(xScale(i), yScale(nd.prices[i]));
        }
        ctx.strokeStyle = nd.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // End dot
        const lastX = xScale(n - 1);
        const lastY = yScale(nd.prices[n - 1]);
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fillStyle = nd.color;
        ctx.fill();

        // Vector Arrow
        const arrowLen = 60;
        const arrowAngleRad = nd.metrics.direction.angle * (Math.PI / 180);
        const endX = lastX + arrowLen * Math.cos(arrowAngleRad);
        const endY = lastY - arrowLen * Math.sin(arrowAngleRad);
        const arrowWidth = Math.min(4, 1.5 + nd.metrics.intensity.magnitude * 0.3);

        ctx.save();
        ctx.shadowColor = nd.color;
        ctx.shadowBlur = 6;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = nd.color;
        ctx.lineWidth = arrowWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Arrow head
        const headLen = 12;
        const headWidth = 0.45;
        const headAngle = Math.atan2(endY - lastY, endX - lastX);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(headAngle - 0.5), endY - headLen * Math.sin(headAngle - 0.5));
        ctx.lineTo(endX - headLen * Math.cos(headAngle + 0.5), endY - headLen * Math.sin(headAngle + 0.5));
        ctx.closePath();
        ctx.fillStyle = nd.color;
        ctx.fill();
        ctx.restore();

        // Price Label
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText(`${nd.ticker}: ${nd.prices[n - 1].toFixed(1)}`, lastX + 8, lastY - 4);
    });

    // Render Legend below the chart
    comparisonLegendEl.innerHTML = normalizedData.map(nd => {
        const sign = nd.metrics.direction.angle >= 0 ? '+' : '';
        return `<div class="legend-item">
            <span class="legend-color" style="background: ${nd.color}; color: ${nd.color}"></span>
            <span class="legend-text">
                <span class="ticker-symbol">${nd.ticker}</span>
                <span>(${sign}${nd.metrics.direction.angle.toFixed(1)}°, ${nd.metrics.intensity.magnitude.toFixed(1)}x)</span>
            </span>
        </div>`;
    }).join('');
}



function renderComparisonTable(results) {
    const lookback = (results[0] && results[0].metrics && results[0].metrics.lookback) || 30;
    if (thReturnPeriodEl) thReturnPeriodEl.textContent = `${lookback}-Day Return`;

    comparisonTableBody.innerHTML = results.map((r, idx) => {
        const { data, metrics } = r;
        const ticker = data.ticker;
        const name = data.meta.name || ticker;
        const { signal, confidence } = computeSignal(metrics);
        const lowerSignal = signal.toLowerCase();
        
        const dirColor = metrics.isBullish ? 'positive' : 'negative';
        const gapColor = metrics.opening.gap >= 0 ? 'positive' : 'negative';
        
        const signAngle = metrics.direction.angle >= 0 ? '+' : '';
        const signReturn = metrics.direction.returnLookback >= 0 ? '+' : '';
        const signGap = metrics.opening.gap >= 0 ? '+' : '';
        
        return `
            <tr>
                <td>
                    <div class="ticker-cell">
                        <span class="ticker-cell-code" style="color: ${COMPARISON_COLORS[idx % COMPARISON_COLORS.length]}">${ticker}</span>
                        <span class="ticker-cell-name" title="${name}">${name}</span>
                    </div>
                </td>
                <td>
                    <span class="signal-badge ${lowerSignal}">${signal}</span>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px; width: 100px;">
                        <span style="font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 0.8rem;">${confidence}%</span>
                        <div class="confidence-bar" style="height: 4px;">
                            <div class="confidence-fill" style="width: ${confidence}%; background: linear-gradient(90deg, var(--accent-purple), ${lowerSignal === 'buy' ? 'var(--accent-green)' : lowerSignal === 'sell' ? 'var(--accent-red)' : 'var(--accent-blue)'})"></div>
                        </div>
                    </div>
                </td>
                <td class="metric-value ${dirColor}">${signAngle}${metrics.direction.angle.toFixed(1)}°</td>
                <td class="metric-value ${dirColor}">${signReturn}${metrics.direction.returnLookback.toFixed(2)}%</td>
                <td class="metric-value">${(metrics.intensity.volatility * 100).toFixed(2)}%</td>
                <td class="metric-value">${metrics.intensity.volumeRatio.toFixed(2)}x</td>
                <td class="metric-value" style="color: var(--accent-purple); font-weight: 700;">${metrics.intensity.magnitude.toFixed(2)}</td>
                <td class="metric-value ${gapColor}">${signGap}${metrics.opening.gap.toFixed(2)}%</td>
                <td>
                    <button class="btn-table-action" data-ticker="${ticker}">Analyze</button>
                </td>
            </tr>
        `;
    }).join('');

    // Add event listeners to the Action buttons in the table
    comparisonTableBody.querySelectorAll('.btn-table-action').forEach(btn => {
        btn.addEventListener('click', () => {
            const ticker = btn.dataset.ticker;
            selectedTickers = [ticker];
            updateDashboardState();
        });
    });
}

function copyComparisonReport() {
    if (!currentComparisonResults || currentComparisonResults.length === 0) return;
    const lookback = (currentComparisonResults[0] && currentComparisonResults[0].metrics && currentComparisonResults[0].metrics.lookback) || 30;

    let report = `═══════════════════════════════════════════════════════════════════════════\n`;
    report += `  VECTOR STOCK COMPARISON REPORT\n`;
    report += `  Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
    report += `═══════════════════════════════════════════════════════════════════════════\n\n`;

    report += `Ticker      Signal      Confidence  Angle     Return (${lookback}d)  Volatility  Volume Ratio  Magnitude  Opening Gap\n`;
    report += `─────────────────────────────────────────────────────────────────────────────────────────────────────────────\n`;

    currentComparisonResults.forEach(r => {
        const { data, metrics } = r;
        const ticker = data.ticker.padEnd(11);
        const { signal, confidence } = computeSignal(metrics);
        const signalStr = signal.padEnd(11);
        const confStr = `${confidence}%`.padEnd(12);
        
        const signAngle = metrics.direction.angle >= 0 ? '+' : '';
        const angleStr = `${signAngle}${metrics.direction.angle.toFixed(1)}°`.padEnd(10);
        
        const signReturn = metrics.direction.returnLookback >= 0 ? '+' : '';
        const returnStr = `${signReturn}${metrics.direction.returnLookback.toFixed(2)}%`.padEnd(14);
        
        const volStr = `${(metrics.intensity.volatility * 100).toFixed(2)}%`.padEnd(12);
        const volRatioStr = `${metrics.intensity.volumeRatio.toFixed(2)}x`.padEnd(14);
        const magStr = metrics.intensity.magnitude.toFixed(2).padEnd(11);
        
        const signGap = metrics.opening.gap >= 0 ? '+' : '';
        const gapStr = `${signGap}${metrics.opening.gap.toFixed(2)}%`;

        report += `${ticker} ${signalStr} ${confStr} ${angleStr} ${returnStr} ${volStr} ${volRatioStr} ${magStr} ${gapStr}\n`;
    });

    report += `\n═══════════════════════════════════════════════════════════════════════════\n`;

    navigator.clipboard.writeText(report).then(() => {
        showToast();
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = report;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast();
    });
}

copyComparisonBtn.addEventListener('click', copyComparisonReport);

// ============================================================
// CONFIG & TICKERS LOADER
// ============================================================

async function loadConfig() {
    try {
        const resp = await fetch('config.json');
        if (resp.ok) {
            appConfig = await resp.json();
            updateSignalHelpConfig();
            console.log('Loaded dashboard config:', appConfig);
        }
    } catch (err) {
        console.warn('Failed to load config.json, using defaults:', err);
    }

    try {
        const resp = await fetch('tickers.json');
        if (resp.ok) {
            const fetchedTickers = await resp.json();
            const tickerMap = new Map();
            POPULAR_TICKERS.forEach(t => tickerMap.set(t.code, t));
            fetchedTickers.forEach(t => tickerMap.set(t.code, t));
            allTickers = Array.from(tickerMap.values());
            allTickers.sort((a, b) => a.code.localeCompare(b.code));
            console.log(`Loaded ${allTickers.length} tickers for autocomplete.`);
        }
    } catch (err) {
        console.warn('Failed to load tickers.json, using popular tickers fallback:', err);
    }
}

updateSignalHelpConfig();
loadConfig();

// ============================================================
// WINDOW RESIZE
// ============================================================

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (selectedTickers.length <= 1) {
            if (currentData && currentMetrics) {
                renderPriceChart(currentData, currentMetrics);
                renderCompass(currentMetrics);
            }
        } else {
            if (currentComparisonResults) {
                renderComparisonChart(currentComparisonResults);
            }
        }
    }, 200);
});
