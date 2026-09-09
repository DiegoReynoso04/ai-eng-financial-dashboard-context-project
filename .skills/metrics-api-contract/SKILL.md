---
name: metrics-api-contract
description: Verified contract of THIS repo's FastAPI metrics API (9 GET endpoints) plus the frontend/specs ↔ frontend/src ↔ backend type boundary. Use when implementing the frontend Features 1–3 from frontend/specs/, wiring any /api/metrics* fetch, or reasoning about a metrics response or a 422. Source of truth for behaviour is backend/app/routes.py.
---

# Metrics API contract (this repo)

## Objective

Operational digest of the **real, verified** contract of this repository's metrics API, so an agent can implement the frontend Features 1–3 specced in `frontend/specs/` (date-range filter, anomaly alerts, B2B vs B2C) and any `/api/metrics*` fetch **without re-deriving the contract from 6 spec files + `routes.py` each time**, and without the silent-bug mistakes.

- Source of truth for **behaviour**: `backend/app/routes.py` (exercised by `backend/tests/test_routes.py`).
- Source of truth for the **documented frontend contract**: `frontend/specs/`.
- Where the two disagree, **`routes.py` wins** — surface the discrepancy, do not silently follow the docs (see *Critical gotchas*).

## When to use

- Implementing or reviewing any of the 3 features in `frontend/specs/` (`README.md`, `endpoints.md`, `components.md`).
- Adding or changing a `fetch` to `/api/metrics*` anywhere in `frontend/src/`.
- Reasoning about a metrics response shape, its ordering guarantee, or a `422`.
- Writing pure helpers in `frontend/src/lib/*` that consume these responses.

Not for: backend changes (forbidden in these tasks), generic REST/FastAPI/React/TypeScript guidance, accessibility, React performance, or CI/CD — those are covered by `accessibility`, `vercel-react-best-practices`, and `deployment-pipeline-design`.

## Inputs

- The feature or endpoint in scope (e.g. `"Feature 1 date filter"`, `"GET /api/metrics/alerts"`).
- Optionally: the code fragment being written, or the relevant `frontend/specs/` section.

## Procedure / Rules

1. Identify which endpoint(s) the task touches → read its block in *Endpoint contract*.
2. Build the request: send only the params you need; **omit** a param to get its backend default. Never send a literal `null` — "absent" is the only "no value" (`frontend/specs/param-types.ts:9-13`).
3. Apply every matching item in *Critical gotchas*.
4. Types: follow *Type reconciliation* — extend `frontend/src/lib/financial-types.ts`; never import from `frontend/specs/`.
5. Dates: never hard-code a year or date; take bounds from `GET /api/metrics/facets` (see *Date rules*).
6. Errors: keep the existing pattern — the single `.catch()` with the fixed Spanish message in `App.tsx`; no `console.error` (`.agents/rules/error-handling.md` R2).
7. Do **not** modify `backend/`. Do **not** modify the contracts in `frontend/specs/` unless a task explicitly authorises it.

## Date rules

- All mock data is generated relative to `date.today()`: `generate_mock_movements(seed=42)` sets `today = date.today()` (`backend/app/routes.py:97`), and `_year_for_month(month, today)` puts months `< today.month` in the current year and the rest in the previous year (`routes.py:65-68`). Net effect: a rolling ~12‑month window ending around the current month. Confirmed by real execution in `memory-bank/project-summary.md:73-74`.
- Therefore `MetricsFacets.min_date` / `max_date` are **dynamic** — they shift day to day. Never hard-code them or any year (`frontend/specs/api-types.ts:77-83`, `frontend/specs/endpoints.md:34`).
- Tests assert dates dynamically, never by literal year: `movements[0].create_date`, `base_response.json()[0]["create_date"]` (`backend/tests/test_routes.py:21,39`). Do the same in any new test.
- Fixed size: 12 months × 30 movements = **360** per dataset (`routes.py:99-102`, `test_routes.py:15`).
- Known inconsistency — do **not** "fix" it as part of a feature: the dashboard header is hard-coded `period="2024 - Full Year"` (`frontend/src/App.tsx:49`) while the data is current/previous-year relative. Documented in `memory-bank/project-summary.md:78-81` and `memory-bank/status.md:30`.

## Endpoint contract

All endpoints are `GET`. Business routes live under `/api/metrics…`; `/health` is the only one without the prefix (`memory-bank/conventions.md` #25). Every route declares an explicit `response_model=` + return annotation (`.agents/rules/backend-api-contract.md` R2). Every endpoint regenerates `generate_mock_movements(seed=42)` per request (`routes.py:255,264,277,295,311,350,370,386`). Validation failures → `HTTP 422`, body `HTTPValidationError` = `{ detail: [{ type, loc, msg, … }] }` (`frontend/specs/endpoints.md:8`); the backend adds no error handling of its own (`.agents/rules/error-handling.md` R1).

### 1 · `GET /health` — `routes.py:243-245`
- Params: none.
- Response: `{ "status": "ok" }` (200, unconditional / shallow).
- Gotcha: not under `/api`; not part of the features.

### 2 · `GET /api/metrics` — `routes.py:248-259` — Feature 1
- Params (all optional, default `None`): `start_date`, `end_date` (`YYYY-MM-DD`, **inclusive**: `create_date >= start_date`, `create_date <= end_date`), `category` (`Category`), `operation_type` (`OperationType`).
- Response: `FinancialMovement[]`, ordered by `create_date` **ascending** (`ensure_chronological_order`, `routes.py:259`).
- **Gotcha:** does **not** accept `business_type` — the param does not exist on this route (`routes.py:249-253`, `endpoints.md:22`). For a segment view use `/api/metrics/b2b` / `/b2c` or `/api/metrics/summary?business_type=`.
- Params type: `MetricsParams extends DateRangeFilter` (`frontend/specs/param-types.ts:53-56`). Response type: `FinancialMovement` (`frontend/specs/api-types.ts:52-59`).

### 3 · `GET /api/metrics/facets` — `routes.py:262-265` — Features 1 & 3
- Params: **none**. Any query param passed returns `200` and is silently ignored (`routes.py:263`, `endpoints.md:31`).
- Response: `MetricsFacets = { operation_types, business_types, categories, min_date, max_date }` (`routes.py:30-35`).
  - `categories` is a **global** list built from a set over all movements (`routes.py:150-158`) — **not** per `business_type`.
  - `min_date` / `max_date` = first / last `create_date` of the full dataset → **dynamic** (see *Date rules*).
- Verified values: `operation_types` = `["income","outcome"]`, `business_types` = `["B2B","B2C"]`, `categories` = `["administrative","operational","others","sales","suppliers"]` (`test_routes.py:104-118`).
- Params type: `FacetsParams = Record<string, never>` (`param-types.ts:64`).

### 4 · `GET /api/metrics/summary` — `routes.py:268-284` — Feature 1 (aggregated) & Feature 3 (cross-check)
- Params (all optional): `group_by` (`GroupBy`, **default `"month"`**), `start_date`, `end_date`, `category`, `operation_type`, `business_type`.
- Response: `MetricsSummaryItem[] = { period, income, outcome, net }[]`, `net = income - outcome`, ordered by `period` **ascending** (`routes.py:179-187`).
  - `period` format depends on `group_by`: `day` → `YYYY-MM-DD`; `week` → `YYYY-Www` (e.g. `2026-W12`); `month` → `YYYY-MM` (`routes.py:169-175`).
  - `business_type` filters the aggregation to one segment; response items do **not** say which segment (`routes.py:278-280`, `endpoints.md:49`).
- **Doc-vs-code caveat:** `endpoints.md:48` says the `income` field is "desglosado con independencia de este filtro". Real behaviour (`routes.py:281-284` → `filter_movements` runs before `summarize_movements`): passing `operation_type` narrows the movement set first, so the **non-selected side sums to `0`** (e.g. `operation_type=income` → every item's `outcome` is `0` and `net == income`). Follow the code.
- Params type: `SummaryParams extends DateRangeFilter` (`param-types.ts:72-82`).

### 5 · `GET /api/metrics/categories/top` — `routes.py:287-302` — Feature 3
- Params: `operation_type` (`OperationType`, **default `"outcome"`**), `limit` (`int`, `ge=1`, `le=20`, **default `5`**), `start_date`, `end_date`, `business_type`.
- Response: `TopCategoryItem[] = { category, operation_type, total_amount }[]`, ordered by `total_amount` **descending**, truncated to `limit` (`routes.py:200-208`).
- **Gotchas:**
  - Feature 3 compares **income**, so you **must send `operation_type=income` explicitly** — omitting it returns the outcome (spend) ranking (`routes.py:289`, `param-types.ts:116-120`, `components.md:256`).
  - Use `limit=20` to get **all** categories, so the client's per-category share is computed against the real group total; do **not** use `limit=5` here (`components.md:257-258`, `view-types.ts:69-75`).
  - Response has **no `business_type` field** and **no percentage field** — the caller labels each result by which call it made and computes `percent = total_amount / Σ total_amount` client-side (`api-types.ts:143-148`).
  - `limit` outside `1..20` → `422` (`routes.py:290`).
  - With `operation_type=income` only `sales` + `others` have data; with `outcome`, four categories do (`routes.py:79,82`, `endpoints.md:94`).
- Params type: `TopCategoriesParams extends DateRangeFilter` (`param-types.ts:115-130`); derived view types `CategoryShare` / `SegmentIncomeBreakdown` / `SegmentComparison` (`view-types.ts:51-85`).

### 6 · `GET /api/metrics/comparison` — `routes.py:305-339` — NOT used by Features 1–3
- Params: `start_date` **required**, `end_date` **required** (`Query(...)`, `routes.py:307-308`) — the **only** endpoint with required params; `business_type` optional.
- Response: `MetricsComparison = { current_period, previous_period, delta_abs, delta_pct }`; `delta_pct` is `null` when `previous_period == 0` (`routes.py:330-332`).
- Semantics: compares the **net** value (`income - outcome`) of `[start_date, end_date]` vs the immediately preceding window of the **same duration** — `previous_end = start_date - 1 day`, `previous_start = previous_end - (end_date - start_date)` (`routes.py:321-327`). **Not** a B2B/B2C comparison.
- Missing either date → `422` (`test_routes.py:157-170` always sends both).

### 7 · `GET /api/metrics/alerts` — `routes.py:342-359` — Feature 2
- Params: `threshold` (`float`, `ge=0`, **no upper bound**, **default `0.3`** — `routes.py:344`), `group_by` (`GroupBy`, default `"month"`), `start_date`, `end_date`, `business_type` (all optional).
- Response: `MetricsAlert[] = { period, outcome_total, baseline_average, increase_ratio }[]`, ordered by `period` **ascending** (`routes.py:219-240`).
- Semantics (`detect_outcome_alerts`, `routes.py:219-240`):
  - `baseline_average` = **cumulative / expanding mean** of `outcome` over **all earlier periods** (`sum(historical_outcomes) / len(historical_outcomes)`, `routes.py:227`). It is **NOT** a 3‑period moving average (`endpoints.md:70`; the earlier "media móvil" wording was corrected in the specs — `frontend/specs/README.md:189`).
  - The **first period** of the series is never evaluated / never an alert — `historical_outcomes` is empty on the first iteration and is appended to only *after* the check (`routes.py:225-226,239`).
  - A row is returned only when `increase_ratio > threshold` (strict), with an internal guard `baseline_average > 0` (`routes.py:228-230`).
  - `increase_ratio = (outcome_total - baseline_average) / baseline_average` — a **ratio, not a formatted percentage**: `0.7353` means +73.53 % (`routes.py:229`, `api-types.ts:123-128`). Display as `formatPercent(increase_ratio * 100)`.
- API vs UI: the API accepts `threshold = 0` and any value `> 1`. The `0.01–1.0` slider is a **product decision** (`components.md:133-139`) — do not encode it as a narrower type (`param-types.ts:96-102`).
- `threshold < 0` or non-numeric → `422`.
- Params type: `AlertsParams extends DateRangeFilter` (`param-types.ts:91-106`); response type `MetricsAlert` (`api-types.ts:109-129`).

### 8 · `GET /api/metrics/b2b` — `routes.py:362-375` — NOT used by Features 1–3
### 9 · `GET /api/metrics/b2c` — `routes.py:378-391` — NOT used by Features 1–3
- Params (both): `start_date`, `end_date`, `category`, `operation_type` (all optional). No `business_type` param — the segment *is* the route.
- Response: `FinancialMovement[]` filtered to `business_type == "B2B"` / `"B2C"`, ordered by `create_date` **ascending** (`routes.py:369-375` / `:385-391`, `test_routes.py:52-69`).
- Feature 3 uses `categories/top` per segment instead (less post-processing) — `endpoints.md:105`.

## Critical gotchas (checklist)

- **Dates are relative to `date.today()`** — never hard-code a year/date; read `facets.min_date` / `max_date` (`routes.py:65-68,97`).
- `/api/metrics` has **no `business_type`** param (`routes.py:249-253`).
- `/api/metrics/facets` takes **no filters**; its `categories` list is **global**, not per segment (`routes.py:150-158,263`).
- `/api/metrics/categories/top` defaults `operation_type="outcome"` → income views **must send `operation_type=income`** explicitly, and `limit=20` to get all categories (`routes.py:289-290`).
- `alerts.baseline_average` is a **cumulative (expanding) mean**, not a moving average; the **first period is never an alert** (`routes.py:225-227,239`).
- `alerts.increase_ratio` is a **ratio**, not a formatted percentage (`routes.py:229`).
- `/api/metrics/comparison` **requires** `start_date` and `end_date` (`routes.py:307-308`); every other endpoint's date params are optional.
- Omitting an optional param ≠ sending `null`. Build the query string; "absent" is the only "no value" (`param-types.ts:9-13`).
- Validation errors → **`422 HTTPValidationError`** `{ detail: [...] }`; the backend adds nothing (`.agents/rules/error-handling.md` R1).
- Exact enums (backend `Literal`, `routes.py:11-15`): `operation_type` ∈ `income|outcome`; `business_type` ∈ `B2B|B2C`; `category` ∈ `suppliers|sales|operational|administrative|others`; `group_by` ∈ `day|week|month`; dates `YYYY-MM-DD`.
- Income movements only ever have `category` `sales` (≈90 %) or `others` (≈10 %) (`routes.py:79`). Do not hard-code a category set in the UI — render what the API returns (`components.md:276`).
- **When docs/specs and `routes.py` disagree, `routes.py` (verified behaviour) is the source of truth** — flag the discrepancy, do not silently follow the docs. Known cases: the `/api/metrics/summary` `income` "independent of filter" wording (endpoint 4 above); some `routes.py:NN` / `financial-utils.ts:69-80` line refs inside `frontend/specs/` predate commit `22d6260` and can be off by a few lines (the described behaviour is unchanged).

## Type reconciliation

- `frontend/specs/` is a **spec-only artifact package** (Phase 2 deliverable). It is **not** in `frontend/tsconfig.app.json` (`"include": ["src"]`), so `tsc -b` never compiles it (`frontend/specs/README.md:41-48`).
- **Never import types from `frontend/specs/` into `frontend/src/`.** On implementation, **extend / reuse `frontend/src/lib/financial-types.ts`** (`frontend/specs/README.md:44-48`, `api-types.ts:20-25`).
  - `financial-types.ts` already declares `OperationType`, `Category`, `BusinessType`, `FinancialMovement`, `KPIMetrics`, `MonthlyDataPoint` (`frontend/src/lib/financial-types.ts:1-25`).
  - Enums / response shapes not yet there (`GroupBy`, `MetricsFacets`, `MetricsSummaryItem`, `MetricsAlert`, `TopCategoryItem`): add them to `financial-types.ts`, mirroring `routes.py` exactly. Derived/view models (`DateRange`, `DateRangeBounds`, `CategoryShare`, `SegmentIncomeBreakdown`, `SegmentComparison`) go in `financial-types.ts` or a sibling `frontend/src/lib/*.ts`, matching the existing `KPIMetrics` / `MonthlyDataPoint` precedent.
- Three homonyms — keep distinct:

  | Name | What it is | Shape | Source |
  |---|---|---|---|
  | `DateRange` | frontend **view** state of the filter | `{ startDate?: string; endDate?: string }` (camelCase) | `frontend/specs/view-types.ts:25-30` |
  | `DateRangeFilter` (type) | **query-param** contract shared by 4 endpoints | `{ start_date?: string; end_date?: string }` (snake_case) | `frontend/specs/param-types.ts:39-44` |
  | `DateRangeFilter` (component) | the React date-picker component (Feature 1) | `interface DateRangeFilterProps` | `frontend/specs/components.md:48-62` |

  When both `DateRange*` types are in scope, import one with an alias (`param-types.ts:34-37`).
- API optional params are modelled **without `| null`** — `field?: T`, absent = default (`param-types.ts:9-13`).
- Component conventions for anything new live in `frontend/specs/components.md:12-27`, which restate `.agents/rules/` (kebab-case files, named exports, `interface <Name>Props`, own `<Skeleton>`, `@/` alias, `type`-only imports, Tailwind `var(--…)` tokens, reuse `formatCurrency` / `formatPercent` from `@/lib/financial-utils`). This skill does not repeat them — follow those.

## Expected outputs

When applied to a task, produce:

- The exact request: method + path, params to **send** vs **omit**, and the backend default assumed for each omitted one.
- The response shape, field meanings, and ordering guarantee.
- The subset of *Critical gotchas* that applies, called out explicitly.
- The type move: which type to add to / reuse from `frontend/src/lib/financial-types.ts`, and any homonym alias needed.
- Any doc/spec-vs-code discrepancy relevant to the task, with `routes.py` taken as truth.

No application code is produced by this skill; it constrains and directs the implementation.

## Acceptance criteria

- [ ] For every endpoint the task touches: path, params (required vs optional), defaults, constraints, response shape and ordering match `backend/app/routes.py`.
- [ ] "Dates are relative to `date.today()` — do not hard-code" is stated and honoured; bounds come from `/api/metrics/facets`.
- [ ] Every applicable Critical gotcha is addressed: no `business_type` on `/api/metrics`; `operation_type=income` + `limit=20` on `categories/top` for income views; expanding-mean baseline; first period not an alert; `increase_ratio` treated as a ratio; `comparison` sends both dates; no literal `null`.
- [ ] No type is imported from `frontend/specs/`; new types extend `frontend/src/lib/financial-types.ts`; `DateRange` / `DateRangeFilter` (param type) / `DateRangeFilter` (component) are kept distinct.
- [ ] `backend/` and `frontend/specs/` are not modified.
- [ ] Any doc-vs-code contradiction found is surfaced, with `routes.py` as source of truth.
- [ ] Important claims cite `file:line`; no generic REST / FastAPI / React / TypeScript advice is added.
