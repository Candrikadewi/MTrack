# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two roles use CIRCLE about equally day-to-day:

- **HR team** — fills PKWT (fixed-term contract) review decisions as each contract stage comes due (Kontrak 1.1 → 1.2 → 2), manages the Vokasi (vocational/apprentice) program by batch, and tracks demand vs. supply for replacement headcount.
- **Shop/production supervisors** — map replacement candidates to open demand and confirm receipt of new manpower on the floor; also drive Project Monitoring and Takt Time Monitoring (Plant 1 & Plant 2), where a takt-time change creates or releases manpower demand.

Two more roles exist with narrower scope: **admin** (full access, including Upload Center and destructive data resets) and **guest** (read-only access to the Dashboard only).

## Product Purpose

CIRCLE (Centralized Information Record & Control for Labor Excellence) centralizes manpower tracking for an automotive/manufacturing plant (Plant 1 & Plant 2; Assembly, Body Shop, and QA divisions) — headcount composition, contract-stage progression, the Vokasi apprentice pipeline, and replacement demand/supply — in one system that HR and the shop floor both read from and act on.

## Positioning

Before CIRCLE, this tracking lived in scattered spreadsheets that didn't talk to each other across HR and the shop floor. CIRCLE's mechanism is cross-referencing: a single ZPAR headcount snapshot, PKWT review outcomes, Vokasi batches, and shop-floor demand/supply all resolve against the same roster by `noreg`, so a contract ending, a Vokasi batch ending, a project finishing, or a takt-time change all surface as the same kind of "replacement demand" the shop can act on — instead of separate, unreconciled lists.

## Operating Context

- Headcount enters the system as a monthly **ZPAR snapshot** (an Excel export) uploaded through Upload Center; there is no live HRIS integration. Vokasi records are a similarly-uploaded cumulative database.
- Contract-stage progression (Permanen / Kontrak 1.1 / 1.2 / 2 / AKTI) and PKWT review deadlines follow a fixed lead-time chain (review window → fill deadline → shop confirmation) that the Dashboard's "Action Needed" panel and Enrollment Monitoring track against.
- Replacement demand is raised from several distinct origins (PKWT terminate, Vokasi ended, Project finish, Takt-time up, Resign, Pension, GST, Unfit, or manual) and flows through a Demand Pool → Supply Pool matching workflow ending in a Handover Form.
- The Dashboard itself is explicitly read-only, aggregating every other module; all mutations happen in Upload Center, Enrollment Monitoring, Project/Takt Monitoring, Demand/Supply Pool, and Handover Form.
- All UI copy is Bahasa Indonesia.

## Capabilities and Constraints

- Built on Next.js (App Router) + Supabase, with an optimistic client-side store layer.
- Labor type is tracked as one of a fixed set of ZPAR codes (A, B1–B4, C1–C2, D, E1–E2, F, T); status_kontrak as Permanen/Kontrak 1.1/1.2/2/AKTI; posisi_struktural as a fixed structural-position hierarchy (Team Member → Department Head).
- Retirement age is 55, effective the 1st of the month after the birthday, and applies only to Permanen employees.
- Rollout status is not fully confirmed — some parts may already be live against real employee data, others still in internal validation. Do not assume either way when it matters; ask before treating current data as production-real or as disposable sample data.

## Evidence on Hand

No real screenshots, customer names, testimonials, or usage metrics are on hand. The only representative data available is the synthetic sample dataset (`lib/sampleData.ts`), used for local development and QA — not real evidence and not to be presented as such.

## Product Principles

1. **One roster, every module resolves against it.** Headcount composition, contracts, Vokasi, and demand/supply all key off the same `noreg`-identified roster from the active ZPAR snapshot — never a parallel, hand-maintained list.
2. **The Dashboard reports; it does not mutate.** Every dashboard section is a read-only aggregation of another module's real data; actions happen in that module, not on the dashboard.
3. **HR and the shop floor are equally primary.** Neither role is the "main" user with the other as secondary — flows and terminology should read naturally to both.
4. **Replacement demand is one concept with many origins.** PKWT terminate, Vokasi ended, project finish, takt-time up, resign, pension, GST, unfit, and manual entries are all the same kind of thing downstream (Demand → Supply → Handover), not special-cased per origin past classification.
5. **Forecasts are explicit about their assumption.** Where the product projects forward (e.g. Age Movement), it says plainly what it assumes (no backfill on retirement) rather than presenting a projection as a live count.
