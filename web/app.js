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

// State
let currentData = null;
let currentMetrics = null;
let appConfig = null;
const TICKER_META_CACHE_PREFIX = 'vector-stock:meta:';
const TICKER_META_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// DOM Elements
const tickerInput = document.getElementById('ticker-input');
const analyzeBtn = document.getElementById('analyze-btn');
const autocompleteList = document.getElementById('autocomplete-list');
const quickChips = document.getElementById('quick-chips');
const loadingEl = document.getElementById('loading');
const dashboardEl = document.getElementById('dashboard');
const chartTickerEl = document.getElementById('chart-ticker');
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
const signalHelpBtn = document.getElementById('signal-help-btn');
const signalHelpDialog = document.getElementById('signal-help-dialog');
const closeSignalHelpBtn = document.getElementById('close-signal-help-btn');
const helpAngleThresholdEl = document.getElementById('help-angle-threshold');
const helpIntensityThresholdEl = document.getElementById('help-intensity-threshold');
const helpConfidenceMultiplierEl = document.getElementById('help-confidence-multiplier');

// ============================================================
// AUTOCOMPLETE
// ============================================================

tickerInput.addEventListener('input', () => {
    const val = tickerInput.value.trim().toUpperCase();
    if (!val) {
        autocompleteList.classList.add('hidden');
        return;
    }
    const matches = POPULAR_TICKERS.filter(t =>
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

autocompleteList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) {
        tickerInput.value = li.dataset.ticker;
        autocompleteList.classList.add('hidden');
        runAnalysis(li.dataset.ticker);
    }
});

tickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        autocompleteList.classList.add('hidden');
        const ticker = tickerInput.value.trim().toUpperCase();
        if (ticker) runAnalysis(ticker);
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        autocompleteList.classList.add('hidden');
    }
});

analyzeBtn.addEventListener('click', () => {
    const ticker = tickerInput.value.trim().toUpperCase();
    if (ticker) runAnalysis(ticker);
});

quickChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
        tickerInput.value = chip.dataset.ticker;
        runAnalysis(chip.dataset.ticker);
    }
});

copyBtn.addEventListener('click', copyReport);

function updateSignalHelpConfig() {
    const cfg = (appConfig && appConfig.signal) || {};
    helpAngleThresholdEl.textContent = `${cfg.angleThresholdDegrees ?? 5}°`;
    helpIntensityThresholdEl.textContent = cfg.intensityThreshold ?? 1.0;
    helpConfidenceMultiplierEl.textContent = cfg.confidenceMultiplier ?? 25;
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
    // Use Yahoo Finance API via a CORS proxy or direct fetch
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1mo&interval=1d`;
    
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
    // Synthetic but realistic 30-day data
    const prices = [];
    let basePrice = 150 + Math.random() * 200;
    const trend = (Math.random() - 0.4) * 0.008;
    const volatility = 0.015 + Math.random() * 0.02;
    
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
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
    const n = prices.length;
    if (n < 5) return null;

    const closes = prices.map(p => p.close);
    const opens = prices.map(p => p.open);
    const volumes = prices.map(p => p.volume);

    // --- DIRECTION ---
    // Normalized prices
    const firstClose = closes[0];
    const normalized = closes.map(c => c / firstClose);
    
    // Linear regression on normalized prices
    const xMean = (n - 1) / 2;
    const yMean = normalized.reduce((a, b) => a + b, 0) / n;
    
    let ssXY = 0, ssXX = 0;
    for (let i = 0; i < n; i++) {
        ssXY += (i - xMean) * (normalized[i] - yMean);
        ssXX += (i - xMean) * (i - xMean);
    }
    const beta = ssXY / ssXX; // slope per day (normalized)
    const intercept = yMean - beta * xMean;
    
    // R-squared
    const yHat = Array.from({length: n}, (_, i) => intercept + beta * i);
    const ssTot = normalized.reduce((s, y) => s + (y - yMean) ** 2, 0);
    const ssRes = normalized.reduce((s, y, i) => s + (y - yHat[i]) ** 2, 0);
    const rSquared = 1 - ssRes / ssTot;

    // Angle: θ = arctan(β × 30) in degrees
    const angle = Math.atan(beta * 30) * (180 / Math.PI);
    
    // Return % over 30 days
    const return30d = ((closes[n - 1] - closes[0]) / closes[0]) * 100;

    // --- INTENSITY ---
    // Daily returns
    const returns = [];
    for (let i = 1; i < n; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    
    // Volatility (std dev of daily returns)
    const retMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const volatility = Math.sqrt(
        returns.reduce((s, r) => s + (r - retMean) ** 2, 0) / (returns.length - 1)
    );

    // Volume ratio: last 3 days avg vs 30d avg
    const avgVolume30d = volumes.reduce((a, b) => a + b, 0) / n;
    const avgVolumeLast3 = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const volumeRatio = avgVolumeLast3 / avgVolume30d;

    // Intensity score: |Return| × VolumeRatio / Volatility
    const intensity = (Math.abs(return30d / 100) * volumeRatio) / (volatility || 0.001);

    // --- OPENING GAP ---
    const lastClose = closes[n - 2]; // yesterday's close
    const todayOpen = opens[n - 1];  // today's open
    const openingGap = ((todayOpen - lastClose) / lastClose) * 100;

    // Regression line points (for chart)
    const regressionLine = Array.from({length: n}, (_, i) => (intercept + beta * i) * firstClose);

    return {
        direction: {
            beta: beta,
            angle: angle,
            return30d: return30d,
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
        regressionLine,
        isBullish: angle >= 0
    };
}

function computeSignal(metrics) {
    const { direction, intensity } = metrics;
    const absAngle = Math.abs(direction.angle);
    const magnitude = intensity.magnitude;
    const rSquared = direction.rSquared;

    // Thresholds are read from config.json so they can be tuned without
    // editing this file. Defaults match the original hyperparameter defaults.
    const cfg = (appConfig && appConfig.signal) || {};
    const angleThreshold = cfg.angleThresholdDegrees ?? 5;
    const intensityThreshold = cfg.intensityThreshold ?? 1.0;
    const confidenceMultiplier = cfg.confidenceMultiplier ?? 25;

    // Confidence blends intensity magnitude with regression fit quality.
    let confidence = Math.min(100, Math.max(0, magnitude * rSquared * confidenceMultiplier));
    confidence = Math.round(confidence);

    let signal;
    if (metrics.isBullish && absAngle >= angleThreshold && magnitude >= intensityThreshold) {
        signal = 'BUY';
    } else if (!metrics.isBullish && absAngle >= angleThreshold && magnitude >= intensityThreshold) {
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

    const { prices } = data;
    const closes = prices.map(p => p.close);
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
        const d = prices[i].date;
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
    ctx.fillText(`${data.meta.currency} ${closes[n-1].toFixed(2)}`, lastX + 10, lastY - 10);
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

    signalValueEl.textContent = signal;
    signalValueEl.className = `signal-value ${lower}`;
    signalBadgeEl.textContent = signal;
    signalBadgeEl.className = `signal-badge ${lower}`;
    signalConfidenceEl.textContent = `${confidence}%`;
    signalConfidenceFillEl.style.width = `${confidence}%`;

    // Color-code the confidence fill based on signal direction.
    const color = lower === 'buy' ? '#00d4aa' : lower === 'sell' ? '#ff4757' : '#3b82f6';
    signalConfidenceFillEl.style.background = `linear-gradient(90deg, var(--accent-purple), ${color})`;
}

// ============================================================
// METRICS PANEL
// ============================================================

function renderMetrics(metrics, data) {
    const { direction, intensity, opening } = metrics;
    const { ticker, meta } = data;
    const allInfo = JSON.stringify(meta.all || meta, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    const dirColor = metrics.isBullish ? 'positive' : 'negative';
    const gapColor = opening.gap >= 0 ? 'positive' : 'negative';

    metricsContent.innerHTML = `
        <div class="metric-block ${metrics.isBullish ? '' : 'red'}">
            <div class="metric-block-title">Movement Direction</div>
            <div class="metric-row">
                <span class="metric-label">Slope (β)</span>
                <span class="metric-value ${dirColor}">${direction.beta >= 0 ? '+' : ''}${(direction.beta * 100).toFixed(4)}</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Vector Angle</span>
                <span class="metric-value ${dirColor}">${direction.angle >= 0 ? '+' : ''}${direction.angle.toFixed(2)}°</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">30-Day Return</span>
                <span class="metric-value ${dirColor}">${direction.return30d >= 0 ? '+' : ''}${direction.return30d.toFixed(2)}%</span>
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

    const { direction, intensity, opening } = currentMetrics;
    const { ticker, meta } = currentData;
    const { signal, confidence } = computeSignal(currentMetrics);

    const report = `
══════════════════════════════════════
  VECTOR STOCK REPORT - ${ticker}
══════════════════════════════════════

▸ TRADING SIGNAL
  Recommendation:    ${signal}
  Confidence:        ${confidence}%

▸ MOVEMENT DIRECTION
  Slope (β):         ${direction.beta >= 0 ? '+' : ''}${(direction.beta * 100).toFixed(4)}
  Vector Angle:      ${direction.angle >= 0 ? '+' : ''}${direction.angle.toFixed(2)}°
  30-Day Return:     ${direction.return30d >= 0 ? '+' : ''}${direction.return30d.toFixed(2)}%

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
  Signal: ${signal} (${confidence}% confidence) | Intensity: ${intensity.magnitude.toFixed(2)}
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
// CONFIG LOADER
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
        if (currentData && currentMetrics) {
            renderPriceChart(currentData, currentMetrics);
            renderCompass(currentMetrics);
        }
    }, 200);
});
