# Codex rules — Automation Portfolio

These instructions apply to this repository and its portfolio projects.

## Ownership and working model

Preserve the operating model:
- ChatGPT handles business analysis, broad external research, requirements, acceptance criteria, and an optional `PROJECT_BRIEF.md` handoff for a new project.
- Main Codex inspects the actual repository and, when authorized, the real runtime. It owns final implementation architecture, n8n/code/SQL, testing, documentation, Git, deployment, and verification.
- Gemini is an optional read-only advisor for targeted research or cross-checking.
- Second Codex is an optional read-only reviewer for material high-risk engineering uncertainty.

Business analysis, system analysis, architecture, implementation, QA, DevOps, and Tech Lead review are responsibilities, not mandatory sequential role passes. Do not restore the old nine-role prompt or `MICRO / FEATURE / NEW SYSTEM` routing.

## Portfolio standard

Treat each portfolio project as a coherent, deployment-ready system with an isolated safe demo path, not as a mock-only prototype. Show the production path relevant to the project: persistence, real integration boundaries, retries, failure recovery, observability, replay, and operational controls. Apply only the elements the system actually needs; do not add infrastructure or documents merely to satisfy a generic checklist.

Never claim production verification for an integration that was not exercised with dedicated authorized credentials. Distinguish clearly among implemented, statically verified, demo-tested, deployment-ready, and production-verified behavior. Credentials, account-specific IDs, final destinations, private data, and secrets remain deployment configuration and must not be committed.

For a bounded edit, inspect the target and affected connections, make the smallest coherent change, run the checks relevant to that behavior once, inspect the final diff, and deliver. Expand analysis for state, DB, concurrency, external actions, security boundaries, migrations, or new infrastructure only where a concrete risk requires it. Do not repeatedly reread unchanged files, restart broad research, create formal reports for each responsibility, or invoke advisors automatically.

## Scope and safety

Work only on the requested portfolio project and preserve unrelated user changes. Do not modify, execute, publish, activate, deactivate, or delete live n8n workflows or other production resources unless the user explicitly places that external action in scope. A repository edit is not deployment authorization.

Prefer native n8n nodes, simple expressions, standard integrations, and existing project structure. Verify unfamiliar or version-sensitive nodes and parameters from current documentation. Preserve node names, references, credentials, and working behavior unless the task requires changing them. Never expose secrets, credential values, tokens, cookies, private pinned data, or execution data.

Select tests from the changed behavior. Use safe fixtures or an isolated demo path for actions that send messages, write data, spend money, or affect an external account. Separate executed tests from static or simulated verification. Do not run production side effects merely to claim a real test.

## Recovery and Git

Git is the version history. Do not automatically create `.bak`, `.backup`, `pre-*`, timestamped snapshots, duplicate workflow copies, or `PROJECT_LOG.md` entries for routine assumptions. Local code, documentation, configuration, demo assets, and new workflows require no pre-change backup. When a project already uses `PROJECT_LOG.md` or another state file, update it only for material architecture decisions, verified results, open risks, or continuity facts changed by the task, and fold that update into the result commit.

Before the first authorized mutation of an existing remote workflow in one coherent task, fetch its exact current definition once and identify a recoverable baseline. Reuse the committed canonical export when it already matches. Otherwise save one secret-free restorable definition at the existing canonical path and make one local baseline commit. A pre-change push is not required for a reversible workflow-definition edit. Preserve distinct draft and published definitions when both are required for restoration.

Reuse the same baseline through implementation, debugging, validation, and review. Do not checkpoint each node edit or stage transition. If another actor changes the remote workflow, reconcile that external change before overwriting it.

If the task changed a remote workflow, fetch and verify the result once, update the same canonical export, and include it in one result commit. For repository-only portfolio work, make one coherent result commit when useful. Stage explicit intended paths and push once when publication is part of the task and safe under any deployment-connected branch rules.

## Documentation and delivery

Keep the primary README, case study, diagrams, workflow export, and demo instructions consistent with material behavior, but update only affected artifacts. Do not generate portfolio scaffolding, dashboards, diagrams, research dumps, or duplicate state files without a concrete need.

Deliver concisely: changed behavior, verification actually performed, Git/publication state, and material limitations. Mention advisors only when used. Stop only for a specific unsafe ambiguity, missing required access or recovery, an unauthorized irreversible effect, or a business choice whose alternatives materially change the outcome.
