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

Before CIRCLE, this tracking lived entirely in Excel files and PowerPoint decks saved to a shared OneDrive folder — no cross-referencing across HR and the shop floor, and in practice files and their exact names were routinely forgotten, misplaced, or scattered across folders. CIRCLE's mechanism is cross-referencing: a single ZPAR headcount snapshot, PKWT review outcomes, Vokasi batches, and shop-floor demand/supply all resolve against the same roster by `noreg`, so a contract ending, a Vokasi batch ending, a project finishing, or a takt-time change all surface as the same kind of "replacement demand" the shop can act on — instead of separate, unreconciled lists (and files) per team.

## Operating Context

- Headcount enters the system as a monthly **ZPAR snapshot** (an Excel export) uploaded through Upload Center; there is no live HRIS integration. Vokasi records are a similarly-uploaded cumulative database, kept independent of the separate platform where Vokasi alumni are already documented and assessed today (see Capabilities and Constraints) — no integration between the two exists or is planned right now.
- Contract-stage progression (Permanen / Kontrak 1.1 / 1.2 / 2 / AKTI) and PKWT review deadlines follow a fixed lead-time chain (review window → fill deadline → shop confirmation) that the Dashboard's "Action Needed" panel and Enrollment Monitoring track against. Regular PKWT enrollment replacement is targeted for **H-1 month** before the outgoing contract ends.
- **The demand → supply pipeline, end to end:**
  1. HR records a Continue/Terminate decision as each PKWT contract nears its review window; a Terminate opens a Demand.
  2. Demand also opens from origins besides PKWT termination: a Vokasi batch ending, a Project finishing, a Takt-time change (Takt-time **up** needs people; Takt-time **down** releases them — released people are documented name-by-name, with their utilization status tracked), or sudden/unplanned demand — resignation, death, illness, or a mobility move.
  3. Before any new demand is opened, the org checks whether existing excess or under-utilized MP can fill it first — from a Takt-time down, a Project finishing, or a Kaizen that reduced the headcount a task needs — rather than treating every demand as a fresh hire.
  4. Shop recommends a supply candidate for the demand, commonly a Vokasi alumnus with a strong assessment, but also an already-employed MP the shop wants to reassign.
  5. PAD/admin verifies the shop's recommendation before it's accepted — specifically because a shop's own recommendation can miss MP the shop already has excess or under-utilized capacity on, which should be utilized before anyone new is brought in.
  6. Once demand and supply are matched and verified, HR calls the candidate in for onboarding and contract signing.
  7. A candidate moving to a different shop than the one they're currently in goes through TLC training before starting there.
- Replacement demand's origins (PKWT terminate, Vokasi ended, Project finish, Takt-time up, Resign, Pension, death, illness, mobility, GST, Unfit, or manual) all flow through the same Demand Pool → Supply Pool matching workflow described above, ending in a Handover Form.
- The Dashboard itself is explicitly read-only, aggregating every other module; all mutations happen in Upload Center, Enrollment Monitoring, Project/Takt Monitoring, Demand/Supply Pool, and Handover Form.
- All UI copy is Bahasa Indonesia.

## Capabilities and Constraints

- Built on Next.js (App Router) + Supabase, with an optimistic client-side store layer.
- Labor type is tracked as one of a fixed set of ZPAR codes (A, B1–B4, C1–C2, D, E1–E2, F, T); status_kontrak as Permanen/Kontrak 1.1/1.2/2/AKTI; posisi_struktural as a fixed structural-position hierarchy (Team Member → Department Head).
- Retirement age is 55, effective the 1st of the month after the birthday, and applies only to Permanen employees.
- Rollout status is not fully confirmed — some parts may already be live against real employee data, others still in internal validation. Do not assume either way when it matters; ask before treating current data as production-real or as disposable sample data.
- Vokasi alumni are already documented and assessed on a separate existing platform. CIRCLE deliberately does not integrate with it right now — it keeps tracking Vokasi independently (own upload, own records), a known duplication rather than a planned integration.
- The shop's supply recommendation and PAD/admin's verification of it are meant to be tracked as distinct, attributable steps (who proposed, who verified) — not a single unattributed result — because this is specifically where a shop's own excess or under-utilized MP goes unsurfaced today. A cross-shop candidate's TLC training requirement and completion is meant to be tracked as its own explicit step, not folded into the general fulfillment/confirmation fields. (Confirmed as a target for the data model; not yet implemented in the current schema.)
- Demand's origin taxonomy is meant to name death (meninggal), illness (sakit), and mobility moves as distinct origins rather than folding them into a generic "Others"/"Unfit" bucket. (Confirmed as a target; not yet implemented in the current schema.)
- Opening a new demand is meant to surface available excess/under-utilized supply (Util Pool) first, rather than leaving that check as an informal, easy-to-skip habit. (Confirmed as a target; not yet implemented in the current flow.)

## Evidence on Hand

No real screenshots, customer names, testimonials, or usage metrics are on hand. The only representative data available is the synthetic sample dataset (`lib/sampleData.ts`), used for local development and QA — not real evidence and not to be presented as such.

## Product Principles

1. **One roster, every module resolves against it.** Headcount composition, contracts, Vokasi, and demand/supply all key off the same `noreg`-identified roster from the active ZPAR snapshot — never a parallel, hand-maintained list.
2. **The Dashboard reports; it does not mutate.** Every dashboard section is a read-only aggregation of another module's real data; actions happen in that module, not on the dashboard.
3. **HR and the shop floor are equally primary.** Neither role is the "main" user with the other as secondary — flows and terminology should read naturally to both.
4. **Replacement demand is one concept with many origins.** PKWT terminate, Vokasi ended, project finish, takt-time up, resign, pension, death, illness, mobility, GST, unfit, and manual entries are all the same kind of thing downstream (Demand → Supply → Handover), not special-cased per origin past classification.
5. **Forecasts are explicit about their assumption.** Where the product projects forward (e.g. Age Movement), it says plainly what it assumes (no backfill on retirement) rather than presenting a projection as a live count.
6. **Check excess before you open new demand.** Under-utilized or excess MP — from a Takt-time down, a finished Project, or a Kaizen — is the org's stated first resort, not an optional nicety; the product should make that pool visible at the point a new demand would otherwise be opened.
7. **Recommendation and verification are two different people's work, and the system should say so.** Shop proposing a supply candidate and PAD/admin verifying it are distinct, attributable steps — collapsing them into one unattributed "matched" state is exactly how a shop's own unsurfaced excess MP gets missed today.
