# Repo Split And Service Contract

**Purpose**
Define the real split target for the current X Dragon platform:

1. a brand-specific public website repo
2. a reusable backoffice repo
3. a versioned service contract between them

This replaces the narrower idea of “split one Next.js app into two apps.” The real target is two separate projects with a stable integration boundary.

**Confirmed Target**
- `xdragon-site` remains the X Dragon public website repo
- `command` becomes the reusable backoffice repo
- `command` contains both:
  - admin UI
  - service/API layer
- each customer or org gets its own deployed `command` instance
- one `command` install can support multiple brands
- future public sites are not expected to be built by X Dragon, so integration must be documented for third parties

**System Of Record**
- external user identity lives in `command`
- password hashes, verification state, account profile, and brand access live in `command`
- brand-scoped resources, feeds, and future services live in `command`
- the public website is not the source of truth for those domains

**Integration Model**
- the public website owns its own UI for:
  - login
  - signup
  - account pages
  - password reset screens
- the public website integrates with `command` through a BFF/proxy layer
- browsers should not talk directly to `command` for normal public flows

**Trust Layers**
- the integration credential proves:
  - this public website is allowed to talk to this `command` install
- the forwarded user session proves:
  - this end user is authenticated inside that `command` install

These are separate trust layers and must stay separate in the contract.

**Session Model**
- `command` owns end-user sessions
- the public-site BFF forwards the `command` session
- the public website may wrap that in its own local UX/session handling, but it must not become the identity source of truth
- do not recreate the old shared-NextAuth-runtime model across repos

**Documentation Standard**
- OpenAPI is the source of truth for the integration contract
- human-readable documentation layers on top of OpenAPI
- future public-site builders should be able to integrate against the contract without reading X Dragon app code
- initial public-site contract docs live in:
  - [`openapi/command-public-api.v1.yaml`](../openapi/command-public-api.v1.yaml)
  - [`docs/command-public-api-contract.md`](./command-public-api-contract.md)
  - [`docs/command-bff-session-forwarding-contract.md`](./command-bff-session-forwarding-contract.md)
  - [`docs/command-repo-skeleton-and-bff-extraction-plan.md`](./command-repo-skeleton-and-bff-extraction-plan.md)

**Repo Responsibilities**
**`xdragon-site`**
- owns:
  - brand-specific marketing UI
  - brand-specific authenticated user UI
  - BFF/proxy integration layer to `command`
  - brand-specific assets, copy, design, and presentation logic
- must not own:
  - external identity truth
  - brand resource truth
  - reusable service logic that belongs in `command`

**`command`**
- owns:
  - admin UI
  - public/API service layer
  - external identity and account lifecycle
  - brand-scoped content, feeds, and future services
  - installation/bootstrap tooling and operator documentation
- should be structured so admin UI and service/API can be separated later if needed, without changing the public contract

**Module Boundary Inside `command`**
- admin module/app
- public API module/app
- shared core packages for:
  - data access
  - brand runtime
  - auth core
  - service contracts

This keeps “one repo now, separate servers later” viable.

**Extraction Order**
1. define the service contract first
2. extract `command` second
3. convert `xdragon-site` to consume `command` through the BFF
4. remove direct shared-runtime assumptions last

**Why This Order**
- route extraction alone is the wrong first move
- the real hard boundary is API ownership, not pathname ownership
- if we extract UI before freezing the service contract, the old shared runtime assumptions will leak into both repos

**First Safe Implementation Sequence**
1. define the initial OpenAPI surface for current public needs:
   - auth
   - account details/update
   - password reset
   - guides/resources feeds
2. define BFF authentication/session forwarding rules
3. create the `command` repo skeleton with:
   - admin app
   - API app
   - shared core packages
4. move backoffice/admin runtime into `command`
5. switch `xdragon-site` from direct DB/auth coupling to `command` APIs
6. remove old in-repo coupling and temporary compatibility layers

**Explicit Non-Goals In This Contract Pass**
- no repo extraction yet
- no OpenAPI spec authoring yet
- no setup page implementation yet
- no permissions-v2 design yet
- no partner-account work yet

**Definition Of Done For The Split**
- `xdragon-site` and `command` are separate repos
- `xdragon-site` consumes `command` through documented APIs only
- `command` admin UI and API are clearly separated modules/apps
- OpenAPI is the integration source of truth
- installation and operator docs are maintained as the platform evolves
