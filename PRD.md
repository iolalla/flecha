# PRD — Vector Stock Dashboard

## Product Overview

**Vector Stock Dashboard** is a single-page quantitative financial analysis tool that calculates and visualizes the **Vector** (Direction & Intensity) of any stock based on the last 30 trading days. It provides traders and analysts with an instant, intuitive reading of a stock's momentum using linear regression, volatility metrics, and volume analysis — presented through a professional dark-themed dashboard.

---

## Problem Statement

Retail and quantitative traders need a fast, visual way to assess a stock's current directional momentum and the strength (intensity) behind that movement. Traditional charting tools show raw price data but don't synthesize direction, volatility, and volume into a single actionable "vector" metric.

---

## Target Users

- **Quantitative traders** seeking rapid signal assessment.
- **Retail investors** wanting a clear visual summary of stock momentum.
- **Financial analysts** needing a quick screening tool for direction + intensity.

---

## Functional Requirements

### FR-1: Ticker Search with Autocomplete

| ID | Requirement |
|----|-------------|
| FR-1.1 | Text input with real-time autocomplete filtering from a list of 20+ popular tickers. |
| FR-1.2 | Autocomplete displays ticker code + company name. |
| FR-1.3 | Quick-access chips for the top 10 most searched tickers (AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, META, SPY, QQQ, BTC-USD). |
| FR-1.4 | Accepts any custom ticker typed manually (not limited to the predefined list). |
| FR-1.5 | Analysis triggered by Enter key, Analyze button, or chip click. |

### FR-2: Quantitative Calculation Engine

| ID | Requirement | Formula |
|----|-------------|---------|
| FR-2.1 | **Linear Regression** on normalized prices (30 days) to obtain slope β and intercept. | OLS: β = Σ(xᵢ - x̄)(yᵢ - ȳ) / Σ(xᵢ - x̄)² |
| FR-2.2 | **Vector Angle** θ derived from the regression slope. | θ = arctan(β × 30) × (180/π) degrees |
| FR-2.3 | **30-Day Return** percentage. | (Close_last - Close_first) / Close_first × 100 |
| FR-2.4 | **Daily Volatility** as standard deviation of daily returns. | σ = √(Σ(rᵢ - r̄)² / (n-1)) |
| FR-2.5 | **Volume Ratio** comparing last 3 days average vs 30-day average. | VR = AvgVol_3d / AvgVol_30d |
| FR-2.6 | **Magnitude/Intensity Score** combining return, volume, and volatility. | I = (\|Return\| × VolumeRatio) / Volatility |
| FR-2.7 | **Opening Gap** between yesterday's close and today's open. | Gap = (Open_today - Close_yesterday) / Close_yesterday × 100 |

### FR-3: Interactive Price & Vector Chart

| ID | Requirement |
|----|-------------|
| FR-3.1 | Canvas-rendered line chart showing 30 days of closing prices. |
| FR-3.2 | Area fill under the price curve with color based on direction (green = bullish, red = bearish). |
| FR-3.3 | Dashed purple regression line overlaid on the chart. |
| FR-3.4 | **Vector arrow** originating from the last price point, projecting toward the future. Arrow angle matches θ; arrow thickness scales with intensity. |
| FR-3.5 | Arrow has a glow effect and filled triangular arrowhead. |
| FR-3.6 | Y-axis price labels, X-axis date labels, grid lines. |
| FR-3.7 | Last price dot with dollar value annotation. |
| FR-3.8 | Responsive: redraws on window resize. |

### FR-4: Vector Compass (Radial Gauge)

| ID | Requirement |
|----|-------------|
| FR-4.1 | Circular polar gauge with tick marks every 15° and labels at key angles (0°, ±45°, ±90°). |
| FR-4.2 | Needle pointing at the computed vector angle θ with color glow. |
| FR-4.3 | Intensity arc: filled ring proportional to magnitude score (0–10 scale). |
| FR-4.4 | Legend below showing angle value and force score. |

### FR-5: Metrics Report Panel

| ID | Requirement |
|----|-------------|
| FR-5.1 | **Block 1 — DIRECCIÓN DEL MOVIMIENTO**: Pendiente (β), Ángulo del Vector, Retorno 30 Días. |
| FR-5.2 | **Block 2 — INTENSIDAD Y CONFIANZA**: Volatilidad Diaria, Ratio de Volumen, Magnitud del Vector. |
| FR-5.3 | **Block 3 — APERTURA DE HOY**: Gap de Apertura, Cierre Anterior, Apertura Hoy. |
| FR-5.4 | Color-coded values: green for positive, red for negative. |
| FR-5.5 | **Copy Report** button that copies a formatted plain-text report to the clipboard with a toast confirmation. |

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Performance**: All calculations and renders complete in < 500ms after data is available. |
| NFR-2 | **Zero dependencies**: Pure vanilla HTML/CSS/JS, no build step required. |
| NFR-3 | **Responsive**: Works on desktop (≥1024px) and tablet (≥600px) viewports. |
| NFR-4 | **Dark theme**: Professional financial terminal aesthetic with dark background (#0a0e17). |
| NFR-5 | **Typography**: Inter for UI text, JetBrains Mono for numeric/data values. |
| NFR-6 | **Data source**: Yahoo Finance API via CORS proxy; graceful fallback to synthetic demo data if unavailable. |
| NFR-7 | **Browser support**: Modern evergreen browsers (Chrome, Firefox, Safari, Edge). |

---

## Architecture

```
flecha/
├── PRD.md              ← This document
└── web/
    ├── index.html      ← Page structure & layout
    ├── styles.css      ← Dark theme, responsive grid, component styles
    └── app.js          ← Autocomplete, data fetching, calculation engine,
                           Canvas chart rendering, clipboard API
```

### Data Flow

```
User Input (ticker)
    → fetchStockData(ticker)         [Yahoo Finance API / CORS proxy / demo fallback]
    → calculateMetrics(data)         [Regression, volatility, volume, gap]
    → renderPriceChart(data, metrics) [Canvas: price line, regression, vector arrow]
    → renderCompass(metrics)          [Canvas: radial gauge needle]
    → renderMetrics(metrics)          [DOM: 3 metric blocks]
```

---

## UI Specifications

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0a0e17` | Page background |
| `--bg-card` | `#1a2235` | Card surfaces |
| `--accent-green` | `#00d4aa` | Bullish signals, positive values |
| `--accent-red` | `#ff4757` | Bearish signals, negative values |
| `--accent-purple` | `#7c3aed` | Regression line, intensity block accent |

### Layout (Desktop)

```
┌─────────────────────────────────────────────────────┐
│  Header: Logo + Badge                               │
├─────────────────────────────────────────────────────┤
│  Search Bar + Quick Chips                           │
├──────────────────────────────┬──────────────────────┤
│                              │  Compass Gauge       │
│  Price & Vector Chart        ├──────────────────────┤
│  (spans 2 rows)             │  Metrics Panel       │
│                              │  (3 blocks + copy)   │
└──────────────────────────────┴──────────────────────┘
```

---

## Acceptance Criteria

1. User can type "NVDA" and see autocomplete suggestions.
2. Clicking a chip immediately loads the analysis.
3. Chart displays price history with visible regression line and vector arrow pointing toward the future.
4. Compass needle reflects the computed angle; arc reflects intensity.
5. All 3 metric blocks display correct computed values.
6. "Copiar" button copies a well-formatted plain-text report.
7. Switching tickers replaces all visualizations instantly.
8. App works without internet (falls back to demo data).

---

## Future Enhancements (Out of Scope)

- Real-time WebSocket price streaming.
- Multi-ticker comparison mode.
- Configurable timeframes (7d, 14d, 60d, 90d).
- Backend API to avoid CORS proxy dependency.
- Export chart as PNG.
- Historical vector replay (animation over time).
- Alert system when intensity exceeds threshold.

---

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Vanilla JS (no framework) | Zero build step, instant load, no dependency risk. |
| Canvas for charts | Full control over rendering, smooth animations, no charting library overhead. |
| CORS proxy fallback chain | Maximizes chance of live data without a backend. |
| Synthetic demo data | Ensures app is always demonstrable regardless of network. |
| `requestAnimationFrame` for chart init | Guarantees DOM layout is computed before reading dimensions. |

---

*Document version: 1.0 — July 2025*
