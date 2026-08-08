import sys
import unittest
from pathlib import Path

import optuna
import pandas as pd

from hp_search import (
    CASH_BUFFER_MAX,
    CASH_BUFFER_MIN,
    LOOKBACK_VALUES,
    MAX_POSITION_MAX,
    MAX_POSITION_MIN,
    PROFIT_TAKE_VALUES,
    SIGNAL_THRESHOLD_VALUES,
    STOP_LOSS_MAX,
    STOP_LOSS_MIN,
    TRADE_THRESHOLD_MAX,
    TRADE_THRESHOLD_MIN,
    TREND_LOOKBACK_VALUES,
    chronological_split,
    objective_value,
    parse_years,
    suggest_parameters,
)


class HyperparameterSpaceTests(unittest.TestCase):
    def test_ranges_match_requested_bounds(self):
        self.assertEqual(SIGNAL_THRESHOLD_VALUES, [0.00, 0.01, 0.02, 0.03, 0.04, 0.05, 0.10])
        self.assertEqual(LOOKBACK_VALUES, [5, 10, 20, 30, 60, 90])
        self.assertEqual(PROFIT_TAKE_VALUES, [0.05, 0.10, 0.15, 0.20])
        self.assertEqual((STOP_LOSS_MIN, STOP_LOSS_MAX), (-0.10, -0.01))
        self.assertEqual((MAX_POSITION_MIN, MAX_POSITION_MAX), (0.05, 0.50))
        self.assertEqual((CASH_BUFFER_MIN, CASH_BUFFER_MAX), (0.00, 0.15))
        self.assertEqual((TRADE_THRESHOLD_MIN, TRADE_THRESHOLD_MAX), (0.00, 0.01))
        self.assertEqual(TREND_LOOKBACK_VALUES, [0, 30, 60, 90])

    def test_fixed_trial_builds_strategy_parameters(self):
        trial = optuna.trial.FixedTrial({
            "signal_threshold_pct": 0.03,
            "lookback": 60,
            "profit_take_threshold": 0.15,
            "stop_loss_threshold": -0.04,
            "max_position_pct": 0.25,
            "cash_buffer_pct": 0.08,
            "trade_threshold_pct": 0.0025,
            "trend_lookback": 90,
        })
        params = suggest_parameters(trial)
        self.assertEqual(params.signal_threshold_pct, 0.03)
        self.assertEqual(params.lookback, 60)
        self.assertEqual(params.profit_take_threshold, 0.15)
        self.assertEqual(params.stop_loss_threshold, -0.04)
        self.assertEqual(params.max_position_pct, 0.25)
        self.assertEqual(params.cash_buffer_pct, 0.08)
        self.assertEqual(params.trade_threshold_pct, 0.0025)
        self.assertEqual(params.trend_lookback, 90)


class SearchEvaluationTests(unittest.TestCase):
    def test_chronological_split_has_no_overlap(self):
        dates = list(pd.date_range("2022-01-01", periods=10, freq="D"))
        tune, validation = chronological_split(dates, 0.30)
        self.assertEqual(len(tune), 7)
        self.assertEqual(len(validation), 3)
        self.assertLess(tune[-1], validation[0])
        self.assertEqual(tune + validation, dates)

    def test_objective_metrics(self):
        metrics = {"total_return": 0.20, "sharpe": 1.5, "max_drawdown": -0.10}
        self.assertEqual(objective_value(metrics, "return"), 0.20)
        self.assertEqual(objective_value(metrics, "sharpe"), 1.5)
        self.assertEqual(objective_value(metrics, "calmar"), 2.0)
        with self.assertRaises(ValueError):
            objective_value(metrics, "unknown")

    def test_invalid_validation_fraction_fails(self):
        dates = list(pd.date_range("2022-01-01", periods=10, freq="D"))
        with self.assertRaises(ValueError):
            chronological_split(dates, 0.0)
        with self.assertRaises(ValueError):
            chronological_split(dates, 1.0)

    def test_parse_years_accepts_comma_separated_string(self):
        self.assertEqual(parse_years("2019,2021,2023"), [2019, 2021, 2023])

    def test_parse_years_accepts_list_or_none(self):
        self.assertEqual(parse_years([2019, 2021]), [2019, 2021])
        self.assertIsNone(parse_years(None))

    def test_parse_years_rejects_empty_string(self):
        with self.assertRaises(ValueError):
            parse_years("")


if __name__ == "__main__":
    unittest.main()
