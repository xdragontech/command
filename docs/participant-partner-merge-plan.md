# Participant / Partner Merge Plan

**Purpose**
Define the safe path to merge legacy manual scheduling participants with the new participant-partner model without breaking existing schedules, assignments, or planner behavior.

This is a decision and implementation plan artifact, not code.

Related docs:
- [partner-accounts-and-applications-contract.md](./partner-accounts-and-applications-contract.md)
- [scheduling-calendar-contract.md](./scheduling-calendar-contract.md)

## What Is True

Today there are two overlapping concepts:

1. `ScheduleParticipant`
- the current schedulable participant record
- this is what assignments point at
- this is what planner/scheduling surfaces use

2. `PartnerProfile`
- the new participant-partner account/profile domain
- on approval, current code creates or updates a linked `ScheduleParticipant` projection by `partnerProfileId`

That creates a duplication risk:
- legacy manual participants already exist in scheduling
- approved partner accounts can create a second schedulable participant for the same real-world participant

## Current Live X Dragon Data Snapshot

Production currently has:
- `6` `ScheduleParticipant` rows
- all `6` are `source=MANUAL`
- all `6` have assignments
- `0` approved participant partners linked into scheduling right now

This matters.

Recommendation:
- fix the merge behavior now, before approved partner rows start creating duplicate schedulable participants in production

## Core Recommendation

`ScheduleParticipant` must remain the canonical schedulable entity.

Do **not** replace it.
Do **not** create a second scheduling model.
Do **not** treat partner approval as “make a new participant row every time.”

Instead:
- approved participant partners should **attach to an existing `ScheduleParticipant` when one already represents the same participant**
- only create a new `ScheduleParticipant` if no suitable existing row should be adopted

Reason:
- all assignment foreign keys already point to `ScheduleParticipant.id`
- preserving that ID preserves current schedules and assignments automatically
- this avoids destructive assignment remapping in the normal case

## The Correct Merge Direction

The merge direction should be:

- `PartnerProfile` attaches to an existing `ScheduleParticipant`

Not:

- existing `ScheduleParticipant` data gets copied into a new partner-generated row

Why:
- schedules, assignments, feed output, and planner state are already anchored to the existing participant ID
- changing ownership is cheaper than changing foreign keys

## Proposed Rules

### Rule 1: Existing `ScheduleParticipant` IDs are sacred

If a manual participant already has assignments, keep that row and its ID.

Allowed changes:
- set `partnerProfileId`
- update display metadata
- update active/inactive status based on partner account status
- record linkage metadata

Not allowed as the normal path:
- create a duplicate row for the same participant and leave assignments behind on the legacy row

### Rule 2: Linkage beats duplication

When a participant partner is approved:

1. check whether the partner is already linked to a `ScheduleParticipant`
2. if yes, update that existing linked participant
3. if not, offer or execute an adoption path against an existing manual participant
4. only create a new participant row when no existing schedulable participant should be linked

### Rule 3: Manual editing must stop once linked

After a `ScheduleParticipant` is linked to a `PartnerProfile`:
- partner-owned fields should no longer be editable from the legacy Participants page
- the Participants page should show the row as linked/managed by partner account

Reason:
- otherwise the participant row and partner profile will drift
- there must be one authoritative editor for participant identity/profile fields

## Recommended Matching Strategy

Do **not** do fuzzy auto-merge in v1.

That is the wrong risk profile.

Recommended v1 matching tiers:

### Safe auto-match
Auto-link only when all of these are true:
- same brand
- same participant type
- exact normalized slug match

Optional secondary safe case:
- same brand
- same participant type
- exact case-insensitive display name match
- and there is exactly one candidate

### Admin-confirmed match
If safe auto-match is not available:
- show a candidate adoption list during approval or from a dedicated merge tool
- let admin select the existing `ScheduleParticipant` to adopt

### No match
If no good candidate exists:
- create a new `ScheduleParticipant`

## Recommended Schema / Model Adjustment

The current schema already supports the essential linkage:
- `ScheduleParticipant.partnerProfileId`

That is good.

What should change semantically:
- presence of `partnerProfileId` becomes the real source of truth for “linked to partner”
- `source` should not be treated as the only indicator of whether the row is partner-managed

Recommendation:
- keep `source=MANUAL` when a legacy manual participant is later linked to a partner
- use `partnerProfileId != null` to determine that the participant is partner-managed

Reason:
- source should describe origin
- linkage should describe current ownership relationship

This avoids an unnecessary enum expansion unless product reporting later needs it.

## Implementation Plan

### Wave 1: Change approval behavior

Replace the current “upsert by `partnerProfileId`, otherwise create” flow with:

1. try existing linked row by `partnerProfileId`
2. if none, try safe adoption match against existing manual participants in same brand/type
3. if a single safe match exists, attach the partner to that participant row
4. otherwise require explicit admin selection or create a new row, depending on policy

Recommendation:
- do **not** silently create a new row if there are ambiguous candidates
- surface the ambiguity to admin

### Wave 2: Add explicit adoption API

Add an admin action:
- `adopt existing schedulable participant`

Input:
- `partnerProfileId`
- `scheduleParticipantId`

Validation:
- same brand
- same participant type
- target participant is not already linked to another partner

Transaction:
- set `ScheduleParticipant.partnerProfileId = partnerProfileId`
- keep the existing participant ID
- update participant status from partner account status
- optionally refresh display name / slug / summary from partner profile

### Wave 3: Handle already-duplicated cases safely

If a partner-linked duplicate row already exists and a legacy row already has assignments:

1. choose the retained participant row
2. move assignments from duplicate to retained row **only if needed**
3. detect unique-key collisions before update:
   - same occurrence
   - same resource
   - same participant after merge
   - same time window
4. if collisions exist, stop and require admin resolution
5. delete the orphaned duplicate row only after successful reassignment

Important:
- this is a repair path, not the normal path

### Wave 4: Update UI ownership

#### Accounts > Partners
- show whether the partner is:
  - linked to existing participant
  - created new participant
  - unlinked
- add action for:
  - link to existing participant
  - re-link only if currently unassigned and safe

#### Events > Participants
- show linked/manual state
- prevent direct editing of partner-owned fields on linked rows
- allow scheduling use as normal

#### Pending Applications
- when approving participant application:
  - if exactly one safe candidate exists, show that it will be adopted
  - if ambiguous, require explicit participant selection before final approval

## Field Ownership Recommendation

For linked participant rows:

Partner-owned:
- display name
- slug
- summary
- participant-type-specific descriptive fields

Scheduling-owned:
- assignments
- schedule history
- planner placement
- event/resource/timeslot relationships

Reason:
- partner identity/profile should come from the partner domain
- scheduling state should remain in scheduling

## Why Not “Just Replace the Legacy Participant Row”

Because “replace” is the wrong mental model.

The row being replaced is already the row assignments depend on.

If you create a new row and consider it canonical, you now need:
- assignment foreign key updates
- conflict checks
- duplicate cleanup
- feed/public output review
- audit of any IDs cached or referenced elsewhere

That is avoidable in the common case.

The correct action is:
- **adopt the legacy schedulable row**

## Recommended Rollout Order

1. change approval/projection behavior to adopt existing participant rows  
2. add explicit admin adoption tooling  
3. lock linked participant editing on the legacy Participants page  
4. run one-time merge pass for any already-duplicated rows  
5. only then consider hiding or restructuring the old Participants screen

## Definition Of Success

This merge is successful when:
- an approved participant partner can become schedulable without creating a duplicate participant row when a legacy row already exists
- existing `ScheduleAssignment.scheduleParticipantId` values stay intact in the normal case
- planner behavior does not change for already-scheduled participants
- linked participants are clearly marked and no longer drift between partner and scheduling UIs

## Recommendation

Implement an **attach-first** model:
- attach partner profiles to existing `ScheduleParticipant` rows
- create new schedulable participants only when no existing row should be adopted

That is the safest path because it preserves scheduling identity, preserves assignments, and removes the duplication problem at its real source rather than trying to clean it up afterward.
