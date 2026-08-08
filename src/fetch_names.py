#!/usr/bin/env python3
"""Script to fetch ticker names from Yahoo Finance and save to web/tickers.json."""

import json
from pathlib import Path
import concurrent.futures
import yfinance as yf

# Import COMPONENTS from app.py (which is in the same directory)
from app import COMPONENTS

def clean_ticker(ticker):
    return "".join(ticker.split()).upper()

# Clean and unique tickers
tickers = sorted(list(set(clean_ticker(t) for t in COMPONENTS)))

def get_ticker_info(ticker):
    try:
        t = yf.Ticker(ticker)
        info = t.info
        name = info.get("longName") or info.get("shortName") or ticker
        exchange = info.get("exchange") or "N/D"
        currency = info.get("currency") or "N/D"
        print(f"Fetched {ticker}: {name}")
        return {"code": ticker, "name": name, "exchange": exchange, "currency": currency}
    except Exception as e:
        print(f"Failed {ticker}: {e}")
        return {"code": ticker, "name": ticker, "exchange": "N/D", "currency": "N/D"}

def main():
    print(f"Fetching names for {len(tickers)} tickers...")
    results = []
    # Use ThreadPoolExecutor to fetch in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_ticker = {executor.submit(get_ticker_info, ticker): ticker for ticker in tickers}
        for future in concurrent.futures.as_completed(future_to_ticker):
            results.append(future.result())
            
    # Sort results by code
    results.sort(key=lambda x: x["code"])
    
    # Path to web/tickers.json relative to this script
    output_path = Path(__file__).resolve().parent.parent / "web" / "tickers.json"
    
    # Ensure the parent directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(results)} tickers to {output_path}")

if __name__ == "__main__":
    main()
