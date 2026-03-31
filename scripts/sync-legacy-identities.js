#!/usr/bin/env node

const lines = [
  "Legacy identity bridge tooling has been retired in the command repo.",
  "",
  "Why:",
  "- ExternalUser.legacyUserId is no longer part of the shared database schema.",
  "- Legacy identity migration is no longer a supported operator workflow.",
  "",
  "Do not run the old identity audit/sync commands against this install.",
  "Use the command back office for current identity operations instead.",
];

console.error(lines.join("\n"));
process.exit(1);
