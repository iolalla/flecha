#!/usr/bin/env python3
import json
import logging
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

import fire
import optuna
import pandas as pd

from app import CASH, COMPONENTS, StrategyParameters, run_backtest
from data_loader import keep_component_dates, load_market_data_or_download

SIGNAL_THRESHOLD_VALUES = [0.00, 0.01, 0.02, 0.03, 0.04, 0.05, 0.10]
LOOKBACK_VALUES = [5, 10, 20, 30, 60, 90]
TREND_LOOKBACK_VALUES = [0, 30, 60, 90]
PROFIT_TAKE_VALUES = [0.05, 0.10, 0.15, 0.20]
STOP_LOSS_MIN = -0.10
STOP_LOSS_MAX = -0.01
STOP_LOSS_STEP = 0.01
MAX_POSITION_MIN = 0.05
MAX_POSITION_MAX = 0.50
MAX_POSITION_STEP = 0.05
CASH_BUFFER_MIN = 0.00
CASH_BUFFER_MAX = 0.15
CASH_BUFFER_STEP = 0.01
TRADE_THRESHOLD_MIN = 0.00
TRADE_THRESHOLD_MAX = 0.01
TRADE_THRESHOLD_STEP = 0.0005


def parameters_from_mapping(values: dict) -> StrategyParameters:
    return StrategyParameters(
        signal_threshold_pct=round(float(values["signal_threshold_pct"]), 2),
        lookback=int(values["lookback"]),
        profit_take_threshold=round(float(values["profit_take_threshold"]), 2),
        stop_loss_threshold=round(float(values["stop_loss_threshold"]), 2),
        max_position_pct=round(float(values["max_position_pct"]), 2),
        cash_buffer_pct=round(float(values["cash_buffer_pct"]), 2),
        trade_threshold_pct=round(float(values["trade_threshold_pct"]), 4),
        trend_lookback=int(values.get("trend_lookback", 0)),
    )


def suggest_parameters(trial: optuna.Trial) -> StrategyParameters:
    values = {
        "signal_threshold_pct": trial.suggest_categorical("signal_threshold_pct", SIGNAL_THRESHOLD_VALUES),
        "lookback": trial.suggest_categorical("lookback", LOOKBACK_VALUES),
        "profit_take_threshold": trial.suggest_categorical("profit_take_threshold", PROFIT_TAKE_VALUES),
        "stop_loss_threshold": trial.suggest_float("stop_loss_threshold", STOP_LOSS_MIN, STOP_LOSS_MAX, step=STOP_LOSS_STEP),
        "max_position_pct": trial.suggest_float("max_position_pct", MAX_POSITION_MIN, MAX_POSITION_MAX, step=MAX_POSITION_STEP),
        "cash_buffer_pct": trial.suggest_float("cash_buffer_pct", CASH_BUFFER_MIN, CASH_BUFFER_MAX, step=CASH_BUFFER_STEP),
        "trade_threshold_pct": trial.suggest_float("trade_threshold_pct", TRADE_THRESHOLD_MIN, TRADE_THRESHOLD_MAX, step=TRADE_THRESHOLD_STEP),
        "trend_lookback": trial.suggest_categorical("trend_lookback", TREND_LOOKBACK_VALUES),
    }
    return parameters_from_mapping(values)


def quiet_backtest(data, dates, cash, params):
    previous_level = logging.root.manager.disable
    logging.disable(logging.INFO)
    try:
        return run_backtest(data, dates, cash, params, report=False)
    finally:
        logging.disable(previous_level)


def objective_value(metrics: dict[str, float], objective: str) -> float:
    if objective == "return":
        return float(metrics["total_return"])
    if objective == "sharpe":
        return float(metrics["sharpe"])
    if objective == "calmar":
        drawdown = abs(float(metrics["max_drawdown"]))
        return float(metrics["total_return"] / drawdown) if drawdown > 1e-12 else float(metrics["total_return"])
    raise ValueError("objective must be one of: return, sharpe, calmar")


def chronological_split(dates: list[pd.Timestamp], validation_fraction: float) -> tuple[list[pd.Timestamp], list[pd.Timestamp]]:
    if not 0 < validation_fraction < 1:
        raise ValueError("validation_fraction must be in (0, 1)")
    if len(dates) < 2:
        raise ValueError("At least two evaluation dates are required")
    split_index = min(max(int(len(dates) * (1.0 - validation_fraction)), 1), len(dates) - 1)
    return dates[:split_index], dates[split_index:]


def prepare_data(file1: str | None = None, year: int | None = None) -> tuple[pd.DataFrame, list[pd.Timestamp], int]:
    data, used_year = load_market_data_or_download(file1, COMPONENTS, year=year)
    data, dates = keep_component_dates(data, COMPONENTS, evaluation_start=f"{used_year}-01-01")
    if not dates:
        raise ValueError("No trading dates available for the selected components/year")
    return data, dates, used_year


def search(
    file1=None,
    cash=CASH,
    n_trials=100,
    validation_fraction=0.30,
    objective="return",
    seed=42,
    max_days=None,
    year=None,
    output_dir="logs/hp_search",
):
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    data, dates, used_year = prepare_data(file1, year=year)
    if max_days is not None:
        dates = dates[: int(max_days)]
    tune_dates, validation_dates = chronological_split(dates, float(validation_fraction))
    logging.info("HP search: year=%d trials=%d objective=%s tune_days=%d validation_days=%d", used_year, n_trials, objective, len(tune_dates), len(validation_dates))

    def objective_function(trial: optuna.Trial) -> float:
        params = suggest_parameters(trial)
        result = quiet_backtest(data, tune_dates, float(cash), params)
        metrics = result["strategy"]
        trial.set_user_attr("total_return", metrics["total_return"])
        trial.set_user_attr("sharpe", metrics["sharpe"])
        trial.set_user_attr("max_drawdown", metrics["max_drawdown"])
        score = objective_value(metrics, objective)
        logging.info("Trial %d score=%.6f params=%s", trial.number, score, asdict(params))
        return score

    sampler = optuna.samplers.TPESampler(seed=int(seed))
    study = optuna.create_study(direction="maximize", sampler=sampler, study_name="agent_flecha_hp")
    study.optimize(objective_function, n_trials=int(n_trials), n_jobs=1)
    best_params = parameters_from_mapping(study.best_trial.params)
    tune_result = quiet_backtest(data, tune_dates, float(cash), best_params)
    validation_result = quiet_backtest(data, validation_dates, float(cash), best_params)

    run_dir = Path(output_dir) / datetime.now().strftime("%Y-%m-%d_%H:%M:%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    study.trials_dataframe().to_csv(run_dir / "trials.csv", index=False)
    summary = {
        "objective": objective,
        "year": used_year,
        "best_score": study.best_value,
        "best_params": asdict(best_params),
        "tune_period": {"start": str(tune_dates[0].date()), "end": str(tune_dates[-1].date()), "days": len(tune_dates)},
        "validation_period": {"start": str(validation_dates[0].date()), "end": str(validation_dates[-1].date()), "days": len(validation_dates)},
        "tune_result": tune_result,
        "validation_result": validation_result,
        "n_trials": int(n_trials),
        "seed": int(seed),
    }
    with open(run_dir / "best_params.json", "w", encoding="utf-8") as output:
        json.dump(summary, output, indent=2)
    with open(Path(output_dir) / "best_params.json", "w", encoding="utf-8") as output:
        json.dump(summary, output, indent=2)
    logging.info("Best parameters: %s", asdict(best_params))
    logging.info("Tune metrics: %s", tune_result["strategy"])
    logging.info("Validation metrics: %s", validation_result["strategy"])
    logging.info("HP results saved to %s", run_dir)
    return summary


if __name__ == "__main__":
    logging.basicConfig(format="%(asctime)s: %(message)s", level=logging.INFO)
    fire.Fire(search)
