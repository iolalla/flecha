PYTHON := uv run python
export PYTHON

help: ## show help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m\033[0m\n"} /^[$$()% a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

run: ## run the local experiment
	$(PYTHON) app.py

test: ## run unit tests
	$(PYTHON) -m unittest -v test_app.py test_hp_search.py test_data_loader.py

hp-search: ## tune strategy hyperparameters with chronological validation
	$(PYTHON) hp_search.py --n_trials=100 --objective=return --validation_fraction=0.30

all: test hp-search run ## build and send
