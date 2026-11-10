# Release Desk — POC

Proof of concept: **Salesforce changes reach production only when an approver clicks "Approve & ship" in Slack.**
The builder never holds production credentials or the ability to push to `main`.

> Toy metadata only. Both orgs are Developer Edition orgs standing in for a real sandbox and production.
> Credentials live in GitHub Environment secrets, never in this repo.

## Topology

| Role | Org | GitHub Environment | Who can use it |
|---|---|---|---|
| Sandbox | 21B Dev 2 | `Sandbox` | any branch (PR builds) |
| Production | 21B Dev 1 | `Production` | `main` only |

## Flow

```
feature branch ──PR──► on-pr.yml ──► deploy to Sandbox (21B Dev 2)
                                      │  (step 3: Playwright captures screenshots/video)
                                      ▼
                       Slack card to the approver  (step 2)
                                      │  Approve & ship
                                      ▼
                       merge to main ──► on-merge.yml ──► deploy to Production (21B Dev 1)
```

## Guardrails
- **Ruleset on `main`:** no direct pushes, no force-pushes, no deletion — changes arrive by PR only.
- **`Production` environment** is restricted to the `main` branch, so a workflow on a feature branch can't read the
  production credentials.
- Pull requests from forks never receive secrets (GitHub default).

## Status
- [x] Step 1 — repo, pipeline, ruleset, environments
- [ ] Step 2 — Slack approval app (Approve & ship → merge)
- [ ] Step 3 — Playwright demo capture + plain-English change summary on the card
- [ ] Step 4 — rehearsal, then live demo
