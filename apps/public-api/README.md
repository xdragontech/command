# public-api

Reusable public service/API for public-site BFF integrations.

Current v1 ownership:
- external auth/session
- account read/update
- password reset
- guides/prompts/resources

Important current constraint:
- the v1 integration registry is env-backed, not DB-backed
- use `COMMAND_PUBLIC_INTEGRATIONS_JSON`
- each integration entry must include:
  - `key`
  - `brandKey`
  - `publicOrigin`

Example:

```json
[
  {
    "name": "xdragon-preview",
    "key": "replace-me",
    "brandKey": "xdragon",
    "publicOrigin": "https://staging.xdragon.tech"
  }
]
```

This app is the network contract boundary for public websites.
