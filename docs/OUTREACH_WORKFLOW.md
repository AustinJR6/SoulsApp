## Outreach Workflow

This app uses backend workflow sessions for outreach.

### Manifest flow

1. Open `Outreach` tab.
2. Tap `Run Manifest Workflow (2 prospects)`.
3. Wait for session creation and open session details.
4. Review generated drafts in `Outreach > Draft Approval Queue`.
5. Approve or reject drafts.
6. Send approved drafts and monitor responses.

### Chat + outreach rule

When `outreach`/`work_sessions` tools are active in chat and the assistant returns a workflow session UUID, the app rewrites the message into:

- `session_id`
- `dashboard_path` (`/(tabs)/outreach/session/{session_id}`)

This keeps users aligned with dashboard-based workflow execution instead of ad-hoc chat outputs.
