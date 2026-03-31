# AGENTS-REVIEW: Repo Actions Dialog

> Verification checklist for the `RepoActionsDialog` component.
> Run through this after any modification to `action-registry.ts` or `RepoActionsDialog.tsx`.

## Pre-flight

- [ ] Navigate to any repo workspace page (e.g. `/repos/jmbish04/core-github-api`)
- [ ] Verify `Cmd+K` keyboard shortcut toggles the dialog
- [ ] Verify the "Repo Actions" button in the header opens the same dialog
- [ ] Verify dialog closes on `Esc` or backdrop click

## Sidebar Navigation

- [ ] All 5 categories visible: Jules Commands, Design, Operations, Maintenance, Observability
- [ ] Category labels have distinct accent colours (purple, pink, amber, emerald, cyan)
- [ ] Clicking an action highlights it in the sidebar
- [ ] First action is pre-selected on open

## Content Pane

- [ ] Breadcrumb updates: `Repo Actions > [Category] > [Action Label]`
- [ ] Action icon, title, and category badge display correctly
- [ ] Description box is populated for every action
- [ ] "How it works" section appears for actions with `instructions`
- [ ] "Your Prompt" textarea appears **only** for "Create PR from Prompt"

## Action Execution

| Action | Expected Behavior |
|---|---|
| Create a Plan | Toast → "Dispatching Create a Plan..." → success/error |
| Create PR from Prompt | Textarea required → Run button disabled until input → dispatches |
| DocString Normalizer | Jules dispatch toast |
| Optimizer | Jules dispatch toast |
| Security Audit | Jules dispatch toast |
| Update Dependencies | Jules dispatch toast |
| Generate Landing Page | Jules dispatch toast |
| Design Frontend | Jules dispatch toast |
| **Sync Default Secrets** | Direct sync (no Jules) → success toast with secret count |
| Clean Up Code | Jules dispatch toast |
| Setup CI/CD | Jules dispatch toast |
| Show Recent Logs | Jules dispatch toast |
| Check Build Status | Jules dispatch toast |
| Prioritize Pending PRs | Jules dispatch toast |

## Responsive Behavior

- [ ] On `md+` screens: sidebar + content pane side-by-side
- [ ] On smaller screens: sidebar hidden, content pane fills dialog

## Error States

- [ ] Run action with empty textarea on "Create PR from Prompt" → button stays disabled
- [ ] API failure on Jules dispatch → error toast with message
- [ ] API failure on Sync Secrets → error toast with message
