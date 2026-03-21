# Command BFF Session Forwarding Contract

**Purpose**
Define how a brand-specific public website should integrate with `command` for external-user authentication and authenticated resource access.

This document is the operational companion to:
- [`docs/repo-split-and-service-contract.md`](./repo-split-and-service-contract.md)
- [`docs/command-public-api-contract.md`](./command-public-api-contract.md)
- [`openapi/command-public-api.v1.yaml`](../openapi/command-public-api.v1.yaml)

**Core Decision**
- `command` owns the external-user session
- the public website owns the user interface
- the public-site BFF forwards the `command` session
- the browser must not hold the raw `command` session token directly

**Actors**
1. Browser
   - renders the public-site UI
   - talks only to the public-site BFF
2. Public website UI
   - collects login/signup/reset inputs
   - never receives the integration credential
   - should not receive the raw `command` session token
3. Public-site BFF
   - authenticates to `command`
   - stores and forwards the `command` session token
   - maps browser state to the authenticated `command` session
4. `command`
   - authenticates the user
   - owns session truth
   - owns account/resource truth

**Trust Layers**
**Integration credential**
- proves the public site is allowed to call this `command` install
- lives only on the BFF/server side
- is sent on every BFF -> `command` request
- proposed v1 header: `X-Command-Integration-Key`

**Forwarded user session**
- proves the end user is authenticated inside `command`
- is issued by `command`
- is stored by the BFF
- is forwarded by the BFF on authenticated requests
- proposed v1 header: `X-Command-Session`

These credentials solve different problems and must never be collapsed into one token.

**Recommended Browser Session Model**
- the browser gets a public-site cookie such as `site_session`
- that cookie is:
  - `HttpOnly`
  - `Secure`
  - `SameSite=Lax`
  - scoped to the public-site domain
- the cookie value is a local site session handle, not the raw `command` session token

**Recommended BFF Session Store**
- the BFF stores:
  - local site session handle
  - associated `command` session token
  - `command` session expiry
  - minimal cached user display data if needed
- this can live in:
  - a server-side session store
  - or an encrypted server-managed cookie envelope

**Recommendation**
- prefer a server-side session store for v1
- reason:
  - easier token rotation
  - easier revocation
  - easier auditing
  - avoids putting an encrypted but still sensitive `command` session artifact in the browser

**Login Flow**
1. browser submits credentials to the public-site BFF
2. BFF sends `POST /v1/auth/login` to `command`
   - includes `X-Command-Integration-Key`
3. `command` authenticates the user and returns:
   - opaque `command` session token
   - session expiry
   - account snapshot
4. BFF stores the `command` session token server-side
5. BFF sets the local public-site session cookie
6. browser is treated as signed in through the public site

**Session Read Flow**
1. browser requests an authenticated page from the public site
2. BFF resolves the local site session handle
3. BFF looks up the stored `command` session token
4. BFF calls `GET /v1/auth/session` with:
   - `X-Command-Integration-Key`
   - `X-Command-Session`
5. if valid, BFF renders the page with the returned account state
6. if invalid or expired, BFF clears the local session and treats the user as signed out

**Logout Flow**
1. browser requests logout from the public-site BFF
2. BFF calls `POST /v1/auth/logout` with:
   - `X-Command-Integration-Key`
   - `X-Command-Session`
3. BFF deletes the local session mapping
4. BFF clears the browser session cookie

**Signup Flow**
1. browser submits signup form to the BFF
2. BFF calls `POST /v1/auth/register`
3. `command` creates the account and starts verification
4. browser gets a normal UX response from the public site

**Password Reset Flow**
- forgot-password:
  - browser calls public-site BFF
  - BFF calls `POST /v1/auth/password/forgot`
- reset-password:
  - browser submits token + new password to BFF
  - BFF calls `POST /v1/auth/password/reset`

**Authenticated Resource Flow**
- browser asks the public site for prompts/guides
- BFF resolves the local site session
- BFF forwards the `command` session token to:
  - `GET /v1/resources/prompts`
  - `GET /v1/resources/guides`
  - `GET /v1/resources/guides/{slug}`

**Failure Handling Rules**
- if `command` returns `401` for a forwarded session:
  - clear the local site session
  - treat the browser as signed out
  - redirect or return a normal signed-out response
- if `command` returns `403`:
  - do not silently retry
  - surface a normal application error
- if `command` is unavailable:
  - return a `503`-class experience from the BFF
  - do not invent a local “offline authenticated” mode

**Security Requirements**
- do not expose `X-Command-Integration-Key` to the browser
- do not expose raw `X-Command-Session` to the browser
- do not trust browser-supplied `brandKey` as the primary authority
- do not call `command` directly from browser JavaScript for normal auth/resource flows
- use CSRF protection or strict same-site/origin validation on mutating BFF routes
- clear local site session state when `command` revokes or expires the forwarded session

**Brand Context Rule For v1**
- the integration credential is the primary brand authority
- this means each public-site BFF integration is assumed to map to one brand context for v1
- explicit multi-brand per-site routing can be added later, but it should be a deliberate contract extension

**Deferred From This Pass**
- refresh-token design
- cross-site SSO
- direct browser-to-API flows
- websocket/session-stream forwarding
- multi-brand public-site routing within one frontend deployment

**Definition Of Done**
- the public site can implement login, logout, account, and resource flows without direct DB/auth coupling
- raw `command` session tokens never need to be exposed to the browser
- integration credential and forwarded session remain separate in docs and code
