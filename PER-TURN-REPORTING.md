# Automatic engineering work reporting

Packet: RTA-PER-TURN-REPORTING-P0-g0001. This source is prepared for one owner activation decision. It is not installed or deployed.

Native Codex command hooks observe turn start, admitted source changes, recognizable test exits, Stop and Interrupt. The reporter commits sanitized observations to a local SQLite outbox before transmitting HMAC-authenticated events. A dedicated, hidden user-process helper retries queued observations; it creates no Windows task or service. Separate Spock and RemoCommand writer keys cannot impersonate the other lane. Credentials are new, user-bound DPAPI files on each machine and a new Edge Function secret; they never enter Git or public records.

The browser polls the new read-only projection every two seconds. Work appears under the server-bound MB card and in its lane. A healthy-path observation-to-visible-card target is ten seconds. Cold starts, outages, a suspended browser, blocked hooks or an unbound workspace can miss this target; the implementation reports delayed, unknown or not verified instead of inventing work. The production target is qualified only after native coding-turn trials on both actual machines.

Milestone states, counters, accepted receipts, acceptance dates and evidence cutoff remain governed by the existing status feed and acceptance rules. Work events have no milestone-disposition field or write operation. Engineer-reported finished work is not independent acceptance, integration or deployment. The old ten-minute receipt reconciliation remains a recovery and acceptance-evidence check, not the per-turn transport.

## Exact mapping and source ceiling

The proposed initial mapping is in reporting/bindings.json and supabase/seed-bindings.sql. Spock integration work maps to MB-01, RemoCommand professional membership/security to MB-03, Creator workbench to MB-12, and dashboard support has no MB assignment. The Creator mapping is explicitly proposed for owner admission; the legacy packet number does not establish it. Approving the activation request admits these reporting assignments only.

Every coding workspace must have one explicit protected local binding: id, lane, canonical source Git root, optional explicit native context_root, optional verified origin suffix, admitted relative source_paths and public-safe next_action. By default the source root is also the native hook cwd. If a chat retains another working directory, an explicit protected context_root binds that native context to its assigned source checkout. Only one assignment may match a context; duplicates refuse delivery. An ambiguous or missing assignment is refused. No title matching, transcript parsing or inferred MB number is used. A workspace switch or new packet needs its exact assignment and source ceiling registered before it is claimed as covered. Packet admission can authorize that bookkeeping; it cannot promote milestone status. At every packet switch, establish the explicit context-to-source assignment once under its existing packet admission; subsequent turns report automatically. A different checkout is never inferred from a prompt or a pathname inside a tool command. Verify that actual hook context and assigned source match during activation qualification.

Server binding identities are immutable. A new assignment gets a new id; previous event mappings remain frozen. Never recycle a writer generation or erase its SQLite sequence/history. Recovery after lost local state requires a new server writer id/key generation, not resetting the old sequence.

## Agent closeout

UserPromptSubmit supplies the exact local summary command in private hook context. Before Stop, the agent sends JSON on stdin with exactly completed, remaining, blockers arrays and a next_action string. It contains only public-safe engineering facts. Counts of observed files and recognized test commands do not depend on this semantic summary. If a coding turn omits it, the card says REPORT INCOMPLETE. Reporting never creates a continuation turn or blocks product coding.

Source observations hash only admitted paths, including initially absent new files. No prompts, transcripts, native session ids, process ids, argv, raw tool output, private URLs or credentials are uploaded. Recognition of a test command is deliberately narrow; unknown wrappers are not counted as passed checks. Counts are test-command exits, not individual assertions. The native hook trial must verify the actual Codex tool-response shape before accepting test reporting.

## Activation and stop gates

Use only the exact external owner request and its full source manifest. Native installation requires Python 3.11+, verified machine/lane/repository identities, existing-hook snapshots, and Codex hook trust review. Installing a file does not trust it. Merge the five handlers additively and preserve existing handlers. Do not install on an unsupported RemoCommand runtime or guess its account/repository; fail qualification and report the concrete mismatch.

Deploy the additive SQL and new function only under that grant. Verify anonymous writes/private-table reads are denied, RLS is enabled, lane separation, predecessor sequences, approved mappings and sanitized GET output. No existing heartbeat or acceptance table is changed. The public browser receives only a safe projection. Production backend credentials remain inside the function; new writer keys are provisioned through protected channels, never chat.

tools/publish-turn-release.mjs defaults to dry run. Its exact private grant contains previous/candidate static Git blob maps, all candidate static SHA-256 values, source commit and owner authorization. It accepts the approved old static tree with any latest verified JSON feed, creates a child of the actual current public head, preserves that feed blob, and refuses concurrent branch drift through a non-forced ref update. Rollback restores only the exact prior static map and preserves the current feed. Verify both GitHub and Pages bytes; a GitHub commit alone is not live-readback success.

Pause the ten-minute updater during activation. Preserve the old private authority and sealed records, then create a separate new authority/addendum pinned to the approved candidate static tree; keep the one-path JSON publication ceiling. Update the existing same-chat automation to those records and resume its original quiet notification policy after readback. No new chat or coordination message is required.

Rollback removes only the exact installed hook groups, restores original hook bytes when no foreign changes intervened, stops only the dedicated retry helper through its STOP file, restores the previous static package while retaining the feed, deactivates new bindings/revokes the two new RPCs, disables the new function and removes only its new writer secret. Retain all outbox and server event history. Never drop/reset existing authority, tasks, heartbeats or milestone evidence.

## Local qualification

Run node --test tests/status.test.mjs tests/turn.test.mjs and native Windows unittest tests/test_reporter.py. The local-stack and driver fixtures use disposable repositories, test-only keys and an isolated PostgreSQL container without a host database port. They exercise the actual reporter, Edge handler, native SQL and browser cards. They are not native RemoCommand machine execution or a production WAN qualification. The separate activation request requires those final trials and rollback on a ten-second healthy-path miss, privacy failure, mapping error, native hook incompatibility or acceptance-state drift.
