# Partner Accounts & Applications Contract

**Purpose**
Define the architecture, domain model, workflow boundaries, storage policy, and iterative rollout plan for partner accounts, event applications, review, discrepancies, sponsor management, and partner portal surfaces across `command` and branded public sites such as `xdragon-site`.

This document exists to keep the partner feature from becoming:
- a UI-led workflow with an accidental schema
- a second overlapping scheduling model
- a second overlapping public auth model
- a file-upload shortcut that creates long-term storage debt

This is a contract and implementation-shaping document, not an implementation claim.

## Current Verified State

`command` already owns:
- scheduling and event management
- public account auth for client-facing website users
- public-api consumed by branded websites through BFF
- website analytics and public schedule/feed contracts

Relevant current models and surfaces:
- [ScheduleParticipant](/Users/grantr/Projects/command/prisma/schema.prisma)
- [ScheduleAssignment](/Users/grantr/Projects/command/prisma/schema.prisma)
- [SchedulePublicFeed](/Users/grantr/Projects/command/prisma/schema.prisma)
- [participants.tsx](/Users/grantr/Projects/command/apps/admin-web/src/pages/admin/scheduling/participants.tsx)
- [externalAuth.ts](/Users/grantr/Projects/command/packages/core-auth-external/src/externalAuth.ts)
- [commandPublicApi.ts](/Users/grantr/Projects/xdragon-site/lib/commandPublicApi.ts)

Important current limitation:
- scheduling phase 1 explicitly deferred partner application intake and review
- `ScheduleParticipant` is currently a manually managed schedulable record
- there is no partner portal, partner application workflow, sponsor tier system, or document requirement system

## Core Recommendation

Use **one shared partner auth domain** for all partner accounts.

Do **not** create:
- a separate auth/session stack for sponsors
- a second schedulable participant system for approved partners
- a single overloaded table that mixes account auth, application workflow, scheduling projection, sponsor data, and document review state

Recommended architecture:
- `command` owns all partner identity, application, review, discrepancy, and assignment authority
- `xdragon-site` owns branded public pages and consumes `command/public-api` through the existing BFF/server-to-server model
- approved participant partners project into the existing `ScheduleParticipant` model
- sponsors remain a separate partner subtype and do **not** become `ScheduleParticipant`

## Goals

This feature must support:
- partner signup, email verification, login, and profile management on branded public sites
- partner applications submitted per event
- participant partner types:
  - `ENTERTAINMENT`
  - `FOOD_VENDOR`
  - `MARKET_VENDOR`
- sponsor partner accounts and applications
- backoffice review and approval workflows
- approved participant partners becoming schedulable through the existing scheduling model
- discrepancy tracking for required permits/documents
- document upload + expiry + reviewer approval state
- sponsor tier management and event-level sponsor assignment
- partner portal surfaces that remain on the branded site and do not bounce users to `command`

## Non-Goals For Initial Release

Initial release does **not** need to include:
- MFA for partner accounts
- partner/sponsor public feed projection
- partner profile/template design finalization beyond a usable demo implementation
- click/view statistics for profiles, media, and links
- first-party hosted media/video pipeline beyond external embeds
- brand-level reminder interval configuration

These are later waves.

## Domain Boundaries

### 1. Partner Auth Domain

Partner auth must be separate from:
- `BackofficeUser`
- existing external client/public account auth

Reason:
- partner accounts have different permissions, portal behavior, notifications, review lifecycle, and future MFA policy
- overloading existing `ExternalUser` would create mixed semantics between normal client/public website users and operational partners

Recommended models:
- `PartnerUser`
- `PartnerSession`
- `PartnerLoginEvent`
- `PartnerEmailVerificationToken`
- `PartnerPasswordResetToken`

### 2. Partner Profile Domain

Partner profile data must be separate from scheduling.

Reason:
- profile data, application history, media, sponsor fields, and permit workflow are not scheduling concerns

Recommended models:
- `PartnerProfile`
- `ParticipantPartnerProfile`
- `SponsorPartnerProfile`
- `PartnerAsset`

### 3. Application Domain

Applications are **per event**.

Important rule:
- one partner account/profile may apply to many events over time
- each application is tied to one event

Recommended models:
- `PartnerApplication`
- `PartnerApplicationReview`

### 4. Scheduling Projection

`ScheduleParticipant` remains the schedulable participant record.

Important rule:
- approval does **not** auto-schedule
- approval means the participant partner becomes eligible to be scheduled later by operators

Recommendation:
- approved participant partners create or update a linked `ScheduleParticipant`
- manual participant creation must remain supported

Recommended extension to `ScheduleParticipant`:
- `source`:
  - `MANUAL`
  - `PARTNER_APPROVED`
- `partnerProfileId` nullable unique

This keeps the current scheduling system intact while allowing approved partner accounts to merge into it rather than create a second participant model.

### 5. Sponsor Domain

Sponsors are not schedulable participants in v1.

They need:
- their own application/profile data
- tier assignment
- event-level assignment

They do **not** need:
- timeslot scheduling
- resource/location scheduling
- permit discrepancy workflow

Recommended sponsor-specific models:
- `SponsorTier`
- `SponsorEventAssignment`

## Recommended Core Schema

### Shared Auth / Profile

#### `PartnerUser`
Owns:
- email
- password hash
- status
- email verification state
- last login
- subtype:
  - `PARTICIPANT`
  - `SPONSOR`

#### `PartnerProfile`
Owns:
- `brandId`
- `partnerUserId`
- slug
- contact name
- contact phone
- display name
- summary
- description
- profile completion state
- main image asset ref
- main website URL
- social links JSON
- metadata

### Participant Profile Subtype

#### `ParticipantPartnerProfile`
Owns:
- `partnerProfileId`
- participant type:
  - `ENTERTAINMENT`
  - `FOOD_VENDOR`
  - `MARKET_VENDOR`
- description
- special requirements where applicable

#### Entertainment fields
- `entType` enum:
  - `LIVE_BAND`
  - `DJ`
  - `COMEDY`
  - `MAGIC`
- `style` text

#### Food fields
- `foodStyle` text
- `setupType` enum:
  - `TRUCK`
  - `TRAILER`
  - `CART`
  - `STAND`

#### Market fields
- `marketType` enum:
  - `APPAREL`
  - `JEWELRY`
  - `DECOR`
  - `SKINCARE`
  - `FOOD`
  - `SERVICE`
  - `OTHER`

### Sponsor Profile Subtype

#### `SponsorPartnerProfile`
Owns:
- `partnerProfileId`
- type
- description
- audience profile
- marketing goals
- onsite placement
- signage information
- staffed yes/no
- sponsor type enum:
  - `DIRECT`
  - `IN_KIND`
  - `MEDIA`
- requests

### Applications

#### `PartnerApplication`
Owns:
- `partnerProfileId`
- `brandId`
- `scheduleEventSeriesId`
- `applicationKind`
- submitted profile snapshot or derived linkage
- status
- submitted at
- approved at / rejected at

Recommendation:
- one durable application row per partner profile + event
- review history should live in review rows, not duplicate application rows for the same event

Recommended status examples:
- `DRAFT`
- `SUBMITTED`
- `IN_REVIEW`
- `APPROVED`
- `REJECTED`
- `WITHDRAWN`

#### `PartnerApplicationReview`
Owns:
- `partnerApplicationId`
- reviewer user
- decision
- notes
- created at

Recommended decision examples:
- `NOTE`
- `MARK_IN_REVIEW`
- `APPROVE`
- `REJECT`

Reason:
- review history should be durable and auditable, not overwritten into one mutable notes field

### Documents / Requirements / Discrepancies

#### `PartnerAsset`
Owns:
- `partnerProfileId`
- asset kind
- storage bucket class
- storage provider
- storage key
- mime type
- file name
- file size
- checksum
- uploaded actor linkage or metadata
- optional image dimensions
- uploaded at

#### `ParticipantRequirement`
Owns:
- `partnerProfileId`
- requirement type
- linked uploaded asset/document
- expiry date
- reviewer state
- reviewer notes
- last reviewed at

Recommended reviewer states:
- `PENDING_REVIEW`
- `APPROVED`
- `REJECTED`
- `EXPIRED`

Recommended requirement types:
- `BUSINESS_LICENSE`
- `HEALTH_PERMIT`
- `BUSINESS_INSURANCE`
- `FIRE_PERMIT`

Applicability:
- `ENTERTAINMENT`
  - may have insurance or later custom requirements
- `FOOD_VENDOR`
  - business license
  - health permit
  - business insurance
  - fire permit
- `MARKET_VENDOR`
  - business license
  - business insurance later if required

Important rule:
- missing/expired/unapproved requirements create discrepancies
- discrepancies do **not** block scheduling in v1

### Sponsor Management

#### `SponsorTier`
Owns:
- `brandId`
- name
- sort order
- active state
- optional description

#### `SponsorEventAssignment`
Owns:
- `sponsorPartnerProfileId`
- `scheduleEventSeriesId`
- assigned tier
- notes

Important rule:
- sponsor event association is event-level only in v1
- tier is stored on the event assignment in v1, not as a separate sponsor-profile-global field

## Media And Upload Storage Policy

### Decision
Use:
- **Cloudflare R2 + custom domain + CDN caching** for public images/media
- **Cloudflare R2 private bucket + signed access** for private PDFs/documents
- database storage for **metadata only**

Do **not** store raw image/PDF binaries in Postgres as the default design.

Reason:
- DB bloat
- slower backups and restores
- poor long-term media delivery characteristics
- harder migration path later

### Public vs Private Storage Boundary

#### Public media
Use for:
- partner main image
- sponsor images
- later public profile/feed media

Recommended bucket:
- `partner-public-media`

Recommended custom domain:
- `media.xdragon.tech`

Behavior:
- public access allowed
- CDN caching enabled

#### Private documents
Use for:
- permits
- licenses
- insurance PDFs
- other reviewer-only compliance documents

Recommended bucket:
- `partner-private-documents`

Behavior:
- no public bucket browsing
- access only through signed `GET` URLs or a gated backend download path
- do not treat compliance PDFs as public CDN assets by default

### Cloudflare Requirements

This architecture requires:
- Cloudflare R2 account in the same Cloudflare account as the custom domain
- R2 buckets
- custom domain binding for public media
- CORS configuration for browser uploads
- S3-compatible R2 credentials for server-side signed URL generation

Important operational rule:
- do **not** use `r2.dev` for production media delivery
- use a custom domain instead

### Required Environment / Runtime Config

Recommended `command` env vars:
- `CF_R2_ACCOUNT_ID`
- `CF_R2_ACCESS_KEY_ID`
- `CF_R2_SECRET_ACCESS_KEY`
- `CF_R2_PUBLIC_BUCKET`
- `CF_R2_PRIVATE_BUCKET`
- `CF_R2_PUBLIC_BASE_URL`
- `PARTNER_UPLOAD_MAX_IMAGE_BYTES`
- `PARTNER_UPLOAD_MAX_DOCUMENT_BYTES`
- `PARTNER_UPLOAD_PRESIGNED_PUT_TTL_SECONDS`
- `PARTNER_UPLOAD_SIGNED_GET_TTL_SECONDS`

### Upload Flow Recommendation

Use:
1. browser asks `command` for presigned upload intent
2. browser uploads directly to R2 using presigned `PUT`
3. `command` stores asset/document metadata after upload completion
4. private documents are viewed/downloaded through short-lived signed access

Reason:
- keeps large file transfer out of `command`
- keeps the BFF/public-site path clean
- scales better than file-through-app-server uploads

## Public Site Architecture

Public branded sites should use the existing BFF/session model.

Do **not** expose partner auth/profile/application endpoints directly to the browser from `command`.

Use:
- browser -> `xdragon-site`
- `xdragon-site` BFF -> `command/public-api`

### Route Namespaces

Participant portal namespace:
- `/partners/signup`
- `/partners/signin`
- `/partners/profile`
- `/partners/applications`

Sponsor portal namespace:
- `/sponsors/signup`
- `/sponsors/signin`
- `/sponsors/profile`
- `/sponsors/applications`

Recommendation:
- keep participant and sponsor namespaces separate in public UX
- reuse the same underlying partner auth/session model and BFF pattern underneath

Important rule:
- logging in and using the portal must not take the user off the branded site

## Backoffice IA

Recommended admin-web IA:

### Accounts
- `Accounts > Partners`
- `Accounts > Sponsors`

This replaces the current placeholder entries:
- `Vendors`
- `Entertainment`
- `Sponsors`

### Events
- `Events > Pending Applications`
- `Events > Discrepancies`
- `Events > Sponsors Mgmt`

### Scheduling
- `Events > Participants` transitions from a manual-only page into the merged schedulable participant projection
- manual participant creation remains supported

## Workflow Contract

### Participant Partner Workflow
1. partner signs up on branded website
2. email verification completes
3. optional profile completion step is offered:
   - image
   - main URL
   - description
   - socials
4. partner submits application for one event
5. backoffice reviews application
6. if approved:
   - partner remains a partner account/profile
   - linked `ScheduleParticipant` is created or updated
   - operator may later schedule them separately
7. if required documents are missing/expired/unapproved:
   - discrepancy is surfaced
   - scheduling still remains allowed in v1

### Sponsor Workflow
1. sponsor signs up
2. email verification completes
3. sponsor profile/application is submitted per event
4. backoffice reviews application
5. on approval:
   - sponsor profile remains sponsor-only
   - event association may be created
   - tier is assigned by backoffice

## Notifications

Initial notification categories:
- signup verification
- account change notice
- assignment notification
- discrepancy reminder
- upcoming event reminder

Configuration rule for v1:
- reminder intervals configurable **by notification type**
- brand-level configuration is deferred

## Analytics And Feeds

These are explicitly later waves:
- partner profile feeds
- sponsor profile feeds
- media/link click tracking
- profile page view tracking

Important rule:
- do not block the account/application/review implementation on feed/statistics work

## Iterative Implementation Waves

### Wave 1: Contract And IA
- add this contract
- lock statuses/enums/page IA/workflow boundaries

### Wave 2: Shared Partner Auth + Profile Schema
- partner auth/session/login models
- common profile + participant/sponsor subtype tables
- upload metadata models

### Wave 3: Application + Review Schema
- application records
- review records
- discrepancy/requirement models
- sponsor tier and sponsor-event assignment models

### Wave 4: Backoffice IA
- accounts pages
- pending applications
- discrepancies
- sponsors management
- replace account placeholders

### Wave 5: Participant Public Portal v1
- partner signup/signin/profile/application pages on `xdragon-site`
- BFF integration into `command/public-api`
- approval creates/updates linked `ScheduleParticipant`

### Wave 6: Sponsor Public Portal v1
- sponsor signup/signin/profile/application pages
- sponsor review and tier/event assignment

### Wave 7: Documents + Discrepancy Workflow
- upload flows
- reviewer approval state
- expiry handling
- discrepancy report

### Wave 8: Notifications
- verification
- account change
- assignment notice
- discrepancy reminder

### Wave 9: Feeds + Stats
- partner/sponsor public feed contracts
- profile/media/link analytics

## Validation Requirements

Each implementation wave must validate:
- schema and migration state
- API contract alignment
- BFF/public-api boundary
- backoffice page ownership
- public-site portal staying on branded site
- scheduling projection correctness for approved participant partners
- document access boundary:
  - public image access works
  - private compliance docs are not publicly exposed

## Explicit Design Rules

- one partner account may apply to many events over time
- applications are per event
- approval does not auto-schedule
- approved participant partners must merge into the existing `ScheduleParticipant` model, not create a second schedulable system
- sponsors do not become schedulable participants in v1
- discrepancies do not block scheduling in v1
- public images may be CDN-cached
- private compliance documents must not be treated as public cached assets
