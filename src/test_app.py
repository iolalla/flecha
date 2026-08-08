import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from app import (
    LOOKBACK,
    StockVector,
    StrategyParameters,
    allocate_intensity_weights,
    calculate_stock_vector,
    load_strategy_parameters,
    previous_window,
    signals_for_date,
    trade_day,
    trend_direction,
)
from wallet import Stock, Wallet


def make_window(closes, volumes=None):
    if volumes is None:
        volumes = np.arange(100, 100 + LOOKBACK, dtype=float)
    return pd.DataFrame({"Close": closes, "Volume": volumes})


def vector(direction, intensity):
    slope = 1.0 if direction == "BULLISH" else -1.0
    return StockVector(slope, 45.0, 0.1, 0.01, 1.0, intensity, direction, True)


class StockVectorTests(unittest.TestCase):
    def test_bullish_indexed_angle_and_intensity(self):
        closes = np.linspace(50.0, 79.0, LOOKBACK)
        volumes = np.full(LOOKBACK, 100.0)
        result = calculate_stock_vector(make_window(closes, volumes))
        indexed = closes / closes[0] * 100.0
        expected_slope = np.polyfit(np.arange(1, 31), indexed, 1)[0]
        expected_volatility = np.std(np.diff(closes) / closes[:-1])
        self.assertEqual(result.direction, "BULLISH")
        self.assertTrue(result.tradable)
        self.assertAlmostEqual(result.slope, expected_slope)
        self.assertAlmostEqual(result.angle_degrees, np.degrees(np.arctan(expected_slope)))
        self.assertAlmostEqual(result.intensity, abs((79.0 - 50.0) / 50.0) / expected_volatility)

    def test_bearish_vector(self):
        result = calculate_stock_vector(make_window(np.linspace(100.0, 70.0, LOOKBACK)))
        self.assertEqual(result.direction, "BEARISH")
        self.assertLess(result.angle_degrees, 0)
        self.assertGreater(result.intensity, 0)

    def test_zero_volatility_is_neutral_and_finite(self):
        result = calculate_stock_vector(make_window(np.full(LOOKBACK, 25.0)))
        self.assertEqual(result.direction, "NEUTRAL")
        self.assertFalse(result.tradable)
        self.assertEqual(result.intensity, 0.0)
        self.assertTrue(np.isfinite(result.intensity))

    def test_zero_mean_volume_is_neutral(self):
        result = calculate_stock_vector(make_window(np.linspace(10.0, 20.0, LOOKBACK), np.zeros(LOOKBACK)))
        self.assertEqual(result.direction, "NEUTRAL")
        self.assertFalse(result.tradable)

    def test_requires_exact_window(self):
        with self.assertRaises(ValueError):
            calculate_stock_vector(make_window(np.arange(LOOKBACK - 1, dtype=float)))

    def test_signal_threshold_is_symmetric_for_buy_and_sell(self):
        bullish = make_window([100.0, 101.0, 100.5, 102.0, 103.0], [100, 110, 90, 120, 105])
        bearish = make_window([100.0, 99.0, 99.5, 98.0, 97.0], [100, 110, 90, 120, 105])
        self.assertEqual(calculate_stock_vector(bullish, 5, 0.02).direction, "BULLISH")
        self.assertEqual(calculate_stock_vector(bearish, 5, 0.02).direction, "BEARISH")
        self.assertEqual(calculate_stock_vector(bullish, 5, 0.05).direction, "NEUTRAL")
        self.assertEqual(calculate_stock_vector(bearish, 5, 0.05).direction, "NEUTRAL")


class TrendDirectionTests(unittest.TestCase):
    def test_uptrend_window_is_bullish(self):
        window = pd.DataFrame({"Close": np.linspace(10.0, 20.0, 30)})
        self.assertEqual(trend_direction(window), "BULLISH")

    def test_downtrend_window_is_bearish(self):
        window = pd.DataFrame({"Close": np.linspace(20.0, 10.0, 30)})
        self.assertEqual(trend_direction(window), "BEARISH")

    def test_flat_window_is_neutral(self):
        window = pd.DataFrame({"Close": np.full(30, 15.0)})
        self.assertEqual(trend_direction(window), "NEUTRAL")


class SignalsForDateTrendFilterTests(unittest.TestCase):
    @staticmethod
    def build_data(short_closes, trend_closes):
        trend_dates = pd.date_range("2021-01-01", periods=len(trend_closes), freq="D")
        target_date = trend_dates[-1] + pd.Timedelta(days=1)
        history = pd.DataFrame({
            "Ticker": "AAA", "Date": trend_dates, "Close": trend_closes,
            "Open": trend_closes, "High": trend_closes, "Low": trend_closes,
            "Volume": np.arange(100.0, 100.0 + len(trend_closes)),
        })
        history.loc[history.index[-len(short_closes):], "Close"] = short_closes
        current = pd.DataFrame({
            "Ticker": ["AAA"], "Date": [target_date], "Close": [short_closes[-1]],
            "Open": [short_closes[-1]], "High": [short_closes[-1]], "Low": [short_closes[-1]], "Volume": [100.0],
        })
        return pd.concat([history, current], ignore_index=True), target_date

    def test_bullish_short_signal_blocked_by_bearish_mid_term_trend(self):
        trend_closes = np.linspace(100.0, 70.0, 60)
        short_closes = np.linspace(70.0, 80.0, 5)
        data, target_date = self.build_data(short_closes, trend_closes)
        params = StrategyParameters(lookback=5, trend_lookback=60)

        signals = signals_for_date(data, target_date, params=params, log_details=False)

        self.assertEqual(signals["AAA"].direction, "BULLISH")
        self.assertFalse(signals["AAA"].tradable)

    def test_bullish_short_signal_confirmed_by_bullish_mid_term_trend(self):
        trend_closes = np.linspace(70.0, 100.0, 60)
        short_closes = np.linspace(95.0, 105.0, 5)
        data, target_date = self.build_data(short_closes, trend_closes)
        params = StrategyParameters(lookback=5, trend_lookback=60)

        signals = signals_for_date(data, target_date, params=params, log_details=False)

        self.assertEqual(signals["AAA"].direction, "BULLISH")
        self.assertTrue(signals["AAA"].tradable)

    def test_filter_disabled_when_trend_lookback_not_greater_than_lookback(self):
        trend_closes = np.linspace(100.0, 70.0, 60)
        short_closes = np.linspace(70.0, 80.0, 5)
        data, target_date = self.build_data(short_closes, trend_closes)
        params = StrategyParameters(lookback=5, trend_lookback=5)

        signals = signals_for_date(data, target_date, params=params, log_details=False)

        self.assertTrue(signals["AAA"].tradable)


class StrategyParameterTests(unittest.TestCase):
    def test_loads_hp_summary_json(self):
        values = {
            "signal_threshold_pct": 0.03, "lookback": 60,
            "profit_take_threshold": 0.15, "stop_loss_threshold": -0.04,
            "max_position_pct": 0.25, "cash_buffer_pct": 0.08,
            "trade_threshold_pct": 0.0025,
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "best_params.json"
            path.write_text(json.dumps({"best_score": 1.2, "best_params": values}), encoding="utf-8")
            params = load_strategy_parameters(path)
        self.assertEqual(params.signal_threshold_pct, 0.03)
        self.assertEqual(params.lookback, 60)
        self.assertEqual(params.max_position_pct, 0.25)
        self.assertEqual(params.trend_lookback, 0)

    def test_loads_trend_lookback_when_present(self):
        values = {
            "signal_threshold_pct": 0.03, "lookback": 30,
            "profit_take_threshold": 0.15, "stop_loss_threshold": -0.04,
            "max_position_pct": 0.25, "cash_buffer_pct": 0.08,
            "trade_threshold_pct": 0.0025, "trend_lookback": 90,
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "best_params.json"
            path.write_text(json.dumps({"best_params": values}), encoding="utf-8")
            params = load_strategy_parameters(path)
        self.assertEqual(params.trend_lookback, 90)

    def test_rejects_incomplete_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "params.json"
            path.write_text(json.dumps({"lookback": 30}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Missing strategy parameters"):
                load_strategy_parameters(path)


class DataAndAllocationTests(unittest.TestCase):
    def test_previous_window_excludes_target_session(self):
        dates = pd.date_range("2021-01-01", periods=32, freq="D")
        data = pd.DataFrame({
            "Ticker": "AAA", "Date": dates, "Close": np.arange(32.0),
            "Volume": 100.0, "Open": np.arange(32.0), "High": np.arange(32.0), "Low": np.arange(32.0),
        })
        result = previous_window(data, "AAA", dates[30])
        self.assertEqual(len(result), LOOKBACK)
        self.assertLess(result["Date"].max(), dates[30])
        self.assertEqual(result["Close"].iloc[-1], 29.0)

    def test_previous_window_uses_configurable_lookback(self):
        dates = pd.date_range("2021-01-01", periods=11, freq="D")
        data = pd.DataFrame({"Ticker": "AAA", "Date": dates, "Close": np.arange(11.0)})
        result = previous_window(data, "AAA", dates[10], lookback=5)
        self.assertEqual(result["Close"].tolist(), [5.0, 6.0, 7.0, 8.0, 9.0])

    def test_intensity_allocation_redistributes_and_caps(self):
        signals = {
            "AAA": vector("BULLISH", 8.0),
            "BBB": vector("BULLISH", 1.0),
            "CCC": vector("BULLISH", 1.0),
            "DDD": vector("BEARISH", 100.0),
        }
        params = StrategyParameters(max_position_pct=0.30, cash_buffer_pct=0.10)
        weights = allocate_intensity_weights(signals, params=params)
        self.assertEqual(set(weights), {"AAA", "BBB", "CCC"})
        self.assertAlmostEqual(weights["AAA"], 0.30)
        self.assertAlmostEqual(weights["BBB"], 0.30)
        self.assertAlmostEqual(weights["CCC"], 0.30)
        self.assertLessEqual(max(weights.values()), 0.30)


class TradingTests(unittest.TestCase):
    @staticmethod
    def market(closes, current_open):
        dates = pd.date_range("2021-01-01", periods=31, freq="D")
        prior = pd.DataFrame({
            "Ticker": "AAA", "Date": dates[:30], "Open": closes,
            "High": closes, "Low": closes, "Close": closes, "Volume": np.arange(100.0, 130.0),
        })
        current = pd.DataFrame({
            "Ticker": ["AAA"], "Date": [dates[30]], "Open": [current_open],
            "High": [current_open * 3], "Low": [current_open / 2],
            "Close": [current_open * 2], "Volume": [999999.0],
        })
        return pd.concat([prior, current], ignore_index=True), dates[30]

    def test_bullish_purchase_executes_at_current_open(self):
        data, target_date = self.market(np.linspace(10.0, 20.0, 30), 50.0)
        wallet = Wallet(100000.0, [], [])
        trade_day(data, target_date, wallet)
        holding = wallet.get_stock("AAA")
        self.assertNotEqual(holding, "")
        self.assertEqual(holding.average_price, 50.0)
        self.assertEqual(holding.amount, 200)

    def test_bearish_signal_liquidates_entire_holding(self):
        data, target_date = self.market(np.linspace(100.0, 70.0, 30), 90.0)
        wallet = Wallet(91000.0, [Stock("AAA", 100, 80.0)], [])
        trade_day(data, target_date, wallet)
        self.assertEqual(wallet.get_stock_amount("AAA"), 0)
        self.assertEqual(wallet.cash, 100000.0)
        self.assertEqual(len(wallet.historical_orders), 1)

    def test_profit_take_is_not_repurchased_on_bullish_signal(self):
        data, target_date = self.market(np.linspace(10.0, 20.0, 30), 50.0)
        wallet = Wallet(95000.0, [Stock("AAA", 100, 40.0)], [])
        trade_day(data, target_date, wallet)
        self.assertEqual(wallet.get_stock_amount("AAA"), 0)
        self.assertEqual(wallet.cash, 100000.0)
        self.assertEqual(len(wallet.historical_orders), 1)


if __name__ == "__main__":
    unittest.main()
