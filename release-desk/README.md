# Release Desk app

Zero-dependency Vercel functions that connect GitHub Actions, a GitHub App and Slack.

| Endpoint | Called by | Does |
|---|---|---|
| `POST /api/notify` | `on-pr.yml` after the sandbox deploy | Posts (or refreshes) the approval card; records the Slack message in a hidden PR comment |
| `POST /api/slack` | Slack interactivity | **Approve & ship** → merges the PR (only if the head commit is the one on the card) · **Request changes** → modal → PR comment |
| `POST /api/deployed` | `on-merge.yml` after the production deploy | Marks the card live / failed and replies in its thread |
| `GET /api/health` | you | Which settings are present (never their values) |

Only the Slack user in `APPROVER_SLACK_ID` can approve or send back changes.

## Environment variables
`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `APPROVER_SLACK_ID`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
`NOTIFY_TOKEN` (shared with the repo secret `RELEASE_DESK_TOKEN`), optional `REVIEW_CHANNEL` (otherwise the card is a DM to the approver).
