# Existing Road-to-Alpha dashboard: live engineering status

The existing dashboard layout, two lane cards, 32 grouped MB cards, descriptions, historical evidence, December10 target and Supabase heartbeat polling are retained. `investor.html` is unchanged.

The browser reads the same-origin `road-to-alpha-status.json` every60seconds. Its Content Security Policy permits this exact same-origin connection; both added scripts have hash-pinned CSP and Subresource Integrity. No private evidence, Drive URL, native identifier or credential is required by the browser.

## What updates

`tools/refresh-status.mjs` reads a private normalized ingest registry, checks exact frozen Git commit/tree identities, checks retained accepted-envelope bytes/hashes, checks current public GitHub metadata, reconciles authorized receipts and atomically generates a new revision. It does not publish. The private registry and raw evidence stay outside this public repository.

The requested updater is a ten-minute recurring heartbeat in the existing owner chat. It uses the connected Drive reader for the authorized coordination channels and explicitly identified audit envelopes, retains raw receipts privately, validates their declared identities and writes only public-safe normalized fields. Unknown, conflicting, missing or unauthenticated receipts remain unverified and require a decision; source acceptance is not inferred from a Git commit, machine heartbeat or executor test report. Accepted C2a/C1b source dispositions are independently established by the human-relayed ChatGPT handoff and exact envelope identities; pending canonical ledger synchronization is a separate issue.

The desktop app and its computer must remain running for this local recurring updater. Published data remains available on GitHub Pages when the computer is offline. A feed older than20minutes visibly becomes STALE, and a fetch failure retains the last good data with an error and age. This release does not depend on Windows unattended-monitor activation. Existing Supabase heartbeat polling continues every15seconds independently.

## Receipt boundary

Only the owner-relayed exact independent disposition or a separately verified independent receipt can enter the accepted-receipt registry. Supported normalized receipt kinds are `SOURCE_ACCEPTANCE` and `MILESTONE_DISPOSITION`. Both bind a raw receipt SHA-256 to the sanitized public evidence descriptor. Source acceptance requires exact commit/tree identity and an accepted date/time. A milestone disposition additionally requires explicit milestone authority, a hash of the exact prior disposition, later acceptance time, preserved governing ID/label/group and completed mandatory work before VERIFIED COMPLETE. No engine automatically signs a canonical coordination receipt.

An accepted source correction adds lane evidence and its confirmed milestone association. It never changes a milestone disposition, completion count or formal milestone cutoff. Work-item counters include unique child records and work packets explicitly associated with the milestone dataset; unmapped support corrections are excluded. Future receipts with unknown master-milestone mapping remain visible on the lane without an invented mapping.

The five timestamps are distinct: browser refresh; actual evidence-check run; latest accepted engineering event; last formal milestone disposition change; formal milestone evidence cutoff. October11Arizona remains the historical milestone cutoff. October15source acceptances are visible separately. Where the auditor supplied a date without a time, the UI says “time not supplied.”

All32 cards have expandable remaining requirements, known incomplete tasks, dependencies, next eligible action and evidence. Historical task/blocker dispositions are labeled historical. Where the requirement-level governing checklist is not available, the card explicitly says it is not yet reconciled; this system does not invent criteria from the proposed traceability register. Exact master-plan authority and later qualified milestone dispositions remain necessary for completion claims.

## Running the reviewed source

Use Node22or later. No dependency installation or package token is needed.

```text
node --test tests/status.test.mjs
node tools/refresh-status.mjs PRIVATE_REGISTRY_PATH FEED_OUTPUT_PATH PREVIOUS_VERIFIED_FEED_PATH
node tools/publish-status.mjs VERIFIED_FEED_PATH EXACT_OWNER_GRANT_PATH
```

The publication command defaults to a read-only dry run. Only a separate exact owner grant plus the explicit `--execute` flag permits an update. The grant is restricted to one repository, one branch and `road-to-alpha-status.json`; it pins the updater source hashes and every static file in the approved public tree. It uses the existing `gh` credential store, creates no publication credential, refuses unknown tree drift, checks the prior feed revision/accepted history, uses the existing GitHub file SHA for conflict protection and verifies published bytes. No page HTML or investor update is admitted by recurring runs. A code change requires a new reviewed release.

The initial source release, recurring publication permission and exact rollback are one consolidated owner decision. Until granted, neither the initial package nor recurring public feed changes are published. Windows tasks, machine restarts, telemetry sends, Supabase writes, governing Drive edits, product source changes and coordination-event writes are excluded.

## Validation and rollback

Focused tests cover authoritative source versus milestone receipts, consistent counters, unknown/missing identity, prior-disposition binding, duplicate keys, invalid/future data, integrity/privacy rejection, activity aging and exact one-path publication. Browser tests exercise60second polling, new source evidence without HTML edits, authorized milestone/card/counter changes, failed/tampered fetch retention, visible aging, expanded evidence persistence and desktop/mobile layout.

The consolidated release record carries the exact release commit, baseline, changed paths, manifest and rollback commit. Stop recurring publication before rollback. Revert only the approved release paths to their baseline bytes and verify the original index/investor hashes and Pages result; refuse a changed foreign static tree. Do not reset any authority, erase receipts or alter a governing milestone disposition to make a rollback look current.
