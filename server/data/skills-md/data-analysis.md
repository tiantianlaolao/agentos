---
name: data-analysis
description: Data analysis framework, statistical methods, and visualization best practices
emoji: "\U0001F4CA"
name_zh: 数据分析
description_zh: 数据分析方法与可视化指南
---

## Data Analysis Guide

A structured framework for analyzing data, drawing insights, and presenting findings effectively.

## The Analysis Process

### Step 1: Define the Question

Before touching any data, clarify:

```
- What specific question are we trying to answer?
- Who is the audience for this analysis?
- What decision will this analysis inform?
- What would a "good" answer look like?

Example:
Question: "Why did our monthly active users drop 15% in November?"
Audience: Product leadership
Decision: Where to invest engineering resources in Q1
Good answer: Identify the top 2-3 contributing factors with data
```

### Step 2: Collect and Understand the Data

```python
import pandas as pd

# Load and inspect
df = pd.read_csv('data.csv')
print(df.shape)           # (rows, columns)
print(df.dtypes)          # Column types
print(df.describe())      # Statistical summary
print(df.isnull().sum())  # Missing values per column
print(df.head(10))        # First 10 rows

# Check for duplicates
print(f"Duplicates: {df.duplicated().sum()}")

# Unique values in categorical columns
for col in df.select_dtypes(include='object').columns:
    print(f"{col}: {df[col].nunique()} unique values")
```

### Step 3: Clean the Data

Common cleaning tasks:

```python
# Handle missing values
df['age'].fillna(df['age'].median(), inplace=True)  # Numerical
df['category'].fillna('Unknown', inplace=True)        # Categorical
df.dropna(subset=['essential_column'], inplace=True)   # Drop if essential field is missing

# Fix data types
df['date'] = pd.to_datetime(df['date'])
df['amount'] = df['amount'].astype(float)

# Remove duplicates
df.drop_duplicates(subset=['user_id', 'date'], inplace=True)

# Handle outliers (IQR method)
Q1 = df['value'].quantile(0.25)
Q3 = df['value'].quantile(0.75)
IQR = Q3 - Q1
df_clean = df[(df['value'] >= Q1 - 1.5*IQR) & (df['value'] <= Q3 + 1.5*IQR)]
```

### Step 4: Explore and Analyze

#### Descriptive Statistics

```python
# Central tendency and spread
df['revenue'].mean()      # Average
df['revenue'].median()    # Middle value (robust to outliers)
df['revenue'].std()       # Standard deviation

# Group analysis
df.groupby('region').agg({
    'revenue': ['mean', 'median', 'sum', 'count'],
    'churn': 'mean'
}).round(2)

# Correlation
correlation = df[['revenue', 'sessions', 'support_tickets']].corr()
```

#### Time Series Analysis

```python
# Trend over time
daily = df.groupby('date')['metric'].sum().reset_index()
daily['7d_avg'] = daily['metric'].rolling(window=7).mean()
daily['mom_change'] = daily['metric'].pct_change(periods=30) * 100

# Seasonality check
df['day_of_week'] = df['date'].dt.day_name()
df['month'] = df['date'].dt.month
weekly_pattern = df.groupby('day_of_week')['metric'].mean()
```

#### Segmentation

```python
# Cohort analysis
df['cohort'] = df['signup_date'].dt.to_period('M')
cohort_data = df.groupby(['cohort', 'activity_month']).agg({
    'user_id': 'nunique'
}).reset_index()

# RFM segmentation
rfm = df.groupby('customer_id').agg({
    'date': 'max',          # Recency
    'order_id': 'count',    # Frequency
    'amount': 'sum'         # Monetary
}).rename(columns={'date': 'recency', 'order_id': 'frequency', 'amount': 'monetary'})
```

### Step 5: Visualize

#### Choosing the Right Chart

| Question | Chart Type |
|----------|-----------|
| How does X change over time? | Line chart |
| How is X distributed? | Histogram, box plot |
| How do categories compare? | Bar chart |
| What's the relationship between X and Y? | Scatter plot |
| What's the composition of X? | Stacked bar, pie chart (use sparingly) |
| How do parts contribute to a whole over time? | Stacked area chart |

#### Visualization Best Practices

```python
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(10, 6))

# Clear, readable chart
ax.plot(dates, values, color='#2563eb', linewidth=2)
ax.set_title('Monthly Active Users (2024-2025)', fontsize=14, fontweight='bold')
ax.set_xlabel('Month')
ax.set_ylabel('Users (thousands)')
ax.grid(True, alpha=0.3)

# Annotate key points
ax.annotate('Launch', xy=(launch_date, launch_value),
            xytext=(10, 20), textcoords='offset points',
            arrowprops=dict(arrowstyle='->', color='red'),
            fontsize=10, color='red')

plt.tight_layout()
```

**Chart Design Rules:**
- Always label axes and include units
- Start y-axis at zero for bar charts (avoid misleading scales)
- Use consistent colors across related charts
- Remove chartjunk (unnecessary gridlines, borders, decorations)
- Highlight the key insight, not just show data

## Statistical Concepts Quick Reference

### Hypothesis Testing

```
1. State null hypothesis (H0): "There is no difference"
2. State alternative hypothesis (H1): "There is a difference"
3. Choose significance level: typically alpha = 0.05
4. Calculate test statistic and p-value
5. If p-value < alpha: reject H0 (statistically significant)
```

### Common Tests

| Scenario | Test |
|----------|------|
| Compare two group means | t-test |
| Compare 3+ group means | ANOVA |
| Compare proportions | Chi-squared test |
| Check correlation | Pearson (linear) or Spearman (monotonic) |
| A/B test with binary outcome | Chi-squared or Z-test for proportions |

```python
from scipy import stats

# A/B test: did the new design increase conversion?
control_conversions, control_total = 120, 1000
treatment_conversions, treatment_total = 155, 1000

stat, p_value = stats.proportions_ztest(
    [control_conversions, treatment_conversions],
    [control_total, treatment_total]
)
print(f"p-value: {p_value:.4f}")
# If p < 0.05: the difference is statistically significant
```

## Presenting Findings

### Analysis Report Structure

```markdown
## Executive Summary
[1-2 paragraphs: key finding and recommended action]

## Background
[Why this analysis was done]

## Methodology
[Data sources, time period, approach]

## Key Findings
### Finding 1: [Headline with the insight]
[Supporting data, charts, and explanation]

### Finding 2: [Headline with the insight]
[Supporting data, charts, and explanation]

## Recommendations
1. [Specific, actionable recommendation]
2. [Specific, actionable recommendation]

## Appendix
[Detailed tables, methodology notes, caveats]
```

### Storytelling with Data

1. **Lead with the insight**, not the methodology
2. **Use comparisons**: "Revenue increased by $2M" is less impactful than "Revenue increased by 23%, the highest growth in 3 years"
3. **Provide context**: Is 5% churn good or bad? Compare to benchmarks.
4. **Be honest about limitations**: Sample size, data quality, confounding variables

## Common Pitfalls

1. **Survivorship bias**: Analyzing only successful cases, ignoring failures
2. **Simpson's paradox**: A trend appears in groups but reverses when combined
3. **Correlation vs. causation**: Ice cream sales correlate with drowning deaths (summer)
4. **Cherry-picking**: Selecting data that supports a predetermined conclusion
5. **Small sample size**: Drawing conclusions from too few data points
6. **Not accounting for seasonality**: Comparing December to July without adjustment
