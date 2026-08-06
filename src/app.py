#!/usr/bin/env python3
import json
import logging
import os
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

import fire
import numpy as np
import pandas as pd

from wallet import Wallet
from data_loader import keep_component_dates, load_market_data_or_download

LOOKBACK = 30
CASH = 100000.0
PROFIT_TAKE_THRESHOLD = 0.10
STOP_LOSS_THRESHOLD = -0.02
MAX_POSITION_PCT = 0.10
CASH_BUFFER_PCT = 0.05
TRADE_THRESHOLD_PCT = 0.0005
SIGNAL_THRESHOLD_PCT = 0.0
EPSILON = 1e-12
#COMPONENTS = [
#    "FDR", "COL", "MRL", "ELE", "MAP", "FER", "MTS", "TEF", "ACS",
#    "MEL", "ITX", "IBE", "ENG", "PHM", "SAN", "ACX", "CABK", "AMS",
#    "REP", "CLNX", "ANA", "BKT", "GRF", "AENA", "IAG", "BBVA", "SAB",
#]
COMPONENTS = ['A', 'AA', 'ABT', 'ACS.MC', 'ACX.MC', 'ADBE', 'ADI', 'ADP', 'AEE', 
'AEP', 'AES', 'AFL', 'AIG', 'AIR.PA', 'AIV', 'ALL', 'ALV.DE', 'AMAT', 'AMGN', 
'AMS.MC', 'AMZN', 'ANA.MC', 'ANET', 'APA', 'APD', 'APH', 'ARE', 'AVGO', 'AVY', 'AXP', 
'AZN.L', 'AZO', 'BA', 'BAS.    DE', 'BBBY', 'BBT', 'BBVA.MC', 'BDX', 'BEN', 'BIIB', 'BKNG', 
'BKT.MC', 'BLK', 'BMY', 'BNP.PA', 'BP.L', 'BSX', 'C', 'CABK.MC', 'CAG', 'CAH', 'CAT', 'CB', 
'CF', 'CHTR', 'CI', 'CINF', 'CL', 'CLNX.MC', 'CLX', 'CMCSA', 'CMG', 'COF', 'COL.MC', 
'COP', 'COST', 'CPB', 'CRM' , 'CSCO', 'CSX', 'CTAS', 'CTSH', 'CVS', 'CVX', 'D', 'DAL', 'DD', 
'DE', 'DG', 'DG.PA', 'DIS', 'DLR', 'DOV', 'DRI', 'DTE', 'DTE.DE', 'DUK', 'DVN', 'EBAY', 'ECL', 
'ED', 'EFX', 'EIX', 'EL', 'EL.PA', 'ELE.MC', 'EMN', 'EMR', 'ENG.MC', 'ENR.DE', 'ETN', 'ETR', 
'EXPD', 'F', 'FAST' , 'META', 'FDR.MC', 'FDX', 'FE', 'FER.MC', 'FIS', 'FLR', 'FLS', 'FMBH', 
'FMC', 'FOX', 'GD', 'GE', 'GILD', 'GIS', 'GLEN.L', 'GM', 'GOOG', 'GOOGL', 'GPN', 'GRF.MC', 'GS',
'GT', 'HAL', 'HAS', 'HBAN', 'HCA', 'HD', 'HIG', 'HOG', 'HON', 'HP', 'HPQ', 'HRB', 'HRL', 'HSBA.L', 
'HST', 'HUM', 'IAG.MC', 'IBE.MC', 'IBM', 'IFF', 'INTC', 'IP', 'IPGP', 'IQV', 'IR', 'ITW', 'ITX.MC', 
'IVZ', 'JBHT', 'JCI', 'JNJ', 'JPM', 'KEY', 'KHC', 'KMB', 'KMI', 'KMX', 'KO', 'KR', 'LB', 'LDOS', 'LEG', 
'LEN', 'LH', 'LLY', 'LMT', 'LNC', 'LOW', 'LRCX', 'LUV', 'LYB', 'M', 'MA', 'MAP.MC', 'MAR', 'MBG.DE', 
'MC.PA', 'MCD', 'MDLZ', 'MDT', 'MEL.MC', 'MET', 'MGM', 'MITK', 'MKC', 'MKTX', 'MLM', 'MMM', 'MNST', 
'MO', 'MOS', 'MPC', 'MRK', 'MRL.MC', 'MSFT', 'MSI', 'MTB', 'MTG', 'MTS.MC', 'MU', 'MUV2.DE', 'NCLH', 
'NDAQ', 'NEE', 'NEM', 'NFLX', 'NI', 'NKE', 'NOC', 'NOV', 'NYT', 'OKE', 'OR.PA', 'ORCL', 'OXY', 
'PAYX', 'PEP', 'PFE', 'PG', 'PH', 'PHM.MC', 'PLD', 'PM', 'PNC', 'PNW', 'PPG', 'PPL', 'PRU', 'QCOM', 'QRVO', 
'RCL', 'REGN', 'REL.L', 'REP.MC', 'RF', 'RHI', 'RIO.L', 'RMS.PA', 'ROK', 'ROP', 'ROST', 'RWE.DE', 'SAB.MC', 
'SAN.MC', 'SAN.PA', 'SAP.DE', 'SBUX', 'SE', 'SHEL.L', 'SHW', 'SIRI', 'SLB', 'SLG', 'SNA', 'SO', 'SPG', 'SPGI', 
'SRE', 'STI', 'STT', 'SU.PA', 'SWK', 'SYK', 'SYY', 'T', 'TAP', 'TDG', 'TEF.MC', 'TEL', 'TFX', 'TGT', 'THC', 'TJX', 
'TMUS', 'TRV', 'TSCO', 'TSLA', 'TTE.P    A', 'TXN', 'TXT', 'UDR', 'ULVR.L', 'UNH', 'UNP', 'UPS', 'URI', 'USB', 'VFC', 
'VIAV', 'VLO', 'VMC', 'VNO', 'VOD.L', 'VRSK', 'VRSN', 'VRTX', 'WDC', 'WEC', 'WFC', 'WHR', 'WMT', 'XEL', 'XOM', 'XYL', 
'YUM', 'ZBH', 'ZION']

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class StockVector:
    slope: float
    angle_degrees: float
    net_return: float
    volatility: float
    relative_volume: float
    intensity: float
    direction: str
    tradable: bool


@dataclass(frozen=True)
class StrategyParameters:
    signal_threshold_pct: float = SIGNAL_THRESHOLD_PCT
    lookback: int = LOOKBACK
    profit_take_threshold: float = PROFIT_TAKE_THRESHOLD
    stop_loss_threshold: float = STOP_LOSS_THRESHOLD
    max_position_pct: float = MAX_POSITION_PCT
    cash_buffer_pct: float = CASH_BUFFER_PCT
    trade_threshold_pct: float = TRADE_THRESHOLD_PCT

    def __post_init__(self):
        if not 0 <= self.signal_threshold_pct < 1:
            raise ValueError("signal_threshold_pct must be in [0, 1)")
        if self.lookback < 2:
            raise ValueError("lookback must be at least 2")
        if self.profit_take_threshold <= 0:
            raise ValueError("profit_take_threshold must be positive")
        if self.stop_loss_threshold >= 0:
            raise ValueError("stop_loss_threshold must be negative")
        if not 0 < self.max_position_pct <= 1:
            raise ValueError("max_position_pct must be in (0, 1]")
        if not 0 <= self.cash_buffer_pct < 1:
            raise ValueError("cash_buffer_pct must be in [0, 1)")
        if not 0 <= self.trade_threshold_pct < 1:
            raise ValueError("trade_threshold_pct must be in [0, 1)")


def load_strategy_parameters(path: str | Path) -> StrategyParameters:
    with open(path, encoding="utf-8") as source:
        payload = json.load(source)
    values = payload.get("best_params", payload)
    required = {
        "signal_threshold_pct", "lookback", "profit_take_threshold", "stop_loss_threshold",
        "max_position_pct", "cash_buffer_pct", "trade_threshold_pct",
    }
    missing = sorted(required.difference(values))
    if missing:
        raise ValueError(f"Missing strategy parameters: {', '.join(missing)}")
    return StrategyParameters(
        signal_threshold_pct=float(values["signal_threshold_pct"]),
        lookback=int(values["lookback"]),
        profit_take_threshold=float(values["profit_take_threshold"]),
        stop_loss_threshold=float(values["stop_loss_threshold"]),
        max_position_pct=float(values["max_position_pct"]),
        cash_buffer_pct=float(values["cash_buffer_pct"]),
        trade_threshold_pct=float(values["trade_threshold_pct"]),
    )


def calculate_stock_vector(
    window: pd.DataFrame, lookback: int = LOOKBACK, signal_threshold_pct: float = SIGNAL_THRESHOLD_PCT,
) -> StockVector:
    if len(window) != lookback:
        raise ValueError(f"Stock vector requires exactly {lookback} completed sessions")
    closes = pd.to_numeric(window["Close"], errors="coerce").to_numpy(dtype=float)
    volumes = pd.to_numeric(window["Volume"], errors="coerce").to_numpy(dtype=float)
    if (
        not np.all(np.isfinite(closes)) or not np.all(np.isfinite(volumes))
        or np.any(closes <= 0) or np.any(volumes < 0)
    ):
        return StockVector(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, "NEUTRAL", False)
    indexed_closes = closes / closes[0] * 100.0
    sessions = np.arange(1, lookback + 1, dtype=float)
    slope = float(np.polyfit(sessions, indexed_closes, 1)[0])
    angle = float(np.degrees(np.arctan(slope)))
    net_return = float((closes[-1] - closes[0]) / closes[0])
    daily_returns = np.diff(closes) / closes[:-1]
    volatility = float(np.std(daily_returns))
    mean_volume = float(np.mean(volumes))
    valid = (
        np.isfinite(slope) and np.isfinite(volatility) and volatility > EPSILON
        and np.isfinite(mean_volume) and mean_volume > EPSILON and volumes[-1] >= 0
    )
    if not valid:
        return StockVector(slope, angle, net_return, max(volatility, 0.0), 0.0, 0.0, "NEUTRAL", False)
    relative_volume = float(volumes[-1] / mean_volume)
    intensity = float(abs(net_return) * relative_volume / volatility)
    if not np.isfinite(intensity) or intensity <= 0 or abs(slope) <= EPSILON:
        return StockVector(slope, angle, net_return, volatility, relative_volume, 0.0, "NEUTRAL", False)
    if signal_threshold_pct <= EPSILON:
        direction = "BULLISH" if slope > 0 else "BEARISH"
        return StockVector(slope, angle, net_return, volatility, relative_volume, intensity, direction, True)
    if slope > 0 and net_return >= signal_threshold_pct:
        return StockVector(slope, angle, net_return, volatility, relative_volume, intensity, "BULLISH", True)
    if slope < 0 and net_return <= -signal_threshold_pct:
        return StockVector(slope, angle, net_return, volatility, relative_volume, intensity, "BEARISH", True)
    return StockVector(slope, angle, net_return, volatility, relative_volume, intensity, "NEUTRAL", False)


def load_market_data(path: str | Path) -> pd.DataFrame:
    data = pd.read_csv(path).rename(columns={"Volumen": "Volume", "Max": "High", "Min": "Low"})
    required = {"Ticker", "Date", "Open", "High", "Low", "Close", "Volume"}
    missing = sorted(required.difference(data.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    data["Date"] = pd.to_datetime(data["Date"].astype(str), errors="coerce")
    for column in ["Open", "High", "Low", "Close", "Volume"]:
        data[column] = pd.to_numeric(data[column], errors="coerce")
    data = data.dropna(subset=list(required)).sort_values(["Ticker", "Date"])
    return data.drop_duplicates(["Ticker", "Date"], keep="last").reset_index(drop=True)


def previous_window(
    data: pd.DataFrame, ticker: str, target_date: pd.Timestamp, lookback: int = LOOKBACK,
) -> pd.DataFrame:
    history = data[(data["Ticker"] == ticker) & (data["Date"] < target_date)]
    return history.tail(lookback)


def signals_for_date(
    data: pd.DataFrame, target_date: pd.Timestamp, params: StrategyParameters | None = None,
    log_details: bool = True,
) -> dict[str, StockVector]:
    params = params or StrategyParameters()
    signals = {}
    current_tickers = data.loc[data["Date"] == target_date, "Ticker"].unique()
    for ticker in current_tickers:
        window = previous_window(data, ticker, target_date, params.lookback)
        if len(window) < params.lookback:
            logging.debug("SKIP: %s insufficient prior history (%d/%d) FECHA: %s", ticker, len(window), params.lookback, target_date.date())
            continue
        vector = calculate_stock_vector(window, params.lookback, params.signal_threshold_pct)
        signals[ticker] = vector
        if log_details:
            logging.info(
                "VECTOR: %s direction=%s slope=%.6f angle=%.3f return=%.6f volatility=%.6f relative_volume=%.4f intensity=%.6f tradable=%s FECHA: %s",
                ticker, vector.direction, vector.slope, vector.angle_degrees, vector.net_return,
                vector.volatility, vector.relative_volume, vector.intensity, vector.tradable, target_date.date(),
            )
    return signals


def allocate_intensity_weights(
    signals: dict[str, StockVector], investable: float | None = None,
    max_position: float | None = None,
    params: StrategyParameters | None = None,
) -> dict[str, float]:
    params = params or StrategyParameters()
    investable = 1.0 - params.cash_buffer_pct if investable is None else investable
    max_position = params.max_position_pct if max_position is None else max_position
    active = {ticker: vector.intensity for ticker, vector in signals.items() if vector.tradable and vector.direction == "BULLISH" and vector.intensity > 0}
    weights = {ticker: 0.0 for ticker in active}
    remaining = set(active)
    remaining_exposure = investable
    while remaining and remaining_exposure > EPSILON:
        total_intensity = sum(active[ticker] for ticker in remaining)
        if total_intensity <= EPSILON:
            break
        capped = set()
        for ticker in remaining:
            proposed = remaining_exposure * active[ticker] / total_intensity
            capacity = max_position - weights[ticker]
            if proposed >= capacity:
                weights[ticker] += max(capacity, 0.0)
                capped.add(ticker)
        if not capped:
            for ticker in remaining:
                weights[ticker] += remaining_exposure * active[ticker] / total_intensity
            remaining_exposure = 0.0
        else:
            remaining_exposure = investable - sum(weights.values())
            remaining -= capped
    return weights


def trade_day(
    data: pd.DataFrame, target_date: pd.Timestamp, wallet: Wallet,
    params: StrategyParameters | None = None, log_details: bool = True,
) -> tuple[dict[str, float], dict[str, StockVector]]:
    params = params or StrategyParameters()
    rows = data[data["Date"] == target_date].drop_duplicates("Ticker", keep="last")
    open_prices = dict(zip(rows["Ticker"], rows["Open"]))
    signals = signals_for_date(data, target_date, params=params, log_details=log_details)
    total_value = wallet.get_total_value(open_prices)
    forced_sells = {}
    for stock in list(wallet.stocks):
        price = open_prices.get(stock.ticker)
        if price is None or price <= 0:
            continue
        profit_pct = (price - stock.average_price) / stock.average_price
        vector = signals.get(stock.ticker)
        if profit_pct >= params.profit_take_threshold:
            forced_sells[stock.ticker] = "PROFIT_TAKE"
        elif profit_pct <= params.stop_loss_threshold:
            forced_sells[stock.ticker] = "STOP_LOSS"
        elif vector and vector.tradable and vector.direction == "BEARISH":
            forced_sells[stock.ticker] = "BEARISH_VECTOR"
    eligible_signals = {ticker: vector for ticker, vector in signals.items() if ticker not in forced_sells}
    weights = allocate_intensity_weights(eligible_signals, params=params)
    sell_orders = []
    for stock in list(wallet.stocks):
        price = open_prices.get(stock.ticker, 0.0)
        if price <= 0:
            continue
        if stock.ticker in forced_sells:
            sell_orders.append((stock.ticker, stock.amount, price, forced_sells[stock.ticker]))
        elif stock.ticker in weights:
            target_value = total_value * weights[stock.ticker]
            excess = stock.amount * price - target_value
            if excess > total_value * params.trade_threshold_pct:
                amount = min(stock.amount, int(excess / price))
                if amount > 0:
                    sell_orders.append((stock.ticker, amount, price, "INTENSITY_REBALANCE"))
    for ticker, amount, price, reason in sell_orders:
        wallet.sell_stock(ticker, price, amount)
        if log_details:
            logging.info("SELL: %s x%d @ $%.2f REASON: %s FECHA: %s", ticker, amount, price, reason, target_date.date())
    total_value = wallet.get_total_value(open_prices)
    available_cash = max(wallet.cash - total_value * params.cash_buffer_pct, 0.0)
    buy_orders = []
    for ticker, target_weight in sorted(weights.items(), key=lambda item: signals[item[0]].intensity, reverse=True):
        price = open_prices.get(ticker, 0.0)
        if price <= 0:
            continue
        current_value = wallet.get_stock_amount(ticker) * price
        desired = max(total_value * target_weight - current_value, 0.0)
        if desired <= total_value * params.trade_threshold_pct:
            continue
        amount = int(min(desired, available_cash) / price)
        if amount > 0:
            buy_orders.append((ticker, amount, price))
            available_cash -= amount * price
    for ticker, amount, price in buy_orders:
        wallet.buy_stock(ticker, amount, price)
        if log_details:
            logging.info("BUY: %s x%d @ $%.2f ANGLE: %.3f INTENSITY: %.6f FECHA: %s", ticker, amount, price, signals[ticker].angle_degrees, signals[ticker].intensity, target_date.date())
    if log_details:
        logging.info("DAILY: Sells=%d Buys=%d Cash=$%.2f FECHA: %s", len(sell_orders), len(buy_orders), wallet.cash, target_date.date())
    return open_prices, signals


def calculate_metrics(equity: pd.Series) -> dict[str, float]:
    values = equity.astype(float).to_numpy()
    if len(values) == 0:
        return {"total_return": 0.0, "sharpe": 0.0, "max_drawdown": 0.0}
    returns = pd.Series(values).pct_change().dropna().to_numpy()
    sharpe = float(np.sqrt(252) * np.mean(returns) / np.std(returns)) if len(returns) > 1 and np.std(returns) > EPSILON else 0.0
    peaks = np.maximum.accumulate(values)
    drawdowns = values / peaks - 1.0
    return {"total_return": float(values[-1] / values[0] - 1.0), "sharpe": sharpe, "max_drawdown": float(np.min(drawdowns))}


def passive_equity(data: pd.DataFrame, dates: list[pd.Timestamp], initial_cash: float) -> pd.Series:
    if not dates:
        return pd.Series(dtype=float)
    first = data[data["Date"] == dates[0]].drop_duplicates("Ticker").set_index("Ticker")
    initial = first["Open"][first["Open"] > 0]
    values = []
    for date in dates:
        available = data[data["Date"] <= date].sort_values("Date").drop_duplicates("Ticker", keep="last").set_index("Ticker")
        common = initial.index.intersection(available.index)
        values.append(initial_cash * float((available.loc[common, "Close"] / initial.loc[common]).mean()))
    return pd.Series(values, index=dates, dtype=float)


def run_backtest(
    data: pd.DataFrame, dates: list[pd.Timestamp], cash: float,
    params: StrategyParameters, report: bool = False,
) -> dict:
    wallet = Wallet(float(cash), [], [])
    strategy_values = []
    executed_dates = []
    for target_date in dates:
        if report:
            logging.info("FECHA: %s", target_date.strftime("%Y%m%d"))
        trade_day(data, target_date, wallet, params=params, log_details=report)
        close_rows = data[data["Date"] == target_date].drop_duplicates("Ticker", keep="last")
        close_prices = dict(zip(close_rows["Ticker"], close_rows["Close"]))
        strategy_values.append(wallet.get_total_value(close_prices))
        executed_dates.append(target_date)
    strategy_equity = pd.Series(strategy_values, index=executed_dates, dtype=float)
    baseline_equity = passive_equity(data, executed_dates, float(cash))
    strategy_metrics = calculate_metrics(pd.concat([pd.Series([float(cash)]), strategy_equity], ignore_index=True))
    baseline_metrics = calculate_metrics(pd.concat([pd.Series([float(cash)]), baseline_equity], ignore_index=True))
    final_prices = {}
    if executed_dates:
        final_rows = data[data["Date"] <= executed_dates[-1]].sort_values("Date").drop_duplicates("Ticker", keep="last")
        final_prices = dict(zip(final_rows["Ticker"], final_rows["Close"]))
    if report:
        wallet.status(current_prices=final_prices, initial_cash=float(cash))
        logging.info("BENCHMARK STRATEGY: Return=%+.2f%% Sharpe=%.4f MaxDrawdown=%.2f%%", strategy_metrics["total_return"] * 100, strategy_metrics["sharpe"], strategy_metrics["max_drawdown"] * 100)
        logging.info("BENCHMARK BUY_HOLD: Return=%+.2f%% Sharpe=%.4f MaxDrawdown=%.2f%%", baseline_metrics["total_return"] * 100, baseline_metrics["sharpe"], baseline_metrics["max_drawdown"] * 100)
    return {"strategy": strategy_metrics, "buy_hold": baseline_metrics, "days": len(executed_dates), "final_value": wallet.get_total_value(final_prices)}


def experiment(
    file_data=None,
    cash=CASH,
    max_days=None,
    params_file=None,
    year=None,
    signal_threshold_pct=SIGNAL_THRESHOLD_PCT,
    lookback=LOOKBACK,
    profit_take_threshold=PROFIT_TAKE_THRESHOLD,
    stop_loss_threshold=STOP_LOSS_THRESHOLD,
    max_position_pct=MAX_POSITION_PCT,
    cash_buffer_pct=CASH_BUFFER_PCT,
    trade_threshold_pct=TRADE_THRESHOLD_PCT,
):
    data, used_year = load_market_data_or_download(file_data, COMPONENTS, year=year)
    data, dates = keep_component_dates(data, COMPONENTS, evaluation_start=f"{used_year}-01-01")
    if not dates:
        raise ValueError("No trading dates available for the selected components/year")
    if max_days is not None:
        dates = dates[: int(max_days)]
    if params_file:
        params = load_strategy_parameters(params_file)
        logging.info("Loaded strategy parameters from %s", params_file)
    else:
        params = StrategyParameters(
            signal_threshold_pct=float(signal_threshold_pct),
            lookback=int(lookback),
            profit_take_threshold=float(profit_take_threshold),
            stop_loss_threshold=float(stop_loss_threshold),
            max_position_pct=float(max_position_pct),
            cash_buffer_pct=float(cash_buffer_pct),
            trade_threshold_pct=float(trade_threshold_pct),
        )
    result = run_backtest(data, dates, float(cash), params, report=True)
    logging.info(
        "Parameters: year=%s Cash=$%.2f SignalThreshold=%.3f Lookback=%d ProfitTake=%.3f StopLoss=%.3f MaxPosition=%.3f CashBuffer=%.3f TradeThreshold=%.4f",
        used_year, cash, params.signal_threshold_pct, params.lookback, params.profit_take_threshold,
        params.stop_loss_threshold, params.max_position_pct, params.cash_buffer_pct, params.trade_threshold_pct,
    )
    result["year"] = used_year
    result["best_params"] = asdict(params)
    return result


if __name__ == "__main__":
    os.makedirs("logs", exist_ok=True)
    logging.basicConfig(
        handlers=[logging.FileHandler(f"logs/experiment_{datetime.now():%Y-%m-%d_%H:%M:%S}.log"), logging.StreamHandler()],
        encoding="utf-8", format="%(asctime)s: %(message)s", level=logging.INFO,
    )
    fire.Fire(experiment)
