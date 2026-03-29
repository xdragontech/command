# Website Analytics Implementation Spec

**Purpose**
Define the concrete architecture, data contract, schema shape, metric definitions, and rollout plan for branded website analytics flowing into `command`.

This spec covers:
- first-party website analytics for branded public sites such as `xdragon-site`
- ingestion into `command`
- reporting in `command`
- realistic treatment of SEO, AEO, GEO, and LLMO

This spec does **not** claim that onsite telemetry can fully replace external platform data such as Google Search Console.

**Current Verified State**
- `xdragon-site` is the first browser-facing hop for branded public sites.
- `command/public-api` is the durable service layer and backoffice reporting destination.
- `xdragon-site` already forwards trusted client identity to `command/public-api`:
  - `X-Command-Client-IP`
  - `X-Command-Client-Country-Iso2`
  - `X-Command-Client-User-Agent`
  - `X-Command-Client-Referer`
- `command` already stores:
  - `ExternalLoginEvent`
  - `BackofficeLoginEvent`
  - `LeadEvent`
- current telemetry is request/event oriented, not session oriented
- current stack does **not** store:
  - pageviews
  - sessions
  - engagement time
  - bounce state
  - landing-page attribution
  - UTM parameters
  - click IDs such as `gclid`, `fbclid`, `msclkid`
  - web-vitals/performance metrics

**Core Decision**
- `xdragon-site` captures browser-only analytics facts at the first browser-facing hop.
- `command` owns durable analytics storage and reporting.
- browsers do not send analytics directly to `command`.
- `xdragon-site` forwards analytics server-to-server into `command/public-api`.

This mirrors the existing BFF trust model and avoids exposing internal services directly to the browser.

## Goals
- support reliable first-party reporting for:
  - conversion counts and rates
  - traffic by source
  - bounce rate
  - average engaged session duration
  - page performance metrics
  - observed SEO, AEO, GEO, and LLMO referral outcomes
- keep source of truth in `command`
- avoid inventing fake SEO/AEO/GEO/LLMO completeness from incomplete onsite signals
- reuse the existing Cloudflare-first client identity model

## Non-Goals
- replace Google Search Console, Bing Webmaster, or other external discovery platforms
- infer true search rankings, search impressions, or AI answer prominence from website traffic alone
- expose `command` ingest endpoints directly to browsers

## KPI Support Matrix
| KPI | Reliable In Command Today | Reliable After This Spec | Notes |
| --- | --- | --- | --- |
| Conversion count | Partial | Yes | Lead/chat/login events already exist; this spec normalizes website conversions by session/source. |
| Conversion rate | No | Yes | Requires session denominator and consistent conversion definitions. |
| Traffic by source | No | Yes | Requires landing attribution and source classifier. |
| Bounce rate | No | Yes | Requires pageview/session model and explicit bounce definition. |
| Average session duration | No | Yes, approximate | Should be reported as engaged duration, not literal wall-clock tab-open time. |
| Page load time / UX | No | Yes | Requires browser-side Web Vitals capture. |
| SEO | Partial | Partial + better | `command` can track observed search traffic and conversions. Rankings/impressions require Search Console. |
| AEO | No | Partial | Only observed assistant/answer-engine referrals are measurable. |
| GEO | No | Partial | Only observed AI referrals are measurable. |
| LLMO | No | Partial | `command` can track readiness + observed LLM outcomes, not full LLM visibility. |

## Terms And Definitions
**Session**
- one first-party website session identified by a stable session ID
- starts on first page load
- ends after inactivity timeout or explicit session-close beacon

**Bounce**
- a session with exactly one pageview and no engagement

**Engaged session**
- a session with at least one of:
  - 2 or more pageviews
  - 10 or more engaged seconds
  - 1 or more conversion events

**Engaged duration**
- active time derived from engagement beacons and visibility state
- not raw tab-open time

**Conversion**
- a server-confirmed action configured as a business conversion

Initial v1 conversions:
- contact submit
- chat lead submit
- client login success
- client signup success

Deferred conversions:
- vendor login success
- sponsor login success
- custom CTA conversions not yet wired to server-owned events

**Observed SEO traffic**
- sessions arriving from known search-engine referrers

**Observed AEO traffic**
- sessions arriving from known answer-engine or assistant web referrers

**Observed GEO traffic**
- sessions arriving from known generative-AI referrers

**Observed LLMO outcomes**
- conversions, sessions, and landing pages associated with observed AI/LLM referrals
- plus readiness signals stored in `command`

LLMO is treated as an optimization/reporting program, not a single raw metric.

## Source Taxonomy
Every session and qualifying event should be normalized into:
- `sourceCategory`
- `sourcePlatform`
- `sourceMedium`

Initial `sourceCategory` values:
- `DIRECT`
- `SEARCH`
- `SOCIAL`
- `REFERRAL`
- `EMAIL`
- `PAID`
- `AI_REFERRAL`
- `UNKNOWN`

Initial `sourcePlatform` examples:
- `google`
- `bing`
- `duckduckgo`
- `yahoo`
- `facebook`
- `instagram`
- `linkedin`
- `x`
- `reddit`
- `chatgpt`
- `perplexity`
- `claude`
- `gemini`
- `copilot`
- `unknown`

Initial `sourceMedium` examples:
- `organic`
- `paid`
- `referral`
- `email`
- `social`
- `ai_referral`
- `direct`
- `unknown`

Classification precedence:
1. explicit UTM / click-id signal
2. known referrer host classification
3. no referrer -> `DIRECT`
4. everything else -> `UNKNOWN`

## Architecture
### 1. Browser
The browser collects:
- session ID
- landing URL
- landing path
- query params
- `document.referrer`
- pageviews
- route transitions
- visibility/engagement pings
- Web Vitals

The browser sends these only to `xdragon-site`.

### 2. `xdragon-site`
`xdragon-site` owns:
- browser analytics collector endpoint
- browser session cookie creation/lookup
- forwarding browser-only analytics data to `command/public-api`
- forwarding trusted client identity using the existing Cloudflare-first model

### 3. `command/public-api`
`command/public-api` owns:
- analytics ingest validation
- normalization
- source classification
- durable write path
- rollups and reports consumed by the admin UI

### 4. `command/admin-web`
`command/admin-web` owns:
- reporting UI
- dashboards and filters
- operator-facing analytics surfaces

## Proposed Browser Session Model
Session storage:
- first-party cookie, e.g. `cmd_web_sid`
- `HttpOnly: false` is acceptable if browser code must read it for client beacons
- `Secure`
- `SameSite=Lax`
- site-scoped

Recommendation:
- generate the session ID server-side in `xdragon-site`
- also mirror it in response payload or readable cookie for browser beacons
- do not use localStorage as the primary session authority

Session timeout:
- 30 minutes of inactivity

Engagement heartbeat:
- every 10 seconds while page is visible
- stop when hidden
- resume when visible

Close behavior:
- use `navigator.sendBeacon` on `pagehide` / `visibilitychange` where possible

## Proposed Data Model In `command`
### `WebsiteSession`
Purpose:
- durable summary row for reporting, denominators, and attribution

Proposed fields:
- `id`
- `brandId`
- `sessionId` (external/public session identifier, unique per brand)
- `startedAt`
- `lastSeenAt`
- `endedAt`
- `landingUrl`
- `landingPath`
- `lastPath`
- `pageViewCount`
- `engagedSeconds`
- `engaged` boolean
- `bounced` boolean
- `converted` boolean
- `conversionCount`
- `sourceCategory`
- `sourcePlatform`
- `sourceMedium`
- `referrerHost`
- `referer`
- `utmSource`
- `utmMedium`
- `utmCampaign`
- `utmTerm`
- `utmContent`
- `gclid`
- `fbclid`
- `msclkid`
- `ttclid`
- `countryIso2`
- `countryName`
- `ip`
- `userAgent`
- `deviceClass` (optional v2)
- `raw` JSON (optional)

Required indexes:
- `[brandId, startedAt]`
- `[brandId, sourceCategory, startedAt]`
- `[brandId, landingPath, startedAt]`
- unique `[brandId, sessionId]`

### `WebsiteAnalyticsEvent`
Purpose:
- append-only raw event stream for auditability, derived metrics, and future reprocessing

Proposed fields:
- `id`
- `brandId`
- `sessionId`
- `eventId` (client-generated idempotency key)
- `eventType`
- `path`
- `url`
- `occurredAt`
- `sourceCategory`
- `sourcePlatform`
- `sourceMedium`
- `referer`
- `countryIso2`
- `countryName`
- `ip`
- `userAgent`
- `conversionType` nullable
- `metricName` nullable
- `metricValue` nullable
- `raw` JSON

Event types:
- `SESSION_START`
- `PAGE_VIEW`
- `ENGAGEMENT_PING`
- `SESSION_END`
- `CONVERSION`
- `WEB_VITAL`

Required indexes:
- `[brandId, occurredAt]`
- `[brandId, sessionId, occurredAt]`
- `[brandId, eventType, occurredAt]`
- unique `[brandId, eventId]`

### Optional Future `WebsiteAttributionSnapshot`
Not needed for v1.

If reporting complexity grows, a separate attribution snapshot table can be added later.

## Conversion Linking Strategy
This is the most important design point.

Conversions should not be counted from client-side success assumptions when a server-owned event already exists.

Correct pattern:
- browser session ID is forwarded through `xdragon-site`
- `xdragon-site` BFF passes the session ID into `command/public-api`
- `command` writes conversion linkage on the server-owned event

Examples:
- contact form submit -> `LeadEvent` linked to website session
- chat lead submit -> `LeadEvent` linked to website session
- client login success -> `ExternalLoginEvent` linked to website session
- client signup success -> signup conversion linked to website session

This avoids duplicated or inflated conversion counts.

## Proposed Request Contract
### Browser -> `xdragon-site`
New route:
- `POST /api/analytics/collect`

Payload:
- `sessionId`
- `page`
- `events[]`

Each event includes:
- `eventId`
- `eventType`
- `occurredAt`
- `path`
- optional `url`
- optional `referer`
- optional `engagedSeconds`
- optional `webVital`
- optional `metricValue`
- optional `conversionType`
- optional attribution fields if first event of session

### `xdragon-site` -> `command/public-api`
New route:
- `POST /api/v1/analytics/collect`

Headers:
- existing integration key
- existing trusted forwarded client identity headers
- new session forwarding header:
  - `X-Command-Website-Session`

`command/public-api` should trust session linkage and forwarded identity only on authenticated integration requests.

## Proposed `xdragon-site` Responsibilities
1. add browser tracker module
2. add first-party analytics API route
3. create/read website session cookie
4. capture landing attribution on first page load
5. send pageview and engagement events
6. send Web Vitals events
7. pass website session ID on conversion-relevant BFF routes:
   - auth login/signup
   - contact
   - chat

## Proposed `command/public-api` Responsibilities
1. add analytics ingest endpoint
2. validate integration/auth context
3. normalize source classification
4. write raw events
5. upsert session summary
6. link conversions from lead/login flows to website session IDs
7. expose reporting read models for admin-web

## Proposed `command/admin-web` Reports
### v1 Reports
1. `Reports > Leads`
   - brand filter
   - date range filter
   - leads by source category
   - leads by landing page
   - leads by referrer platform

2. `Reports > Traffic`
   - sessions
   - engaged sessions
   - bounce rate
   - average engaged duration
   - traffic by source
   - landing pages
   - web vitals summary

3. `Dashboard`
   - top-line summary only
   - sessions
   - conversions
   - conversion rate
   - top source mix
   - country map

### v2 Reports
- SEO outcomes
- GEO outcomes
- AEO outcomes
- LLMO outcomes

These are outcome reports, not claims of full visibility.

## KPI Formulas
### Conversion rate
- `converted sessions / total sessions`

Optional secondary cuts:
- `converted sessions / sessions by source`
- `converted sessions / landing-page sessions`

### Bounce rate
- `bounced sessions / total sessions`

### Average engaged session duration
- `sum(engagedSeconds) / engaged sessions`

### Traffic by source
- `sessions grouped by sourceCategory/sourcePlatform`

### SEO
- `sessions where sourceCategory = SEARCH`
- `conversions where sourceCategory = SEARCH`

### AEO
- `sessions where sourceCategory = AI_REFERRAL and sourcePlatform is assistant-like`

### GEO
- `sessions where sourceCategory = AI_REFERRAL`

### LLMO
LLMO reporting should be split into:
1. observed LLM referral sessions/conversions
2. readiness signals

Recommended readiness signals for later:
- structured content coverage
- guide/prompt/article freshness
- canonical metadata coverage
- answer-oriented content coverage

## Known Source Limitations
The following must be stated plainly in product and operator docs:
- direct traffic is a mixed bucket and includes unattributable traffic
- SEO traffic inside `command` is observed search-origin traffic, not full SEO platform performance
- AEO and GEO are only partially observable from website traffic
- LLMO cannot be fully measured from onsite telemetry alone

## Security And Trust Rules
- browsers never call `command` analytics endpoints directly
- `xdragon-site` remains the first browser-facing trust boundary
- `CF-Connecting-IP` is the canonical client IP at the first browser-facing hop
- `CF-IPCountry` is the canonical country signal at the first browser-facing hop
- forwarded client identity is trusted by `command/public-api` only on integration-authenticated requests
- analytics session IDs are not auth tokens and must never be treated as auth state

## Rollout Plan
### Wave 1: Analytics contract and schema
Repos:
- `command`

Deliverables:
- architecture/spec docs
- Prisma schema for `WebsiteSession`
- Prisma schema for `WebsiteAnalyticsEvent`
- source taxonomy enum(s)
- ingest contract doc

Validation:
- migration reviewed
- schema indexes reviewed
- source taxonomy reviewed against current business language

### Wave 2: `command/public-api` ingest and session write path
Repos:
- `command`

Deliverables:
- `POST /api/v1/analytics/collect`
- session upsert logic
- event ingest logic
- source classification module
- server-side conversion linkage helpers

Validation:
- typecheck
- build
- request-contract smoke
- idempotency smoke

### Wave 3: `xdragon-site` collector and forwarding
Repos:
- `xdragon-site`

Deliverables:
- browser tracker
- `POST /api/analytics/collect`
- session cookie
- landing attribution capture
- pageview + engagement beacons
- forward website session header on contact/chat/login/signup flows

Validation:
- local browser smoke
- staging browser smoke
- confirm events land in `command`

### Wave 4: reporting surfaces
Repos:
- `command`

Deliverables:
- traffic report page
- lead attribution/report updates
- dashboard summary updates

Validation:
- seeded traffic/session test
- date-range filtering checks
- cross-brand scope checks

### Wave 5: SEO/GEO/AEO/LLMO enrichment
Repos:
- `command`
- optional future connector/integration repo

Deliverables:
- external platform ingest design
- optional Search Console/Bing integration
- optional AI crawler/request-log enrichment
- LLMO readiness reporting

## Recommended PR Slices
1. spec + schema proposal
2. `command` analytics schema + ingest
3. `xdragon-site` collector + forwarding
4. `command` reporting surfaces
5. SEO/GEO/AEO/LLMO enrichment

This order is intentional:
- contract first
- schema second
- write path third
- UI/reporting last

## Validation Checklist
- session created once per new browser session
- pageviews increment correctly on route changes
- bounce flag behaves correctly for one-page sessions
- engagement pings stop when tab is hidden
- session duration is engaged duration, not idle tab time
- contact/chat/login conversions link to the correct website session
- source classification behaves correctly for:
  - direct
  - search
  - paid
  - referral
  - AI referrer
- brand-scoped traffic does not leak across brands
- backoffice reporting remains separate from public-site analytics

## Open Decisions
These need explicit answers before implementation:
1. whether analytics collection requires consent gating for any deployed brands
2. whether the session cookie should be JS-readable or whether session ID should be exposed via bootstrap payload instead
3. whether signup success is counted at account creation or email verification
4. whether AI platforms should be split into:
   - `AEO`
   - `GEO`
   - `LLMO`
   or normalized internally under `AI_REFERRAL` with reporting facets layered on top

**Recommendation**
- keep raw storage normalized under `AI_REFERRAL`
- derive `AEO`, `GEO`, and `LLMO` reporting facets above that
- reason: fewer schema pivots and less taxonomy drift

## Recommendation
Start with a first-party website analytics pipeline that is honest about what it can and cannot measure.

That means:
- track sessions, engagement, attribution, and conversions well
- report observed SEO/GEO/AEO/LLMO outcomes honestly
- do not market website telemetry as full search or LLM visibility

This is the safest path to durable analytics in `command`.
