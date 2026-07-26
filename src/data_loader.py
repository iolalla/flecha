"""Yahoo Finance data loader for the Flecha strategy components.

Provides helpers to download historical OHLCV data for the IBEX components used
by the strategy, and to convert it to the DataFrame format expected by
`app.py` and `hp_search.py`.
"""

from __future__ import annotations

import logging
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Sequence

import pandas as pd
import yfinance as yf


# Madrid exchange suffix used by Yahoo Finance for the Spanish components.
YFINANCE_SUFFIX = ".MC"

# Default cache directory inside `src/` so downloaded CSVs are easy to inspect.
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent / "data"


def ticker_yahoo_symbol(ticker: str, suffix: str = YFINANCE_SUFFIX) -> str:
    """Return the Yahoo Finance symbol for a component ticker."""
    if ticker.endswith(suffix):
        return ticker
    return f"{ticker}{suffix}"


def pick_random_year(min_year: int = 2000, max_year: int = 2025) -> int:
    """Pick a random year in the inclusive range [min_year, max_year]."""
    return random.randint(int(min_year), int(max_year))


def year_date_range(year: int) -> tuple[date, date]:
    """Return a download window that covers the full year plus prior history.

    The start date is set to the beginning of the previous year so that long
    lookbacks (up to 90 sessions) are fully available from the first trading
    day of the chosen year. The end date covers the full selected year plus an
    extra tail into the following year for validation/forward testing.
    """
    start = date(int(year) - 1, 1, 1)
    end = date(int(year) + 1, 12, 31)
    return start, end


def _download_ticker(ticker: str, start: date, end: date) -> pd.DataFrame | None:
    """Download daily OHLCV for a single Yahoo Finance symbol."""
    symbol = ticker_yahoo_symbol(ticker)
    try:
        df = yf.download(
            symbol,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=False,
            actions=False,
        )
    except Exception as exc:  # pragma: no cover - network dependent
        logging.warning("Failed to download %s: %s", symbol, exc)
        return None

    if df is None or df.empty:
        logging.warning("No data returned for %s", symbol)
        return None

    # yfinance multi-index columns are flattened to single level for easier access.
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    required = {"Open", "High", "Low", "Close", "Volume"}
    missing = required.difference(df.columns)
    if missing:
        logging.warning("%s missing columns: %s", symbol, missing)
        return None

    df = df.reset_index()
    # Accept either the standard yfinance Date column or a named datetime index.
    date_col = "Date" if "Date" in df.columns else df.columns[0]
    df = df[[date_col, "Open", "High", "Low", "Close", "Volume"]].copy()
    df.rename(columns={date_col: "Date"}, inplace=True)
    df["Ticker"] = ticker
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    for column in ["Open", "High", "Low", "Close", "Volume"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    return df.dropna(subset=["Date", "Open", "High", "Low", "Close", "Volume"])


def download_components(
    components: Sequence[str],
    year: int | None = None,
    cache_dir: str | Path | None = DEFAULT_CACHE_DIR,
    min_sessions: int = 10,
) -> tuple[pd.DataFrame, int]:
    """Download daily data for *components* and return a single tidy DataFrame.

    Parameters
    ----------
    components:
        Ticker symbols to download (e.g. the COMPONENTS list in `app.py`).
    year:
        Calendar year to download. When ``None`` a random year between 2000 and
        2025 is chosen.
    cache_dir:
        If provided, the resulting DataFrame is persisted as a CSV here.
    min_sessions:
        Tickers with fewer than this many sessions are skipped.

    Returns
    -------
    A tuple of ``(data, year)`` where ``data`` has columns
    ``Ticker, Date, Open, High, Low, Close, Volume`` and is sorted by ticker
    and date.
    """
    chosen_year = year if year is not None else pick_random_year()
    start, end = year_date_range(chosen_year)
    logging.info("Downloading Yahoo Finance data for year=%d (%s to %s)", chosen_year, start, end)

    frames: list[pd.DataFrame] = []
    for ticker in components:
        df = _download_ticker(ticker, start, end)
        if df is None or len(df) < min_sessions:
            if df is not None:
                logging.warning("Skipping %s: only %d sessions available", ticker, len(df))
            continue
        frames.append(df)

    if not frames:
        raise ValueError(f"No valid data downloaded for any component in year {chosen_year}")

    data = pd.concat(frames, ignore_index=True)
    data = data.sort_values(["Ticker", "Date"]).drop_duplicates(["Ticker", "Date"], keep="last")
    data = data.reset_index(drop=True)

    if cache_dir is not None:
        cache_path = Path(cache_dir)
        cache_path.mkdir(parents=True, exist_ok=True)
        csv_path = cache_path / f"yf-components-{chosen_year}.csv"
        data.to_csv(csv_path, index=False)
        logging.info("Cached component data to %s", csv_path)

    return data, chosen_year


def load_market_data_or_download(
    file_data: str | Path | None,
    components: Sequence[str],
    year: int | None = None,
    cache_dir: str | Path | None = DEFAULT_CACHE_DIR,
) -> tuple[pd.DataFrame, int]:
    """Load from CSV when provided, otherwise download from Yahoo Finance."""
    if file_data is not None and str(file_data).lower() not in {"none", "download", ""}:
        from app import load_market_data

        data = load_market_data(file_data)
        logging.info("Loaded market data from %s", file_data)
        return data, year or pick_random_year()

    return download_components(components, year=year, cache_dir=cache_dir)


def keep_component_dates(data: pd.DataFrame, components: Sequence[str]) -> tuple[pd.DataFrame, list[pd.Timestamp]]:
    """Restrict *data* to *components* and return the sorted unique trading dates."""
    filtered = data[data["Ticker"].isin(components)].drop_duplicates(["Ticker", "Date"], keep="last")
    filtered = filtered.sort_values(["Ticker", "Date"]).reset_index(drop=True)
    dates = sorted(pd.Timestamp(d) for d in filtered["Date"].unique())
    return filtered, dates
