.DEFAULT_GOAL := help

PYTHON := uv run --directory src python
export PYTHON

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

install: ## Install dependencies into virtualenv using uv
	uv venv src/.venv
	uv pip install -r src/requirements.txt --directory src

test: ## Run unit tests with uv run
	$(PYTHON) -m unittest -v test_app.py test_hp_search.py test_data_loader.py

run: ## Run baseline strategy experiment with uv run
	$(PYTHON) app.py

run-params: ## Run strategy using optimized parameters from HP search
	$(PYTHON) app.py --params_file=logs/hp_search/best_params.json

hp-search: ## Run full hyperparameter search (100 trials, validation split, auto-exports to web/config.json)
	$(PYTHON) hp_search.py --n_trials=300 --objective=return --validation_fraction=0.30

hp-search-quick: ## Run quick smoke hyperparameter search (10 trials, 50 days)
	$(PYTHON) hp_search.py --n_trials=10 --max_days=50 --objective=return --validation_fraction=0.30

export-config: ## Export latest HP search parameters to web/config.json
	$(PYTHON) export_config.py --params_file=logs/hp_search/best_params.json --web_config=../web/config.json

fetch-names: ## Fetch company names for COMPONENTS and save to web/tickers.json
	$(PYTHON) fetch_names.py

serve: ## Start local web server for the dashboard on port 8000
	$(PYTHON) -m http.server 8000 --directory ../web

pipeline: test hp-search export-config run-params ## Run full pipeline: test -> hp-search -> export-config -> run-params

clean: ## Remove python bytecode and cache directories
	find src/ -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find src/ -type f -name "*.pyc" -delete 2>/dev/null || true

.PHONY: help install test run run-params hp-search hp-search-quick export-config fetch-names serve pipeline clean
