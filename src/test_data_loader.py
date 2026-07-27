import unittest
from datetime import date
from unittest.mock import patch

import pandas as pd

from data_loader import _download_ticker, keep_component_dates, pick_random_year, ticker_yahoo_symbol, year_date_range


class DataLoaderHelpersTests(unittest.TestCase):
    def test_ticker_yahoo_symbol_normalizes_whitespace(self):
        self.assertEqual(ticker_yahoo_symbol("BAS.    DE"), "BAS.DE")
        self.assertEqual(ticker_yahoo_symbol(" san.mc "), "SAN.MC")

    def test_ticker_yahoo_symbol_appends_requested_suffix(self):
        self.assertEqual(ticker_yahoo_symbol("SAN.MC", ".MC"), "SAN.MC")

    @patch("data_loader.yf.download")
    def test_download_ticker_handles_duplicate_flattened_columns(self, download):
        columns = pd.MultiIndex.from_product([
            ["Open", "High", "Low", "Close", "Volume"], ["BAS.", "DE"]
        ])
        download.return_value = pd.DataFrame(
            [[1] * len(columns), [2] * len(columns)],
            index=pd.date_range("2023-01-02", periods=2),
            columns=columns,
        )

        result = _download_ticker("BAS.    DE", date(2023, 1, 1), date(2023, 1, 4))

        self.assertIsNotNone(result)
        self.assertEqual(result["Ticker"].unique().tolist(), ["BAS.DE"])
        self.assertEqual(result.columns.tolist(), ["Date", "Open", "High", "Low", "Close", "Volume", "Ticker"])

    def test_keep_component_dates_retains_history_before_evaluation_start(self):
        data = pd.DataFrame({
            "Ticker": ["AAA", "AAA", "AAA", "AAA"],
            "Date": pd.to_datetime(["2022-12-30", "2023-01-03", "2023-01-04", "2023-01-05"]),
            "Close": [1.0, 2.0, 3.0, 4.0],
        })

        filtered, dates = keep_component_dates(data, ["AAA"], evaluation_start="2023-01-01")

        self.assertEqual(filtered["Date"].min(), pd.Timestamp("2022-12-30"))
        self.assertEqual(dates, [pd.Timestamp("2023-01-03"), pd.Timestamp("2023-01-04"), pd.Timestamp("2023-01-05")])

    def test_pick_random_year_within_bounds(self):
        for _ in range(50):
            year = pick_random_year()
            self.assertGreaterEqual(year, 2000)
            self.assertLessEqual(year, 2025)

    def test_pick_random_year_allows_custom_bounds(self):
        for _ in range(20):
            year = pick_random_year(2010, 2012)
            self.assertGreaterEqual(year, 2010)
            self.assertLessEqual(year, 2012)

    def test_year_date_range_covers_previous_and_following_year(self):
        start, end = year_date_range(2020)
        self.assertEqual(start.year, 2019)
        self.assertEqual(start.month, 1)
        self.assertEqual(start.day, 1)
        self.assertEqual(end.year, 2021)
        self.assertEqual(end.month, 12)
        self.assertEqual(end.day, 31)


if __name__ == "__main__":
    unittest.main()
