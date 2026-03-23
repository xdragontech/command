# Scheduling & Calendar Contract

**Purpose**
Define the phase-1 scheduling and calendar architecture for `command`.

This document exists to keep scheduling from becoming a UI-led feature with an accidental data model. The schedule domain must be owned by `command`, surfaced through `admin-web`, and exposed to public websites through the documented `public-api` contract.

This is an architecture and contract document, not an implementation claim.

## Current Recommendation

Use:
- `command` as the source of truth
- `admin-web` for backoffice scheduling and conflict review
- `public-api` for published schedule reads
- FullCalendar **OSS v6** as a dependency-backed admin calendar surface

Do **not** fork FullCalendar in phase 1.

Reason:
- the product value is the schedule model, publishing rules, conflict handling, and public contract
- maintaining a calendar engine fork creates immediate long-term debt
- the current requirement can be satisfied with OSS `v6` plus `command`-owned resource and detail workflows

## Phase-1 Scope

Phase 1 covers scheduling for already-approved records only.

It does **not** include:
- the application intake workflow
- application review/approval UI
- public website UI implementation
- multi-tenant public-site routing beyond the existing `public-api` integration model

Phase 1 must support:
- many separate events
- recurring seasonal weekly event series
- named resources:
  - stages
  - vendor spots / booths
- schedulable participants:
  - `ENTERTAINMENT`
  - `FOOD_VENDOR`
  - `MARKET_VENDOR`
- timed entertainment slots
- full-day vendor assignments
- publish-state control
- overlap/conflict detection
- public read APIs with filterable schedule data

## Core Domain Model

The recommended phase-1 model is:

### `EventSeries`
Represents a named event program such as:
- `Friday Market 2026`
- `Summer Concert Series`

Owns:
- install-local name / slug
- timezone
- recurrence rule metadata
- season start / end window
- default publish behavior

### `EventOccurrence`
Represents one materialized scheduled date for a series.

Examples:
- `Friday Market 2026 / 2026-05-01`
- `Friday Market 2026 / 2026-05-08`

Owns:
- series linkage
- occurrence date
- startsAt / endsAt for the occurrence window
- status / publish state

Recommendation:
- recurrence should materialize explicit occurrence rows
- assignments should attach to occurrences, not to recurrence rules directly

Reason:
- single-day overrides become much safer
- conflict checks become concrete
- public reads stay simple

### `ScheduleResource`
Represents a named schedulable location/resource.

Examples:
- `Main Stage`
- `Kids Stage`
- `Food Row A / Spot 03`
- `Market Booth 14`

Owns:
- name
- slug / key
- type
- optional grouping
- optional sort/display order
- optional active/inactive state

Recommended types:
- `STAGE`
- `FOOD_SPOT`
- `MARKET_SPOT`

### `ScheduleParticipant`
Unified schedulable record for phase 1.

Owns:
- type
- display name
- slug
- optional summary/public description
- optional image / media refs later
- optional contact/admin metadata
- optional category/tags later

Recommended types:
- `ENTERTAINMENT`
- `FOOD_VENDOR`
- `MARKET_VENDOR`

Reason:
- phase 1 does not yet have the application-review module
- this keeps the schedule domain usable now without pretending approval data already exists
- future approved-application records can link into `ScheduleParticipant`

### `ScheduleAssignment`
Represents one participant scheduled onto one occurrence and one resource.

Owns:
- occurrence linkage
- participant linkage
- resource linkage
- assignment kind / behavior
- timed slot or all-day flag
- public title and public display details
- publish status
- optional manual display sequence override

Recommended assignment rules:
- entertainment:
  - requires `startsAt` and `endsAt`
  - `allDay = false`
  - sequence defaults from time order
- food / market vendors:
  - `allDay = true`
  - occupies the occurrence day for that resource

## Sequence Rule

For phase 1, `sequence` should be treated as a display property derived from start time.

Recommendation:
- default public sequence from sorted `startsAt`
- allow optional manual override later only if a real exception appears

Do **not** make sequence the primary scheduling primitive in v1.

Reason:
- time is the real scheduling source of truth
- separate sequence-only editing creates drift and extra conflict complexity

## Conflict Rules

Conflict detection must be backend-owned.

Phase-1 conflict checks:
- a resource cannot have overlapping timed entertainment assignments within the same occurrence
- a full-day vendor assignment blocks that resource for the occurrence
- a participant should not have overlapping assignments within the same occurrence
- duplicate assignment of the same participant/resource/occurrence combination should be rejected

Backoffice UX recommendation:
- surface conflicts in the assignment editor
- also show a table/report card of active conflicts outside the calendar view

This matches the requirement that duplicates/overlaps be identifiable in a summary report and not only inside the widget.

## Admin-Web Ownership

`admin-web` should own:
- event series CRUD
- occurrence generation / override management
- schedule resource CRUD
- schedule participant CRUD
- assignment CRUD
- conflict reporting
- calendar view rendering
- public display-detail editing outside the calendar UI

Important:
- the calendar widget must not be the only editing surface
- details like description, links, media, vendor notes, and public text should be editable in standard forms outside the calendar grid

This matches the existing admin design direction and keeps the calendar from becoming a fragile all-in-one editor.

## Public-API Ownership

Published schedule reads belong in `public-api`, following the existing BFF-consumed public contract model.

The browser should not call `command` directly.

Public schedule endpoints should be:
- date-range bounded
- filterable at the API level
- safe for future extension
- scoped to published data only

### Recommended Public Read Surface

Recommended contract extension groups:

**Schedule Calendar Feed**
- `GET /api/v1/schedule/calendar`

Purpose:
- optimized for calendar rendering
- returns published assignments in a date range

Recommended filters:
- `from`
- `to`
- `eventSeries`
- `occurrenceDate`
- `participantType`
- `resource`
- `resourceType`
- `search`

**Schedule Listing Feed**
- `GET /api/v1/schedule/list`

Purpose:
- optimized for non-calendar public pages and cards
- supports grouped or flat listing UI later

Recommended filters:
- `eventSeries`
- `date`
- `from`
- `to`
- `participantType`
- `resource`
- `search`

**Schedule Metadata**
- optional in phase 1
- can be deferred if the calendar/list endpoints already return enough embedded event/resource data

Recommendation:
- keep the first public schedule contract narrow
- do not expose admin conflict data or drafts

## Public Visibility Rule

Public websites should see **published** schedule data only.

Draft/internal schedule states stay inside `admin-web`.

Reason:
- matches the current `public-api` trust boundary
- avoids leaking incomplete schedule edits
- keeps public reads stable

## Recurrence Rule

The MVP must support seasonal weekly schedules such as:
- every Friday from May 1 to September 12 in a given year

Recommendation:
- store recurrence metadata on `EventSeries`
- generate explicit `EventOccurrence` rows
- allow occurrence-level exceptions later

This is better than reading recurrence rules dynamically at query time for all public/admin logic.

## FullCalendar Decision

### Chosen Direction
- FullCalendar OSS `v6`
- used as a dependency, not forked in phase 1

### Why Not FullCalendar v4
- the upstream workspace is now on `v6.1.20`
- forcing legacy `v4` into the current stack adds avoidable compatibility and maintenance risk

### Why Not Fork In Phase 1
- the fork cost is front-loaded and permanent
- the current requirements are primarily data-model and API problems, not calendar-engine problems
- we can still build resource-aware workflows around OSS views without taking ownership of the engine

## Considered Solutions

### Solution 1. Recommended
Use FullCalendar OSS `v6` with a `command`-owned schedule domain and public-api read contract.

Advantages:
- lowest maintenance burden
- fastest path to a correct backend model
- keeps UI and public contract aligned with current standards

Compromise:
- no premium native resource timeline

### Solution 2. Premium/Scheduler Path
Use FullCalendar Premium for native resource/timeline scheduling.

Advantages:
- better stage/booth resource UX in the calendar itself
- less custom UI work for resource rows

Compromise:
- license dependency
- not aligned with the stated preference to stay open-source

### Solution 3. Fork FullCalendar
Fork FullCalendar and build missing resource features ourselves.

Advantages:
- maximum control
- no premium license dependency

Compromise:
- highest long-term cost
- highest upgrade burden
- wrong first move unless we prove a real upstream blocker

Recommendation:
- do **not** choose solution 3 in phase 1

## Recommended Implementation Waves

### Wave 1. Contract & Schema
- architecture doc
- Prisma model design
- conflict rules
- public-api extension proposal

### Wave 2. Core Scheduling Backend
- schema + migrations
- core scheduling package/service
- conflict detection
- occurrence generation

### Wave 3. Admin CRUD
- event series
- occurrences
- resources
- participants
- assignments
- conflict summary/report card

### Wave 4. Admin Calendar UI
- embed FullCalendar OSS inside the current admin shell
- use existing card/layout patterns
- keep detail editing in normal forms outside the calendar widget

### Wave 5. Public-API Read Surface
- published schedule endpoints
- API-level filters
- calendar-friendly payload
- list-friendly payload

### Wave 6. Public Site Consumption
- BFF integration in `xdragon-site`
- public calendar UI
- public listing/filter UI

## Explicit Non-Goals For Phase 1

- application intake workflow
- application review workflow
- invitation/onboarding tied to scheduling
- direct browser calls to `command/public-api`
- multi-brand public-site routing redesign
- calendar engine fork
- premium scheduler dependency

## Recommendation

Proceed with:
1. schema and service contract first
2. then core scheduling implementation
3. then admin CRUD and conflict reporting
4. then FullCalendar UI
5. then public-api reads

This is the safest path and matches how the split was successfully executed.
