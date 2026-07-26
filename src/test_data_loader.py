import unittest

from data_loader import pick_random_year, ticker_yahoo_symbol, year_date_range


class DataLoaderHelpersTests(unittest.TestCase):
    def test_ticker_yahoo_symbol_appends_madrid_suffix(self):
        self.assertEqual(ticker_yahoo_symbol("AAPL"), "AAPL.MC")
        self.assertEqual(ticker_yahoo_symbol("SAN.MC"), "SAN.MC")

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
