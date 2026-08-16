#!/usr/bin/env python3
"""CLI utility to export hyperparameters / strategy parameters to web/config.json."""

import json
import logging
from pathlib import Path

import fire

from hp_search import export_to_web_config


def export(
    params_file: str = "logs/hp_search/best_params.json",
    web_config: str = "web/config.json",
):
    """Load a parameters JSON file and export to web/config.json."""
    params_path = Path(params_file)

    if not params_path.exists():
        raise FileNotFoundError(f"Parameters file not found: {params_path}")

    with open(params_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    target_path = Path(web_config)

    result = export_to_web_config(data, web_config_path=target_path)
    print(f"Successfully exported parameters from {params_path} to {target_path}")
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    logging.basicConfig(format="%(asctime)s: %(message)s", level=logging.INFO)
    fire.Fire(export)
