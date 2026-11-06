# Event Go-to-Market & Unit Economics Review

Copy this file once per event. Fill from authorized records; leave unknown fields blank and log the gap. Report the decision this review supports. Keep completed reviews and underlying evidence private unless the owner approves their release.

© 2026 Jessie Ai. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Adapted from an AI-assisted draft.

## 0. Review control

| Field | Value |
|---|---|
| Event ID / name | |
| Owner / reviewer | |
| Event start and end, including timezone | |
| Review date / version | |
| Decision to support | |
| Authorized source locations | |
| Data and sharing restrictions | |

### Evidence register

Maintain `sources.csv` and cite `source_id` for each material amount or metric.

| Grade | Source |
|---|---|
| E1 | Primary system record: ledger, order export, analytics export, API bill |
| E2 | Contemporaneous receipt, invoice, contract or sign-in record |
| E3 | Contemporaneous plan, inventory, photograph or operator log |
| E4 | Retrospective recollection or stakeholder report |
| E5 | Inference, allocation or estimate with stated method |

Use `Verified` only when source, time window, population and unit agree. Otherwise use `Partially verified`, `Estimated`, `Pending`, `Unavailable` or `Not applicable`.

## 1. Event strategy and targets

| Field | Value / source |
|---|---|
| Event format, venue and organizer | |
| Target audience | |
| Pre-event objective and business hypothesis | |
| Offer / experience and intended next action | |
| Distribution channels and campaign identifiers | |
| Budget version / approver | |
| Staffing and responsibilities | |

| Target metric fixed before event | Target | Actual | Unit and definition | Source | Status |
|---|---:|---:|---|---|---|
| | | | | | |

## 2. Revenue, funding and cash collection

Record line items in `cost_lines.csv` or a separate transaction ledger. Distinguish earned revenue from internal funding and sponsorship. Say “no direct revenue” only after checking the records.

| Item | Type: sale / cash sponsor / internal funding / refund / other | Invoiced | Collected | Currency / tax basis | Date | Source | Status |
|---|---|---:|---:|---|---|---|---|
| | | | | | | | |

| Summary | Amount | Scope / source |
|---|---:|---|
| Gross earned revenue | | |
| Refunds and reversals | | |
| Net earned revenue | | |
| Cash sponsorship | | |
| Internal budget funding (separate) | | |
| Receivable, not yet collected | | |

## 3. Cost and resource ledger

For every material line, capture item, vendor or owner, quantity, acquisition method, budget, committed amount, incurred amount, paid amount, currency, tax basis, date, source and status in `cost_lines.csv`. Do not publish vendor, payer or contract details without authorization.

| Category | Examples | Items / source IDs | Status |
|---|---|---|---|
| Venue and equipment | venue, furniture, audio, printer, power, connectivity | | |
| Materials and production | signage, print, paper, gifts, decoration, packaging | | |
| Travel and logistics | transit, shipping, lodging, meals | | |
| People and outsourced services | operators, designers, photographers, hosts | | |
| Product and technology | model API, hosting, software, network | | |
| Other | insurance, cleaning, platform fees, taxes | | |

Track these four treatments separately:

| Treatment | Amount | Method / source |
|---|---:|---|
| Refundable deposits | | Deposit paid, returned or outstanding |
| Reusable asset purchase outflow | | Original acquisition; not automatically the event cost |
| Asset allocated to this event | | Allocation method and useful life |
| In-kind support | | Provider and valuation method, if valued |
| People opportunity cost | | Hours, rate and reason for estimation |

## 4. Cost bridge and budget variance

Do not report a single undifferentiated “total cost.” Reconcile the ledger with the cash records.

| Measure | Amount | Formula / reconciliation |
|---|---:|---|
| Gross cash outflow | | All cash paid, including deposits and reusable asset purchases; reconcile to payment records |
| Incurred operating cash expense | | Recognized event expense; exclude refundable deposits and full reusable asset purchase when allocated separately |
| Cash paid against incurred expense | | Payment transactions applied to the expense above |
| Payable outstanding | | Incurred expense minus payments applied, after adjustments |
| Refundable deposits outstanding | | Separate balance |
| Asset allocation | | Event share, not full purchase price by default |
| In-kind resources | | Separate estimated value |
| People opportunity cost | | Separate estimate |
| Economic cost | | Incurred operating expense + non-overlapping asset allocation, in-kind value and opportunity cost |

| Category | Approved budget | Incurred cash expense | Difference | Difference % | Main reason | Evidence |
|---|---:|---:|---:|---:|---|---|
| Venue and equipment | | | | | | |
| Materials | | | | | | |
| Travel and logistics | | | | | | |
| People | | | | | | |
| Product and technology | | | | | | |
| Other | | | | | | |

## 5. Audience and participation

Record every observation in `metric_observations.csv`. State the population, time window, timezone and distinct key. When stages cannot be matched to one cohort, call the ratio a cross-sectional ratio rather than funnel conversion.

| Stage | Operational definition | Count | Distinct key / source | Status |
|---|---|---:|---|---|
| Impressions | Times content was displayed | | | |
| Reached people | Deduplicated exposure | | | |
| Registrations | Completed registration | | | |
| Attendees | Checked in or verified onsite | | | |
| Experience starts | People who began the defined activity | | | |
| Completed experiences | People reaching the defined endpoint | | | |
| New product users | First use attributable to event | | | |
| Community net adds | Joins minus exits in defined window | | | |
| Qualified leads | Predefined qualification rule | | | |

## 6. Product usage and technical performance

Do not equate API requests, product turns, sessions, people, devices or produced items. Reconcile system scopes before dividing one by another.

| Metric | Instrumentation / definition | Count | Window and timezone | Source | Status |
|---|---|---:|---|---|---|
| Distinct product users / devices | | | | | |
| Product sessions | | | | | |
| Agent turns started | | | | | |
| Agent turns finished | | | | | |
| Successful play / export / share | | | | | |
| Physical outputs produced | | | | | |
| API requests, successful / failed | | | | | |
| Input / output / total tokens | | | | | |
| API billed cost, model and currency | | | | | |
| Latency or failure experience | | | | | |

Check event definitions, ingestion loss, offline behavior, duplicate events, shared devices, account filters and whether the billing account serves traffic outside the event.

## 7. Before and after behavior

Choose comparable windows in advance. Label temporal association as correlation until a source link, campaign ID, matched cohort or other attribution method supports a stronger claim.

| Metric | Baseline window / value | Event window / value | Follow-up window / value | Change | Attribution method / limitation |
|---|---|---|---|---|---|
| Active users / devices | | | | | |
| New users | | | | | |
| Completed experiences | | | | | |
| Shares / exports | | | | | |
| Community net adds | | | | | |
| 7-day / 30-day return | | | | | |

## 8. Unit economics and financial return

Only calculate a metric when numerator and denominator cover the same event, period, population and attribution scope. State exclusions. A `Pending` result is better than false precision.

| Measure | Formula | Result | Scope / status |
|---|---|---:|---|
| Cost per attendee | Allocable event cost / attendees | | |
| Cost per completed experience | Allocable event cost / distinct completed experiences | | |
| Cost per attributable new user | Attributable acquisition cost / attributable new users | | |
| API cost per completed experience | Event-only model cost / completed experiences | | |
| API cost per completed turn | Event-only model cost / completed turns | | |
| Contribution margin | Attributable earned revenue − attributable variable cost | | |
| Financial ROI | (Attributable net benefit − event investment) / event investment | | |

If attributed revenue or benefit is missing, omit ROI and report cost structure, observed participation, product use and research value separately. Keep forecasts, estimates and actuals distinct.

## 9. Feedback and operations learning

| Anonymized feedback / issue | Evidence | Frequency or severity | Product/operations action | Owner | Follow-up status |
|---|---|---|---|---|---|
| | | | | | |

Exclude raw conversations, personal identifiers and secrets. Quote participants only with the necessary consent.

## 10. Decision memo and evidence gaps

- Decision supported by this review:
- Strongest observed outcome and source:
- Largest confirmed cost category:
- Biggest uncertainty:
- Next experiment or operational change, owner, expected cost and validation metric:

| Missing field / conflicting figure | Why it matters | Evidence needed | Owner | Due date | Current status |
|---|---|---|---|---|---|
| | | | | | |

## 11. AI assistant handoff

An assistant may inventory authorized records, extract line items, reconcile totals, fill the CSVs and draft this review. It should cite source IDs and keep uncertain fields empty. Human review is required before changing access, publishing, sending, paying or deleting anything. Never ask for or store API secrets, personal identifiers or raw customer conversations for this review.
