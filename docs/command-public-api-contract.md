# Command Public API Contract

**Purpose**
Explain the initial public-site integration surface for `command` in human terms, while treating OpenAPI as the source of truth.

OpenAPI source of truth:
- [`packages/contracts-openapi/command-public-api.v1.yaml`](../packages/contracts-openapi/command-public-api.v1.yaml)

Operational BFF/session companion:
- [`docs/command-bff-session-forwarding-contract.md`](./command-bff-session-forwarding-contract.md)

Implementation/extraction companion:
- [`docs/command-repo-skeleton-and-bff-extraction-plan.md`](./command-repo-skeleton-and-bff-extraction-plan.md)

**Scope Of This First Contract**
- external auth
- external account read/update
- password reset
- brand-scoped prompt feed
- brand-scoped guide feed
- brand-scoped published schedule feeds
- public contact flow
- public chat flow
- consent-gated first-party website analytics ingestion

This pass is intentionally narrow. It does not try to freeze every future service into v1.

**Who Calls This API**
- the public-site BFF/proxy
- not the browser directly

The BFF is responsible for:
- rendering the public UI
- storing the opaque `command` session token in a server-side session store or equivalent BFF-controlled session layer
- forwarding that token to `command`
- fetching the current published analytics consent notice for the brand and rendering the consent banner from that source of truth
- creating and forwarding the consent-gated website analytics session identifier for first-party analytics batches
- forwarding that same website analytics session identifier on conversion-relevant auth/service requests so `command` can link conversions server-side
- shielding the browser from integration credentials and raw `command` session details

**Trust Layers**
1. Integration credential
   - proves that this public site is allowed to call this `command` install
   - proposed header in v1: `X-Command-Integration-Key`
2. Forwarded user session
   - proves that the end user is authenticated inside `command`
   - proposed header in v1: `X-Command-Session`
3. Forwarded website analytics session
   - identifies a consent-gated first-party analytics session owned by the public-site BFF
   - proposed header in v1: `X-Command-Website-Session`

These must remain separate. Analytics session IDs are not auth tokens.

**Brand Context In v1**
- initial assumption: the integration credential is brand-scoped
- that means `command` can resolve the public-site brand context from the integration principal
- explicit multi-brand client routing is deferred until a real use case exists

This is deliberate. It avoids trusting a raw client-supplied `brandKey` as the primary authority.

**Session Model**
- `command` owns the external-user session
- login returns an opaque session token
- the public-site BFF stores and forwards that token
- logout invalidates that token in `command`
- session inspection returns the authenticated account profile for the forwarded token

**Initial Endpoint Groups**
**Auth**
- register
- login
- logout
- session introspection
- verify email
- forgot password
- reset password

**Account**
- fetch current account
- update current account

Initial update scope is intentionally narrow:
- display-name updates only

Deferred from this contract:
- email change flow
- password change while logged in
- social account linking

**Resources**
- list prompts
- list guides
- fetch guide detail by slug

**Scheduling**
- published schedule calendar feed
- published schedule listing feed

**Services**
- submit contact requests
- execute the public website chat flow
- capture lead follow-up intent and notification triggers

**Analytics**
- fetch the current published analytics consent notice
- ingest consented first-party website analytics event batches
- ingest browser vitals and server/request performance metrics for public-website traffic
- normalize attribution and session summaries inside `command`
- link server-owned conversions to forwarded website session IDs on:
  - register
  - verify email
  - login
  - contact
  - chat

**Recommended v1 Conventions**
- path prefix: `/v1`
- JSON responses only
- OpenAPI-first versioning
- opaque session token, not a browser-managed direct auth contract
- generic password-forgot response to avoid account enumeration
- browsers never call analytics ingest directly; the public-site BFF remains the only caller

**Why This Contract Is The Right First Cut**
- it covers the public-site features that already exist today
- it adds the first-party analytics foundation without exposing internal services directly to browsers
- it avoids freezing internal admin or backoffice-only concerns into the external API
- it gives the future `command` repo a concrete surface to implement before extraction

**What Is Explicitly Not In v1**
- admin APIs
- analytics/leads ingestion APIs for third-party websites
- partner accounts
- feature-permission APIs

Important boundary:
- first-party analytics ingestion for deployed branded public sites is now in scope
- generic third-party analytics ingestion remains out of scope

Those can be added later, but they should not be smuggled into the public contract without a clearer product need.
