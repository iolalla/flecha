# Agent Flecha Local Experiment

This experiment benchmarks a deterministic Stock Quant vector strategy on IBEX component data downloaded from Yahoo Finance. When no local CSV is supplied, a random year between 2000 and 2025 is selected and the `COMPONENTS` universe is used to fetch only those tickers.

## Signal

For every evaluation session and ticker, the strategy uses only the preceding 30 completed sessions.

- Closing prices are indexed so the first close equals 100.
- A linear regression over sessions 1 through 30 supplies the slope.
- The reported direction angle is `degrees(arctan(slope))`.
- Positive slope is bullish, negative slope is bearish, and invalid or flat input is neutral.
- Intensity is `abs(30-session return) * (latest completed volume / mean volume) / daily-return volatility`.

Orders execute at the current session's `Open`. The current session is never included in the signal window.

## Portfolio policy

Bullish stocks receive intensity-proportional target weights. Current defaults cap each position at 10%, keep a 5% cash buffer, ignore trades below 0.05% of portfolio value, take profit at +10%, and stop loss at -2%. Bearish holdings are fully sold before bullish purchases. Every strategy parameter can be overridden through the Fire CLI.

The final report includes total return, annualized Sharpe ratio, maximum drawdown, wallet trade statistics, and an equal-weight passive buy-and-hold baseline over the same dates.

## Local run

Using `make` (from repository root or `src/`):

```bash
make run
make run-params
```

Or using `uv run`:

```bash
uv run python app.py
uv run python app.py --params_file=logs/hp_search/best_params.json
```

By default the strategy downloads data from Yahoo Finance for a random year between 2000 and 2025, restricted to the `COMPONENTS` universe. Optional Fire arguments override the year, load a local CSV, or load hyperparameters from an HP-search result:

```bash
uv run python app.py --year=2019 --max_days=100
uv run python app.py --params_file=logs/hp_search/best_params.json
```

Timestamped logs are written under `logs/`.

## Hyperparameter search

The Optuna search keeps epsilon fixed and searches:

- Signal threshold: `0%`, `1%`, `2%`, `3%`, `4%`, `5%`, `10%`.
- Lookback: `5`, `10`, `20`, `30`, `60`, `90` completed sessions.
- Profit take: `0.05`, `0.10`, `0.15`, `0.20`.
- Stop loss: `-0.10` through `-0.01` in `0.01` steps.
- Maximum position: `0.05` through `0.50` in `0.05` steps.
- Cash buffer: `0.00` through `0.15` in `0.01` steps.
- Trade threshold: `0.00` through `0.01` in `0.0005` steps.

The signal threshold is symmetric: a bullish slope needs a window return at or above the positive threshold to buy, while a bearish slope needs a return at or below the negative threshold to sell. Signals inside the band are neutral.

Dates are split chronologically. Optuna tunes only on the first 70%, then the selected parameters are evaluated once on the final 30%. The default objective is annualized Sharpe; `return` and `calmar` are also supported.

```bash
make hp-search
# or directly:
uv run python hp_search.py --n_trials=100 --objective=return --validation_fraction=0.30
```

When no `file1` is supplied, the search downloads Yahoo Finance data for a randomly chosen year between 2000 and 2025 and filters to the `COMPONENTS` universe. Use `--year` to pin a specific year and `--max_days` for a short smoke search (`make hp-search-quick`).

Each run writes `trials.csv` and `best_params.json` under `logs/hp_search/<timestamp>/`. JSON is used because it requires no additional parser, preserves the complete HP-search metadata, and is directly machine-readable by `app.py`.

By default, `hp_search.py` automatically exports the optimal parameters to `web/config.json` (use `--export_web=False` to disable). You can also export parameters from any previous run manually using `export_config.py` / `make export-config`:

```bash
make export-config
# or directly:
uv run python export_config.py --params_file=logs/hp_search/best_params.json
```

Run the strategy with the selected parameters on another random year for validation:

```bash
make run-params
```

When `params_file` is provided, its `best_params` block overrides the individual strategy-parameter CLI defaults. Cash and `max_days` remain configurable on the command line.

## Tests

```bash
make test
# or directly:
uv run python -m unittest -v test_app.py test_hp_search.py test_data_loader.py
```
