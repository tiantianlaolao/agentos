---
name: financial-analysis
description: Financial analysis framework, key metrics, and reporting templates for business evaluation
emoji: "\U0001F4B0"
name_zh: 财务分析
description_zh: 财务报表分析与投资决策指南
---

## Financial Analysis & Reporting Guide

Analyze financial health, performance, and viability using structured frameworks, key metrics, and standard reporting formats.

## Financial Statements Overview

### The Three Core Statements

```
1. Income Statement (P&L) - "How profitable are we?"
   Revenue - Expenses = Net Income
   Period: Monthly, Quarterly, Annually

2. Balance Sheet - "What do we own and owe?"
   Assets = Liabilities + Equity
   Snapshot: At a specific point in time

3. Cash Flow Statement - "Where does cash come from and go?"
   Operating + Investing + Financing = Net Change in Cash
   Period: Monthly, Quarterly, Annually
```

### How They Connect

```
Income Statement          Balance Sheet
Revenue                   Assets
- COGS                      Cash ← (from Cash Flow)
= Gross Profit              Accounts Receivable
- Operating Expenses         Inventory
= Operating Income           Property/Equipment
- Interest/Taxes           Liabilities
= Net Income → ──────────→   Accounts Payable
                              Debt
                           Equity
                              Retained Earnings (accumulated Net Income)
```

## Key Financial Metrics

### Profitability Metrics

```
Gross Margin = (Revenue - COGS) / Revenue
  What it tells you: Efficiency of production/service delivery
  Benchmark: SaaS 70-85%, E-commerce 30-50%, Manufacturing 25-40%

Operating Margin = Operating Income / Revenue
  What it tells you: Profitability from core operations
  Benchmark: SaaS 15-25% (mature), Tech 20-30%

Net Margin = Net Income / Revenue
  What it tells you: Bottom-line profitability after all expenses
  Benchmark: Varies widely by industry (5-20% is healthy for most)

EBITDA = Earnings Before Interest, Taxes, Depreciation, Amortization
  What it tells you: Operating profitability ignoring capital structure
  Use: Common for company valuation and comparison
```

### SaaS / Subscription Metrics

```
MRR (Monthly Recurring Revenue) = Sum of all active subscriptions
ARR (Annual Recurring Revenue) = MRR x 12

MRR Growth Components:
  New MRR:       Revenue from new customers
  Expansion MRR: Upgrades and seat additions from existing customers
  Churned MRR:   Revenue lost from cancellations
  Net New MRR:   New + Expansion - Churned

Churn Rate = Customers lost in period / Customers at start of period
  Monthly churn target: < 3% (B2B SaaS), < 5% (B2C)

Net Revenue Retention (NRR) = (Starting MRR + Expansion - Churn) / Starting MRR
  Target: > 100% (means existing customers grow faster than they churn)
  Best-in-class: 120-140%

CAC (Customer Acquisition Cost) = Total Sales & Marketing / New Customers
LTV (Lifetime Value) = ARPU x Gross Margin / Monthly Churn Rate
LTV:CAC Ratio target: > 3:1
CAC Payback Period = CAC / (ARPU x Gross Margin)
  Target: < 12 months
```

### Liquidity & Solvency Metrics

```
Current Ratio = Current Assets / Current Liabilities
  Healthy: > 1.5 (can cover short-term obligations)

Quick Ratio = (Cash + Receivables) / Current Liabilities
  Healthy: > 1.0 (can cover obligations without selling inventory)

Debt-to-Equity = Total Debt / Total Equity
  Lower is generally better (< 2.0 for most industries)

Burn Rate = Monthly cash outflow (for startups)
Runway = Cash Balance / Monthly Burn Rate
  Target: > 12 months of runway
```

## Financial Analysis Frameworks

### Ratio Analysis

Compare a company's ratios over time (trend) and against peers (benchmarking):

```markdown
## [Company] Financial Ratio Analysis

| Metric | Q1 2024 | Q2 2024 | Q3 2024 | Q4 2024 | Industry Avg |
|--------|---------|---------|---------|---------|-------------|
| Gross Margin | 72% | 73% | 74% | 75% | 70% |
| Operating Margin | 12% | 14% | 15% | 16% | 18% |
| Net Margin | 8% | 9% | 10% | 11% | 12% |
| Current Ratio | 2.1 | 1.9 | 2.0 | 2.2 | 1.8 |
| Debt/Equity | 0.4 | 0.4 | 0.3 | 0.3 | 0.5 |

**Trend:** Improving margins quarter-over-quarter
**vs. Industry:** Above average on gross margin, below on operating margin
**Implication:** Strong unit economics but need to optimize operating costs
```

### DuPont Analysis

Break down Return on Equity (ROE) into its components:

```
ROE = Net Margin x Asset Turnover x Equity Multiplier

ROE = (Net Income/Revenue) x (Revenue/Assets) x (Assets/Equity)

Example:
ROE = 10% x 1.5 x 2.0 = 30%

This tells you:
- Net Margin (10%): How much profit per dollar of revenue
- Asset Turnover (1.5): How efficiently assets generate revenue
- Equity Multiplier (2.0): How much leverage (debt) is used
```

### Break-Even Analysis

```
Break-Even Point (units) = Fixed Costs / (Price per Unit - Variable Cost per Unit)

Example:
  Fixed costs: $50,000/month (rent, salaries, tools)
  Price per unit: $100
  Variable cost per unit: $30
  Break-even: $50,000 / ($100 - $30) = 715 units/month

Break-Even Point (revenue) = Fixed Costs / Contribution Margin Ratio
  Contribution Margin Ratio = (Price - Variable Cost) / Price
  = ($100 - $30) / $100 = 70%
  Break-even revenue: $50,000 / 0.70 = $71,429/month
```

### DCF (Discounted Cash Flow) Valuation

```
Company Value = Sum of [Future Cash Flows / (1 + Discount Rate)^Year]

Simplified example:
  Projected Free Cash Flows:
    Year 1: $500K
    Year 2: $800K
    Year 3: $1.2M
    Year 4: $1.8M
    Year 5: $2.5M
  Terminal Value: $2.5M x 15 (exit multiple) = $37.5M
  Discount Rate: 12% (WACC)

  Present Value = $500K/1.12 + $800K/1.12^2 + ... + $37.5M/1.12^5

Note: DCF is highly sensitive to assumptions. Always test with multiple
scenarios (base, optimistic, pessimistic).
```

## Financial Report Template

```markdown
# Financial Report - [Period]

## Executive Summary
[2-3 sentences: headline numbers and key takeaways]

## Revenue Analysis
- Total revenue: $X (Y% vs. prior period)
- Revenue by segment/product
- Revenue by geography/channel
- Key drivers of change

## Profitability Analysis
- Gross margin: X% (trend and explanation)
- Operating expenses breakdown
- EBITDA: $X (X% margin)
- Net income: $X

## Cash Flow
- Operating cash flow: $X
- Capital expenditures: $X
- Free cash flow: $X
- Current cash position: $X
- Runway: X months

## Key Metrics Dashboard
| Metric | Actual | Target | Prior Period | YoY Change |
|--------|--------|--------|-------------|------------|
| MRR | $X | $X | $X | +X% |
| Customers | X | X | X | +X% |
| Churn | X% | X% | X% | -X% |
| NRR | X% | X% | X% | +X% |
| CAC | $X | $X | $X | -X% |

## Risks & Concerns
- [Risk 1 and mitigation]
- [Risk 2 and mitigation]

## Outlook
[Forward-looking statements and guidance for next period]
```

## Scenario Analysis

```markdown
## Three-Scenario Financial Model

### Base Case (Most Likely - 60% probability)
- Revenue growth: 15% YoY
- Gross margin: 75%
- Operating expenses grow 10% YoY
- Result: Profitable by Q4 2026

### Optimistic Case (25% probability)
- Revenue growth: 25% YoY (enterprise deal closes)
- Gross margin: 78% (scale benefits)
- Result: Profitable by Q2 2026

### Pessimistic Case (15% probability)
- Revenue growth: 5% YoY (market slowdown)
- Gross margin: 70% (pricing pressure)
- Result: Need additional funding by Q3 2026

### Sensitivity Table
| Revenue Growth | 5% | 10% | 15% | 20% | 25% |
|---------------|-----|-----|-----|-----|-----|
| Profitability | Q1 27 | Q3 26 | Q4 26 | Q2 26 | Q2 26 |
| Cash Needed | $2M | $1M | $0 | $0 | $0 |
```

## Common Financial Red Flags

1. **Revenue growing but cash declining**: May indicate collection problems or unsustainable growth
2. **Gross margin declining over time**: Pricing pressure or increasing COGS
3. **Operating expenses growing faster than revenue**: Not achieving operating leverage
4. **High revenue concentration**: One customer > 20% of revenue is risky
5. **Inventory buildup**: Growing faster than revenue may signal demand issues
6. **Accounts receivable growing faster than revenue**: Customers paying slower
7. **Negative free cash flow with debt maturities approaching**: Liquidity risk
8. **Consistently missing forecasts**: Indicates poor planning or overly optimistic assumptions
