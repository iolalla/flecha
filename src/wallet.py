"""
Shared Wallet module for gostocks experiments.

Provides Wallet, Order, and Stock dataclasses with mark-to-market valuation,
trade summary, and enhanced status reporting.
"""

from __future__ import annotations
import logging
import pandas as pd  # noqa: F401 — used by status() for groupby report
from dataclasses import dataclass
from typing import Optional


def _fmt_money(x: float) -> str:
    """Format a float as a currency string, e.g. $1,234.56."""
    return f"${x:,.2f}"


@dataclass
class Order:
    ticker: str
    kind: str       # "WIN" | "LOSS"
    amount: int = 0
    price: float = 0.0
    revenue: float = 0.0
    profit: float = 0.0


@dataclass
class Stock:
    ticker: str
    amount: int
    average_price: float

    def __str__(self) -> str:
        return self.ticker


@dataclass
class Wallet:
    cash: float
    stocks: list[Stock]
    historical_orders: list[Order]

    # ── Cash management ──────────────────────────────────────────────

    def add_cash(self, amount: float) -> None:
        self.cash += amount

    # ── Buying ────────────────────────────────────────────────────────

    def buy_stock(self, ticker: str, amount: int, price: float) -> str:
        logging.info(
            "BUY order %s amount %s at price %s ",
            ticker, str(amount), _fmt_money(price),
        )
        cost = float(amount * price)
        if cost > self.cash:
            logging.info("Not enough cash to buy stock %s", ticker)
            return "OK"
        for stock in self.stocks:
            if stock.ticker == ticker:
                total_amount = stock.amount + amount
                total_value = (stock.amount * stock.average_price) + (amount * price)
                stock.average_price = total_value / total_amount
                stock.amount = total_amount
                self.cash -= cost
                return "OK"
        self.stocks.append(Stock(ticker, amount, price))
        self.cash -= cost
        return "OK"

    # ── Selling ──────────────────────────────────────────────────────

    def sell_stock(
        self, ticker: str, price: float, amount: Optional[int] = None,
    ) -> str:
        logging.info(
            "SELL order %s at price %s ", ticker, _fmt_money(price),
        )
        for stock in self.stocks:
            if stock.ticker != ticker:
                continue
            amount_to_sell = (
                stock.amount if amount is None else min(amount, stock.amount)
            )
            profit = (price - stock.average_price) * amount_to_sell
            margin = amount_to_sell * price
            self.cash += margin

            if amount_to_sell == stock.amount:
                self.stocks.remove(stock)
            else:
                stock.amount -= amount_to_sell

            kind = "WIN" if stock.average_price <= price else "LOSS"
            self.historical_orders.append(Order(
                ticker=ticker,
                kind=kind,
                amount=amount_to_sell,
                price=price,
                revenue=margin,
                profit=profit,
            ))
            return "OK"

        logging.info("SELL Stock %s not found in wallet", ticker)
        return "OK"

    # ── Queries ──────────────────────────────────────────────────────

    def get_stock(self, ticker: str) -> Stock | str:
        """Return the Stock object for *ticker*, or an empty string if not held."""
        for stock in self.stocks:
            if stock.ticker == ticker:
                return stock
        return ""

    def get_stocks(self) -> list[str]:
        return [stock.ticker for stock in self.stocks]

    def get_stock_amount(self, ticker: str) -> int:
        for stock in self.stocks:
            if stock.ticker == ticker:
                return stock.amount
        return 0

    def get_profit(self) -> float:
        """Realised PnL from all closed trades."""
        return sum(order.profit for order in self.historical_orders)

    def margin(self) -> float:
        """Net revenue: total WIN revenue minus total LOSS revenue."""
        win = sum(
            order.amount * order.price
            for order in self.historical_orders if order.kind == "WIN"
        )
        loss = sum(
            order.amount * order.price
            for order in self.historical_orders if order.kind == "LOSS"
        )
        return win - loss

    def get_total_value(self, current_prices: dict[str, float]) -> float:
        """Mark-to-market portfolio value (cash + open positions at current prices)."""
        stock_value = sum(
            stock.amount * current_prices.get(stock.ticker, stock.average_price)
            for stock in self.stocks
        )
        return self.cash + stock_value

    # ── Status / Reporting ──────────────────────────────────────────

    def status(
        self,
        current_prices: Optional[dict[str, float]] = None,
        initial_cash: Optional[float] = None,
    ) -> None:
        """Log a detailed portfolio status report.

        Parameters
        ----------
        current_prices:
            Dict of ``{ticker: current_price}`` for mark-to-market valuation.
            When ``None`` the report falls back to cost-basis valuation.
        initial_cash:
            Starting capital. When provided the report includes total return
            both in absolute terms and as a percentage.
        """
        realized_pnl = self.get_profit()

        # ── Holdings ────────────────────────────────────────────────
        lines = ["=" * 60, "WALLET STATUS", "=" * 60]

        if self.stocks:
            lines.append("\nHoldings:")
            for s in self.stocks:
                avg = s.average_price
                if current_prices and s.ticker in current_prices:
                    cur = current_prices[s.ticker]
                    unrealized = (cur - avg) * s.amount
                    pnl_str = (
                        f"Unrealized: {_fmt_money(unrealized)} "
                        f"({(cur / avg - 1) * 100:+.2f}%)"
                    )
                    val_str = f"@ {_fmt_money(cur)} (market)"
                    cur_val = s.amount * cur
                else:
                    cur = avg
                    unrealized = 0.0
                    pnl_str = "No market price available"
                    val_str = f"@ {_fmt_money(avg)} (cost)"
                    cur_val = s.amount * avg
                lines.append(
                    f"  {s.ticker:6s}: {s.amount:4d} shares × {val_str} = "
                    f"{_fmt_money(cur_val):>12s}  [{pnl_str}]"
                )

        # ── Cash & PnL ─────────────────────────────────────────────
        cost_basis = sum(s.amount * s.average_price for s in self.stocks)

        if current_prices:
            mtm_value = sum(
                s.amount * current_prices.get(s.ticker, s.average_price)
                for s in self.stocks
            )
            total_value = self.cash + mtm_value
            total_pnl = realized_pnl + sum(
                (current_prices.get(s.ticker, s.average_price) - s.average_price)
                * s.amount
                for s in self.stocks
            )
        else:
            mtm_value = cost_basis
            total_value = self.cash + cost_basis
            total_pnl = realized_pnl

        lines.append(f"\nCash:                     {_fmt_money(self.cash):>14s}")
        lines.append(f"Realized PnL (closed):    {_fmt_money(realized_pnl):>14s}")
        if current_prices:
            lines.append(
                f"Unrealized PnL (open):     {_fmt_money(total_pnl - realized_pnl):>14s}"
            )
        lines.append(f"Stocks (cost basis):      {_fmt_money(cost_basis):>14s}")
        if current_prices:
            lines.append(f"Stocks (market value):    {_fmt_money(mtm_value):>14s}")
        lines.append(f"───")
        lines.append(f"Total portfolio:          {_fmt_money(total_value):>14s}")

        if initial_cash is not None and initial_cash > 0:
            total_return = total_value - initial_cash
            return_pct = (total_value / initial_cash - 1) * 100
            lines.append(
                f"Total return:             "
                f"{_fmt_money(total_return):>14s} ({return_pct:+.2f}%)"
            )

        # ── Trade Summary ──────────────────────────────────────────
        if self.historical_orders:
            wins = sum(1 for o in self.historical_orders if o.kind == "WIN")
            losses = sum(1 for o in self.historical_orders if o.kind == "LOSS")
            total_trades = len(self.historical_orders)
            win_rate = (wins / total_trades * 100) if total_trades > 0 else 0.0

            lines.append(f"\nTrades:")
            lines.append(f"  Total closed trades: {total_trades}")
            lines.append(f"  Wins: {wins}  Losses: {losses}")
            lines.append(f"  Win rate: {win_rate:.1f}%")

            # Group by ticker
            data = [
                {
                    "ticker": o.ticker, "kind": o.kind, "amount": o.amount,
                    "price": o.price, "revenue": o.revenue, "profit": o.profit,
                }
                for o in self.historical_orders
            ]
            ho = pd.DataFrame(data)
            if not ho.empty:
                try:
                    profits_by_ticker = (
                        ho.groupby("ticker")["profit"].sum()
                        .sort_values(ascending=False)
                    )
                    lines.append("\nProfit by ticker (realized):")
                    for tkr, pft in profits_by_ticker.items():
                        lines.append(f"  {tkr:6s}: {_fmt_money(pft):>12s}")
                except Exception:
                    pass

        lines.append("=" * 60)
        logging.info("\n".join(lines))

        # Legacy groupby table for backward compatibility
        if self.historical_orders:
            try:
                data = [
                    {
                        "ticker": o.ticker, "kind": o.kind, "amount": o.amount,
                        "price": o.price, "revenue": o.revenue, "profit": o.profit,
                    }
                    for o in self.historical_orders
                ]
                ho = pd.DataFrame(data)
                if not ho.empty:
                    final = ho.groupby(["ticker", "kind"]).agg({
                        "amount": ["sum", "count"],
                        "price": ["mean"],
                        "revenue": ["sum"],
                    })
                    logging.info("\n%s", final.to_string())
            except Exception:
                pass
