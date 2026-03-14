# Drizzle ORM Schema & D1 Analysis Report

## Table Names by Database

### env.DB
- agent_activities
- ai_cost_logs
- alerts
- analysis_artifacts
- applications
- automation_rules
- budget_events
- chat_messages
- chat_threads
- cloudflare_docs_interactions
- config_audit_logs
- corkboard_labels
- daily_research_docs
- daily_trends
- discord_messages
- discord_scan_log
- golden_path_config
- health_results
- health_runs
- health_test_definitions
- jules_jobs
- jules_sessions
- jules_webhook_events
- pm_epics
- pm_projects
- pm_stories
- pm_tasks
- pr_comments
- pr_overviews
- pricing_change_log
- pricing_snapshots
- project_favorites
- project_phases
- project_plans
- projects
- prompt_revisions
- pull_requests
- repo_analysis
- repo_metrics
- repo_scores
- repo_stats
- repositories
- request_logs
- research_briefs
- research_candidates
- research_execution_logs
- research_judge_logs
- research_plans
- research_projects
- research_recommendations
- research_reports
- research_sessions
- searches
- sessions
- standardization_rules
- starred_repos
- system_logs
- tag_application_mapping
- tags
- task_comments
- task_events
- tasks
- todo_ai_insights
- todo_links
- todo_tag_map
- todo_tags
- todos
- trending_repos
- user_settings
- webhook_deliveries
- workshop_agent_memory
- workshop_project_tasks
- workshop_projects
- workshop_task_events

### env.DB_WEBHOOKS
- alerts
- analysis_artifacts
- automation_rules
- daily_trends
- pr_overviews
- repo_analysis
- repo_scores
- repositories
- research_judge_logs
- research_sessions
- searches
- tags
- trending_repos
- webhook_deliveries

---

## Code Files Interacting with D1 Tables

### `backend/scripts/generate-landing-cli.ts`
- **Tables Imported:** repositories, searches

### `backend/src/ai/agents/CloudflareDocs.backup.ts`
- **Tables Imported:** sessions, tasks

### `backend/src/ai/agents/CloudflareDocs.ts`
- **Tables Imported:** sessions, tasks

### `backend/src/ai/agents/DeepReasoning.ts`
- **Tables Imported:** tasks

### `backend/src/ai/agents/HealthDiagnostician.ts`
- **Tables Imported:** health_results, jules_jobs, tasks

### `backend/src/ai/agents/JulesOverseer.ts`
- **Tables Imported:** alerts, jules_jobs, jules_sessions, sessions, tasks

### `backend/src/ai/agents/Research.ts`
- **Tables Imported:** repositories

### `backend/src/ai/agents/ResearchOrchestrator.ts`
- **Tables Imported:** analysis_artifacts, repo_scores, repositories, research_sessions

### `backend/src/ai/agents/SoftwareEngineer.ts`
- **Tables Imported:** tasks

### `backend/src/ai/agents/Supervisor.ts`
- **Tables Imported:** sessions

### `backend/src/ai/agents/TopicOrchestrator.ts`
- **Tables Imported:** research_briefs, research_candidates, research_plans

### `backend/src/ai/agents/base/HonoBaseAgent.ts`
- **Tables Imported:** cloudflare_docs_interactions

### `backend/src/ai/agents/base/orchestrator.ts`
- **Tables Imported:** tasks

### `backend/src/ai/agents/base/patterns/orchestrator-workers.ts`
- **Tables Imported:** tasks

### `backend/src/ai/agents/base/patterns/parallelization.ts`
- **Tables Imported:** tasks

### `backend/src/ai/agents/github/Owner.ts`
- **Tables Imported:** automation_runs, events, repositories

### `backend/src/ai/agents/github/Repo.ts`
- **Tables Imported:** events, repositories

### `backend/src/ai/agents/workshop/CfAgentsSdk.ts`
- **Tables Imported:** tasks

### `backend/src/ai/agents/workshop/WorkshopAgent.ts`
- **Tables Imported:** applications, tasks, workshop_project_tasks, workshop_projects

### `backend/src/ai/fallbackLogger.ts`
- **Tables Imported:** request_logs

### `backend/src/ai/mcp/tools.ts`
- **Tables Imported:** repositories, sessions, tags

### `backend/src/ai/mcp/tools/github/github.ts`
- **Tables Imported:** projects, repositories

### `backend/src/ai/mcp/tools/github/github_merge_me.ts`
- **Tables Imported:** repositories, tags

### `backend/src/ai/mcp/tools/github/migration-pillars.ts`
- **Tables Imported:** tags

### `backend/src/ai/mcp/tools/github/repo-analysis.ts`
- **Tables Imported:** repositories, tags

### `backend/src/ai/mcp/tools/github/repo-analyzer.ts`
- **Tables Imported:** tags

### `backend/src/ai/mcp/tools/github/shared.ts`
- **Tables Imported:** repositories

### `backend/src/ai/mcp/tools/github_repos.ts`
- **Tables Imported:** repositories

### `backend/src/ai/mcp/tools/index.ts`
- **Tables Imported:** tags

### `backend/src/ai/mcp/tools/orchestration.ts`
- **Tables Imported:** sessions, tags

### `backend/src/ai/mcp/tools/orchestration/cloudflare-docs.ts`
- **Tables Imported:** tags

### `backend/src/ai/mcp/tools/sandbox-sdk/session-manager.ts`
- **Tables Imported:** sessions

### `backend/src/ai/mcp/tools/vectorize-helper.ts`
- **Tables Imported:** code_review_comment_enrichments, code_review_comments, repositories

### `backend/src/ai/mcp/tools/vectorize.ts`
- **Tables Imported:** searches

### `backend/src/ai/mcp/types.ts`
- **Tables Imported:** tags

### `backend/src/ai/providers/index.ts`
- **Tables Imported:** tags

### `backend/src/ai/providers/worker-ai.ts`
- **Tables Imported:** tasks

### `backend/src/ai/utils/budget-tracker.ts`
- **Tables Imported:** ai_cost_logs, budget_events, sessions

### `backend/src/ai/utils/model-config.ts`
- **Tables Imported:** tasks

### `backend/src/ai/utils/sanitizer.ts`
- **Tables Imported:** tags

### `backend/src/ai/utils/streaming.ts`
- **Tables Imported:** tasks

### `backend/src/alerts/config.ts`
- **Tables Imported:** alerts

### `backend/src/alerts/index.ts`
- **Tables Imported:** alerts

### `backend/src/cloudflare/admin.ts`
- **Tables Imported:** projects

### `backend/src/config/jules-standards.ts`
- **Tables Imported:** sessions, tasks

### `backend/src/db/schemas/agents/budget.ts`
- **Tables Imported:** ai_cost_logs, alerts, budget_events

### `backend/src/db/schemas/agents/chat.ts`
- **Tables Imported:** chat_messages, chat_threads, repositories

### `backend/src/db/schemas/agents/cloudflare-docs-interactions.ts`
- **Tables Imported:** cloudflare_docs_interactions

### `backend/src/db/schemas/agents/events.ts`
- **Tables Imported:** agent_activities, automation_runs, events

### `backend/src/db/schemas/agents/jules.ts`
- **Tables Imported:** jules_jobs, jules_sessions

### `backend/src/db/schemas/agents/pricing.ts`
- **Tables Imported:** pricing_change_log, pricing_snapshots

### `backend/src/db/schemas/agents/prompt-revisions.ts`
- **Tables Imported:** prompt_revisions

### `backend/src/db/schemas/agents/research.ts`
- **Tables Imported:** analysis_artifacts, repo_scores, research_sessions, sessions

### `backend/src/db/schemas/app/alerts.ts`
- **Tables Imported:** alerts

### `backend/src/db/schemas/app/applications.ts`
- **Tables Imported:** applications

### `backend/src/db/schemas/app/automation_rules.ts`
- **Tables Imported:** automation_rules

### `backend/src/db/schemas/app/config.ts`
- **Tables Imported:** config_audit_logs

### `backend/src/db/schemas/app/golden_path.ts`
- **Tables Imported:** golden_path_config

### `backend/src/db/schemas/app/index.ts`
- **Tables Imported:** alerts, applications, sessions, tags

### `backend/src/db/schemas/app/sessions.ts`
- **Tables Imported:** sessions

### `backend/src/db/schemas/app/settings.ts`
- **Tables Imported:** organization_settings, user_settings

### `backend/src/db/schemas/app/standardization.ts`
- **Tables Imported:** standardization_rules

### `backend/src/db/schemas/app/tag_application_mapping.ts`
- **Tables Imported:** applications, tag_application_mapping, tags

### `backend/src/db/schemas/app/tags.ts`
- **Tables Imported:** tags

### `backend/src/db/schemas/discord/index.ts`
- **Tables Imported:** discord_messages, discord_scan_log

### `backend/src/db/schemas/github/favorites.ts`
- **Tables Imported:** project_favorites

### `backend/src/db/schemas/github/index.ts`
- **Tables Imported:** tasks

### `backend/src/db/schemas/github/pr_overviews.ts`
- **Tables Imported:** pr_overviews

### `backend/src/db/schemas/github/prs.ts`
- **Tables Imported:** pr_comments, pull_requests

### `backend/src/db/schemas/github/repos.ts`
- **Tables Imported:** operation_logs, repo_ai_context, repo_infra, repo_metrics, repo_stats, repo_tags, repo_tech_stack, repositories

### `backend/src/db/schemas/github/research.ts`
- **Tables Imported:** research_briefs, research_candidates, research_execution_logs, research_plans, research_projects, research_recommendations, research_reports

### `backend/src/db/schemas/github/reviews.ts`
- **Tables Imported:** code_review_comment_enrichments, code_review_comments, code_review_runs, tags

### `backend/src/db/schemas/github/stars.ts`
- **Tables Imported:** repositories, starred_repos

### `backend/src/db/schemas/github/webhooks.ts`
- **Tables Imported:** daily_trends, repo_analysis, research_judge_logs, searches, trending_repos, webhook_deliveries

### `backend/src/db/schemas/index.ts`
- **Tables Imported:** projects

### `backend/src/db/schemas/jules/index.ts`
- **Tables Imported:** jules_jobs, jules_sessions, jules_webhook_events, sessions

### `backend/src/db/schemas/jules/jobs.ts`
- **Tables Imported:** jules_jobs, sessions

### `backend/src/db/schemas/jules/sessions.ts`
- **Tables Imported:** jules_sessions, sessions

### `backend/src/db/schemas/jules/webhook-events.ts`
- **Tables Imported:** alerts, jules_webhook_events

### `backend/src/db/schemas/logs/health.ts`
- **Tables Imported:** health_results, health_runs, health_test_definitions

### `backend/src/db/schemas/logs/logs.ts`
- **Tables Imported:** request_logs

### `backend/src/db/schemas/logs/system.ts`
- **Tables Imported:** system_logs

### `backend/src/db/schemas/projects/hierarchy.ts`
- **Tables Imported:** pm_epics, pm_projects, pm_stories, pm_tasks, tasks

### `backend/src/db/schemas/projects/index.ts`
- **Tables Imported:** corkboard_labels, pm_epics, pm_projects, pm_stories, pm_tasks, project_phases, project_plans, projects, task_comments, task_events, tasks, todo_ai_insights, todo_links, todo_tag_map, todo_tags, todos

### `backend/src/db/schemas/projects/plans.ts`
- **Tables Imported:** project_plans

### `backend/src/db/schemas/projects/roadmap.ts`
- **Tables Imported:** project_phases, projects, repositories, tasks

### `backend/src/db/schemas/projects/tasks.ts`
- **Tables Imported:** task_comments, task_events, tasks

### `backend/src/db/schemas/projects/todos.ts`
- **Tables Imported:** corkboard_labels, todo_ai_insights, todo_links, todo_tag_map, todo_tags, todos

### `backend/src/db/schemas/webhooks/task_events.ts`
- **Tables Imported:** projects, tasks, workshop_project_tasks, workshop_projects, workshop_task_events

### `backend/src/db/schemas/workflows/daily-research.ts`
- **Tables Imported:** daily_research_docs

### `backend/src/db/schemas/workshop/agent_memory.ts`
- **Tables Imported:** projects, workshop_agent_memory, workshop_projects

### `backend/src/db/schemas/workshop/index.ts`
- **Tables Imported:** projects

### `backend/src/db/schemas/workshop/project_tasks.ts`
- **Tables Imported:** projects, tasks, workshop_project_tasks, workshop_projects

### `backend/src/db/schemas/workshop/projects.ts`
- **Tables Imported:** projects, workshop_projects

### `backend/src/db/validation.ts`
- **Tables Imported:** repositories

### `backend/src/health/coordinator.ts`
- **Tables Imported:** health_results, health_runs, health_test_definitions

### `backend/src/health/health-check.ts`
- **Tables Imported:** health_runs

### `backend/src/index.ts`
- **Tables Imported:** applications, projects, repositories, request_logs, research_briefs, sessions, tags, tasks, todos, trending_repos

### `backend/src/lib/crud-factory.ts`
- **Tables Imported:** tags

### `backend/src/lib/email-reports.ts`
- **Tables Imported:** repo_scores, repositories, research_sessions, tags

### `backend/src/lib/logger.ts`
- **Tables Imported:** system_logs

### `backend/src/lib/research-logger.ts`
- **Tables Imported:** research_execution_logs

### `backend/src/routes/api/agents/cloudflare-docs-prompt.ts`
- **Tables Imported:** prompt_revisions

### `backend/src/routes/api/agents/cloudflare-docs-revisions.ts`
- **Tables Imported:** prompt_revisions

### `backend/src/routes/api/agents/jules.ts`
- **Tables Imported:** jules_jobs

### `backend/src/routes/api/agents/specialists.ts`
- **Tables Imported:** tags

### `backend/src/routes/api/agents/transcribe.ts`
- **Tables Imported:** tags

### `backend/src/routes/api/agents/workshop-chat.ts`
- **Tables Imported:** tags

### `backend/src/routes/api/frontend/ai/chat.ts`
- **Tables Imported:** chat_messages, chat_threads

### `backend/src/routes/api/frontend/alerts.ts`
- **Tables Imported:** alerts

### `backend/src/routes/api/frontend/planner/tasks.ts`
- **Tables Imported:** projects, task_comments, task_events, tasks

### `backend/src/routes/api/frontend/planner/timeline.ts`
- **Tables Imported:** agent_activities

### `backend/src/routes/api/frontend/planner/todos.ts`
- **Tables Imported:** corkboard_labels, tags, todo_ai_insights, todo_links, todo_tag_map, todo_tags, todos

### `backend/src/routes/api/frontend/projects/appstore.ts`
- **Tables Imported:** applications, projects, tag_application_mapping, tags

### `backend/src/routes/api/frontend/projects/base.ts`
- **Tables Imported:** projects, repositories

### `backend/src/routes/api/frontend/projects/favorites.ts`
- **Tables Imported:** project_favorites, repositories

### `backend/src/routes/api/frontend/projects/hierarchy.ts`
- **Tables Imported:** pm_epics, pm_projects, pm_stories, pm_tasks, projects, tasks

### `backend/src/routes/api/frontend/projects/index.ts`
- **Tables Imported:** projects

### `backend/src/routes/api/frontend/projects/infrastructure.ts`
- **Tables Imported:** projects, repositories

### `backend/src/routes/api/frontend/projects/planner.ts`
- **Tables Imported:** project_phases, project_plans, projects, repositories, tasks

### `backend/src/routes/api/frontend/projects/stars.ts`
- **Tables Imported:** repo_metrics, repositories, starred_repos

### `backend/src/routes/api/frontend/projects/utils.ts`
- **Tables Imported:** projects, repositories

### `backend/src/routes/api/frontend/research/daily-research-ingest.ts`
- **Tables Imported:** daily_research_docs

### `backend/src/routes/api/frontend/research/daily-research.ts`
- **Tables Imported:** research_recommendations

### `backend/src/routes/api/frontend/research/daily-trends.ts`
- **Tables Imported:** daily_trends

### `backend/src/routes/api/frontend/research/research-projects.ts`
- **Tables Imported:** projects, research_projects, research_reports

### `backend/src/routes/api/frontend/research/research.ts`
- **Tables Imported:** research_briefs, research_candidates, research_execution_logs

### `backend/src/routes/api/frontend/settings.ts`
- **Tables Imported:** config_audit_logs, golden_path_config, user_settings

### `backend/src/routes/api/frontend/stats.ts`
- **Tables Imported:** repo_stats

### `backend/src/routes/api/frontend/workshop.ts`
- **Tables Imported:** tasks, workshop_agent_memory, workshop_project_tasks, workshop_projects, workshop_task_events

### `backend/src/routes/api/health.ts`
- **Tables Imported:** health_runs

### `backend/src/routes/api/jules/index.ts`
- **Tables Imported:** jules_jobs, jules_sessions, jules_webhook_events, sessions

### `backend/src/routes/api/ops/health.ts`
- **Tables Imported:** health_test_definitions

### `backend/src/routes/api/ops/standards.ts`
- **Tables Imported:** standardization_rules

### `backend/src/routes/api/ops/workflows.ts`
- **Tables Imported:** automation_rules

### `backend/src/routes/api/projects/tasks.ts`
- **Tables Imported:** projects, tasks, workshop_project_tasks

### `backend/src/routes/api/services/github/gh-actions.ts`
- **Tables Imported:** research_judge_logs

### `backend/src/routes/api/services/github/pr-overview.ts`
- **Tables Imported:** pr_overviews, webhook_deliveries

### `backend/src/routes/api/services/github/trending-repos.ts`
- **Tables Imported:** trending_repos

### `backend/src/routes/api/webhooks/handlers/flows/index.ts`
- **Tables Imported:** repositories, request_logs

### `backend/src/routes/api/webhooks/handlers/flows/workflowTemplates.ts`
- **Tables Imported:** applications, repositories, sessions, tasks

### `backend/src/routes/api/webhooks/handlers/issues.ts`
- **Tables Imported:** tasks

### `backend/src/routes/api/webhooks/index.ts`
- **Tables Imported:** alerts, automation_rules, webhook_deliveries

### `backend/src/routes/api/webhooks/jules.ts`
- **Tables Imported:** alerts, jules_sessions, jules_webhook_events

### `backend/src/routes/api/webhooks/workflows/gardener/RepoSpecialistBuilder.ts`
- **Tables Imported:** tags

### `backend/src/routes/api/webhooks/workflows/gardener/index.ts`
- **Tables Imported:** repositories

### `backend/src/routes/api/webhooks/workflows/gardener/ops/container-manager.ts`
- **Tables Imported:** tasks

### `backend/src/routes/api/webhooks/workflows/leak-plumber/index.ts`
- **Tables Imported:** alerts

### `backend/src/routes/api/webhooks/workflows/pr-agent-tagger/index.ts`
- **Tables Imported:** tags

### `backend/src/routes/api/webhooks/workflows/shared/sandbox.ts`
- **Tables Imported:** tasks

### `backend/src/routes/rpc/service.ts`
- **Tables Imported:** repositories

### `backend/src/services/appstore-ai.ts`
- **Tables Imported:** tags, tasks

### `backend/src/services/appstore-worker-ai.ts`
- **Tables Imported:** tags, tasks

### `backend/src/services/github/mcp-config.ts`
- **Tables Imported:** repositories

### `backend/src/services/github/pr-ingestion.ts`
- **Tables Imported:** pr_comments, pull_requests

### `backend/src/services/jules/jules.ts`
- **Tables Imported:** jules_sessions, pull_requests

### `backend/src/services/jules/service.ts`
- **Tables Imported:** jules_jobs, jules_sessions, pull_requests, sessions

### `backend/src/services/landing-generator/analyzer.ts`
- **Tables Imported:** tags, tasks

### `backend/src/services/landing-generator/blueprint.ts`
- **Tables Imported:** repositories, tags

### `backend/src/services/landing-generator/index.ts`
- **Tables Imported:** projects

### `backend/src/services/landing-generator/service.ts`
- **Tables Imported:** projects

### `backend/src/services/landing-generator/types.ts`
- **Tables Imported:** tags

### `backend/src/services/pricing-scraper.ts`
- **Tables Imported:** pricing_change_log, pricing_snapshots

### `backend/src/services/repository-sync.ts`
- **Tables Imported:** projects, repositories

### `backend/src/services/standardization.ts`
- **Tables Imported:** projects, standardization_rules, tags

### `backend/src/services/stats-updater.ts`
- **Tables Imported:** repo_stats

### `backend/src/services/todoInsights.ts`
- **Tables Imported:** tags, todo_ai_insights, todo_links, todos

### `backend/src/types/github/webhooks.ts`
- **Tables Imported:** repositories

### `backend/src/utils/email/send/repo-discovery.ts`
- **Tables Imported:** tags

### `backend/src/utils/github/configs.ts`
- **Tables Imported:** projects, repositories

### `backend/src/utils/openapi.ts`
- **Tables Imported:** pull_requests, repositories, sessions, tags

### `backend/src/workflows/discord.ts`
- **Tables Imported:** discord_messages, discord_scan_log, projects, research_briefs, research_candidates

### `backend/src/workflows/health.ts`
- **Tables Imported:** webhook_deliveries

### `backend/src/workflows/research/deep.ts`
- **Tables Imported:** projects, repositories, research_recommendations

### `backend/src/workflows/research/health.ts`
- **Tables Imported:** research_recommendations

### `backend/src/workflows/research/topic.ts`
- **Tables Imported:** daily_trends, research_briefs, research_candidates, research_plans

### `backend/src/workflows/search.ts`
- **Tables Imported:** repo_analysis, repositories, searches

### `container/src/server.ts`
- **Tables Imported:** sessions

### `frontend/src/App.tsx`
- **Tables Imported:** alerts, projects, todos

### `frontend/src/components/RecentTasksCard.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/WorkshopProjectViewer.tsx`
- **Tables Imported:** projects, tasks

### `frontend/src/components/alerts/AlertBadge.tsx`
- **Tables Imported:** alerts

### `frontend/src/components/alerts/AlertTray.tsx`
- **Tables Imported:** alerts

### `frontend/src/components/assistant-ui/assistant-modal.tsx`
- **Tables Imported:** projects, tasks

### `frontend/src/components/cloudflare-chat/SystemPromptModal.tsx`
- **Tables Imported:** cloudflare_docs_interactions

### `frontend/src/components/cloudflaresdk/AddBindingDialog.tsx`
- **Tables Imported:** projects

### `frontend/src/components/cloudflaresdk/CloudflareSdkDashboard.tsx`
- **Tables Imported:** tags

### `frontend/src/components/cloudflaresdk/DeploymentsList.tsx`
- **Tables Imported:** projects

### `frontend/src/components/config/SyncSecretsConfig.tsx`
- **Tables Imported:** repositories

### `frontend/src/components/kibo-ui/editor/index.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/kibo-ui/tags/index.tsx`
- **Tables Imported:** tags

### `frontend/src/components/layout/AppSidebar.tsx`
- **Tables Imported:** projects, todos

### `frontend/src/components/layout/ProjectFolder.tsx`
- **Tables Imported:** projects

### `frontend/src/components/navigation/Sidebar.tsx`
- **Tables Imported:** projects, todos

### `frontend/src/components/project-dashboard/ProjectAssistant.tsx`
- **Tables Imported:** projects, tasks

### `frontend/src/components/project-dashboard/hierarchy/HierarchyContext.tsx`
- **Tables Imported:** projects, tasks

### `frontend/src/components/project-dashboard/hierarchy/HierarchyTable.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/project-dashboard/hierarchy/KanbanView.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/project-dashboard/tabs/PlanTab.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/project-dashboard/tabs/ProjectsTab.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/project-dashboard/tabs/UxWorkshopTab.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/project-dashboard/tabs/VibeCodingTab.tsx`
- **Tables Imported:** projects, tasks

### `frontend/src/components/projects/NewProjectDialog.tsx`
- **Tables Imported:** projects

### `frontend/src/components/settings/AlertsTab.tsx`
- **Tables Imported:** alerts

### `frontend/src/components/settings/SecretsTab.tsx`
- **Tables Imported:** repositories

### `frontend/src/components/settings/StandardizationsTab.tsx`
- **Tables Imported:** repositories

### `frontend/src/components/tools/AgentFactoryTool.tsx`
- **Tables Imported:** sessions

### `frontend/src/components/tools/registry-directory/AiAdvisorModal.tsx`
- **Tables Imported:** tags

### `frontend/src/components/tools/registry-directory/UxResearcherModal.tsx`
- **Tables Imported:** tags

### `frontend/src/components/tools/registry-directory/data.ts`
- **Tables Imported:** applications, projects

### `frontend/src/components/webhooks/EventCard.tsx`
- **Tables Imported:** automation_runs

### `frontend/src/components/webhooks/LiveEventsTab.tsx`
- **Tables Imported:** automation_runs

### `frontend/src/components/workflows/catalog.tsx`
- **Tables Imported:** repositories

### `frontend/src/components/workflows/data.tsx`
- **Tables Imported:** repositories, tasks

### `frontend/src/components/workshop/AgentHandoffFlow.tsx`
- **Tables Imported:** projects, tasks

### `frontend/src/components/workshop/DeploymentAnimation.tsx`
- **Tables Imported:** projects

### `frontend/src/components/workshop/JulesTaskPanel.tsx`
- **Tables Imported:** sessions, tasks

### `frontend/src/components/workshop/PerformanceAnalytics.tsx`
- **Tables Imported:** tasks

### `frontend/src/components/workshop/ReviewSummary.tsx`
- **Tables Imported:** projects

### `frontend/src/context/alerts-context.tsx`
- **Tables Imported:** alerts

### `frontend/src/layouts/RootLayout.tsx`
- **Tables Imported:** alerts, projects

### `frontend/src/lib/api-client.ts`
- **Tables Imported:** projects

### `frontend/src/lib/nav-config.ts`
- **Tables Imported:** alerts, projects, todos

### `frontend/src/lib/project-recents.ts`
- **Tables Imported:** projects

### `frontend/src/stores/useProjectStore.ts`
- **Tables Imported:** projects

### `frontend/src/views/Research.tsx`
- **Tables Imported:** repositories

### `frontend/src/views/control/global/Alerts.tsx`
- **Tables Imported:** alerts

### `frontend/src/views/control/global/AppStore.tsx`
- **Tables Imported:** applications, tags

### `frontend/src/views/control/global/Kanban.tsx`
- **Tables Imported:** tasks

### `frontend/src/views/control/global/PRCommandCenter.tsx`
- **Tables Imported:** projects

### `frontend/src/views/control/global/ProjectDashboard.tsx`
- **Tables Imported:** projects, tags, tasks

### `frontend/src/views/control/global/ProjectView.tsx`
- **Tables Imported:** projects, tags, tasks

### `frontend/src/views/control/global/Projects.tsx`
- **Tables Imported:** projects, repositories

### `frontend/src/views/control/global/Roadmap.tsx`
- **Tables Imported:** projects

### `frontend/src/views/control/global/Settings.tsx`
- **Tables Imported:** alerts

### `frontend/src/views/control/global/Standardization.tsx`
- **Tables Imported:** repositories

### `frontend/src/views/control/global/TaskDetails.tsx`
- **Tables Imported:** tasks

### `frontend/src/views/control/global/Todo.tsx`
- **Tables Imported:** todos

### `frontend/src/views/public/Docs.tsx`
- **Tables Imported:** jules_jobs, jules_sessions, tasks

### `frontend/src/views/public/Home.tsx`
- **Tables Imported:** repositories, sessions

### `frontend/src/views/research/DeepResearchChatPage.tsx`
- **Tables Imported:** repositories

### `frontend/src/views/research/ProjectEditorWrapper.tsx`
- **Tables Imported:** projects

### `frontend/src/views/research/ReportViewer.tsx`
- **Tables Imported:** projects

### `frontend/src/views/research/ResearchDashboard.tsx`
- **Tables Imported:** repositories

### `frontend/src/views/research/components/ConfigureCronTab.tsx`
- **Tables Imported:** projects

### `frontend/src/views/research/components/CustomJobsTab.tsx`
- **Tables Imported:** projects

### `frontend/src/views/research/components/DailyTrendsTab.tsx`
- **Tables Imported:** projects

### `frontend/src/views/research/components/ProjectEditor.tsx`
- **Tables Imported:** projects, searches

### `frontend/worker-configuration.d.ts`
- **Tables Imported:** tags, tasks

### `worker-configuration.d.ts`
- **Tables Imported:** tags, tasks

---

## env.DB d1 db
| Table Name | Short File Paths |
|---|---|
| **agent_activities** | `backend/src/routes/api/frontend/planner/timeline.ts` |
| **ai_cost_logs** | `backend/src/ai/utils/budget-tracker.ts` |
| **alerts** | `backend/src/ai/agents/JulesOverseer.ts`, `backend/src/alerts/index.ts`, `backend/src/routes/api/frontend/alerts.ts`, `backend/src/routes/api/webhooks/index.ts`, `backend/src/routes/api/webhooks/jules.ts`, `backend/src/routes/api/webhooks/workflows/leak-plumber/index.ts` |
| **analysis_artifacts** | `backend/src/ai/agents/ResearchOrchestrator.ts` |
| **applications** | `backend/src/ai/agents/workshop/WorkshopAgent.ts`, `backend/src/index.ts`, `backend/src/routes/api/frontend/projects/appstore.ts` |
| **automation_rules** | `backend/src/routes/api/ops/workflows.ts`, `backend/src/routes/api/webhooks/index.ts` |
| **budget_events** | `backend/src/ai/utils/budget-tracker.ts` |
| **chat_messages** | `backend/src/routes/api/frontend/ai/chat.ts` |
| **chat_threads** | `backend/src/routes/api/frontend/ai/chat.ts` |
| **cloudflare_docs_interactions** | `backend/src/ai/agents/base/HonoBaseAgent.ts` |
| **config_audit_logs** | `backend/src/routes/api/frontend/settings.ts` |
| **corkboard_labels** | `backend/src/routes/api/frontend/planner/todos.ts` |
| **daily_research_docs** | `backend/src/routes/api/frontend/research/daily-research-ingest.ts` |
| **daily_trends** | `backend/src/routes/api/frontend/research/daily-trends.ts`, `backend/src/workflows/research/topic.ts` |
| **discord_messages** | `backend/src/workflows/discord.ts` |
| **discord_scan_log** | `backend/src/workflows/discord.ts` |
| **golden_path_config** | `backend/src/routes/api/frontend/settings.ts` |
| **health_results** | `backend/src/ai/agents/HealthDiagnostician.ts`, `backend/src/health/coordinator.ts` |
| **health_runs** | `backend/src/health/coordinator.ts`, `backend/src/health/health-check.ts`, `backend/src/routes/api/health.ts` |
| **health_test_definitions** | `backend/src/health/coordinator.ts`, `backend/src/routes/api/ops/health.ts` |
| **jules_jobs** | `backend/src/ai/agents/HealthDiagnostician.ts`, `backend/src/ai/agents/JulesOverseer.ts`, `backend/src/routes/api/agents/jules.ts`, `backend/src/routes/api/jules/index.ts`, `backend/src/services/jules/service.ts` |
| **jules_sessions** | `backend/src/ai/agents/JulesOverseer.ts`, `backend/src/routes/api/jules/index.ts`, `backend/src/routes/api/webhooks/jules.ts`, `backend/src/services/jules/jules.ts`, `backend/src/services/jules/service.ts` |
| **jules_webhook_events** | `backend/src/routes/api/jules/index.ts`, `backend/src/routes/api/webhooks/jules.ts` |
| **pm_epics** | `backend/src/routes/api/frontend/projects/hierarchy.ts` |
| **pm_projects** | `backend/src/routes/api/frontend/projects/hierarchy.ts` |
| **pm_stories** | `backend/src/routes/api/frontend/projects/hierarchy.ts` |
| **pm_tasks** | `backend/src/routes/api/frontend/projects/hierarchy.ts` |
| **pr_comments** | `backend/src/services/github/pr-ingestion.ts` |
| **pr_overviews** | `backend/src/routes/api/services/github/pr-overview.ts` |
| **pricing_change_log** | `backend/src/services/pricing-scraper.ts` |
| **pricing_snapshots** | `backend/src/services/pricing-scraper.ts` |
| **project_favorites** | `backend/src/routes/api/frontend/projects/favorites.ts` |
| **project_phases** | `backend/src/routes/api/frontend/projects/planner.ts` |
| **project_plans** | `backend/src/routes/api/frontend/projects/planner.ts` |
| **projects** | `backend/src/ai/mcp/tools/github/github.ts`, `backend/src/index.ts`, `backend/src/routes/api/frontend/planner/tasks.ts`, `backend/src/routes/api/frontend/projects/appstore.ts`, `backend/src/routes/api/frontend/projects/base.ts`, `backend/src/routes/api/frontend/projects/hierarchy.ts`, `backend/src/routes/api/frontend/projects/infrastructure.ts`, `backend/src/routes/api/frontend/projects/planner.ts`, `backend/src/routes/api/frontend/research/research-projects.ts`, `backend/src/routes/api/projects/tasks.ts`, `backend/src/services/repository-sync.ts`, `backend/src/services/standardization.ts`, `backend/src/workflows/discord.ts`, `backend/src/workflows/research/deep.ts` |
| **prompt_revisions** | `backend/src/routes/api/agents/cloudflare-docs-prompt.ts`, `backend/src/routes/api/agents/cloudflare-docs-revisions.ts` |
| **pull_requests** | `backend/src/services/github/pr-ingestion.ts`, `backend/src/services/jules/jules.ts`, `backend/src/services/jules/service.ts` |
| **repo_analysis** | `backend/src/workflows/search.ts` |
| **repo_metrics** | `backend/src/routes/api/frontend/projects/stars.ts` |
| **repo_scores** | `backend/src/ai/agents/ResearchOrchestrator.ts`, `backend/src/lib/email-reports.ts` |
| **repo_stats** | `backend/src/routes/api/frontend/stats.ts`, `backend/src/services/stats-updater.ts` |
| **repositories** | `backend/src/ai/agents/ResearchOrchestrator.ts`, `backend/src/ai/mcp/tools/github/github.ts`, `backend/src/index.ts`, `backend/src/lib/email-reports.ts`, `backend/src/routes/api/frontend/projects/base.ts`, `backend/src/routes/api/frontend/projects/favorites.ts`, `backend/src/routes/api/frontend/projects/infrastructure.ts`, `backend/src/routes/api/frontend/projects/planner.ts`, `backend/src/routes/api/frontend/projects/stars.ts`, `backend/src/routes/api/webhooks/handlers/flows/index.ts`, `backend/src/routes/api/webhooks/workflows/gardener/index.ts`, `backend/src/services/repository-sync.ts`, `backend/src/workflows/research/deep.ts`, `backend/src/workflows/search.ts` |
| **request_logs** | `backend/src/ai/fallbackLogger.ts`, `backend/src/index.ts`, `backend/src/routes/api/webhooks/handlers/flows/index.ts` |
| **research_briefs** | `backend/src/ai/agents/TopicOrchestrator.ts`, `backend/src/index.ts`, `backend/src/routes/api/frontend/research/research.ts`, `backend/src/workflows/discord.ts`, `backend/src/workflows/research/topic.ts` |
| **research_candidates** | `backend/src/ai/agents/TopicOrchestrator.ts`, `backend/src/routes/api/frontend/research/research.ts`, `backend/src/workflows/discord.ts`, `backend/src/workflows/research/topic.ts` |
| **research_execution_logs** | `backend/src/routes/api/frontend/research/research.ts` |
| **research_judge_logs** | `backend/src/routes/api/services/github/gh-actions.ts` |
| **research_plans** | `backend/src/ai/agents/TopicOrchestrator.ts`, `backend/src/workflows/research/topic.ts` |
| **research_projects** | `backend/src/routes/api/frontend/research/research-projects.ts` |
| **research_recommendations** | `backend/src/routes/api/frontend/research/daily-research.ts`, `backend/src/workflows/research/deep.ts`, `backend/src/workflows/research/health.ts` |
| **research_reports** | `backend/src/routes/api/frontend/research/research-projects.ts` |
| **research_sessions** | `backend/src/ai/agents/ResearchOrchestrator.ts`, `backend/src/lib/email-reports.ts` |
| **searches** | `backend/src/workflows/search.ts` |
| **sessions** | `backend/src/ai/agents/JulesOverseer.ts`, `backend/src/ai/utils/budget-tracker.ts`, `backend/src/index.ts`, `backend/src/routes/api/jules/index.ts`, `backend/src/services/jules/service.ts` |
| **standardization_rules** | `backend/src/routes/api/ops/standards.ts`, `backend/src/services/standardization.ts` |
| **starred_repos** | `backend/src/routes/api/frontend/projects/stars.ts` |
| **system_logs** | `backend/src/lib/logger.ts` |
| **tag_application_mapping** | `backend/src/routes/api/frontend/projects/appstore.ts` |
| **tags** | `backend/src/index.ts`, `backend/src/lib/email-reports.ts`, `backend/src/routes/api/frontend/planner/todos.ts`, `backend/src/routes/api/frontend/projects/appstore.ts`, `backend/src/services/standardization.ts`, `backend/src/services/todoInsights.ts` |
| **task_comments** | `backend/src/routes/api/frontend/planner/tasks.ts` |
| **task_events** | `backend/src/routes/api/frontend/planner/tasks.ts` |
| **tasks** | `backend/src/ai/agents/HealthDiagnostician.ts`, `backend/src/ai/agents/JulesOverseer.ts`, `backend/src/ai/agents/workshop/WorkshopAgent.ts`, `backend/src/index.ts`, `backend/src/routes/api/frontend/planner/tasks.ts`, `backend/src/routes/api/frontend/projects/hierarchy.ts`, `backend/src/routes/api/frontend/projects/planner.ts`, `backend/src/routes/api/frontend/workshop.ts`, `backend/src/routes/api/projects/tasks.ts`, `backend/src/routes/api/webhooks/handlers/issues.ts` |
| **todo_ai_insights** | `backend/src/routes/api/frontend/planner/todos.ts`, `backend/src/services/todoInsights.ts` |
| **todo_links** | `backend/src/routes/api/frontend/planner/todos.ts`, `backend/src/services/todoInsights.ts` |
| **todo_tag_map** | `backend/src/routes/api/frontend/planner/todos.ts` |
| **todo_tags** | `backend/src/routes/api/frontend/planner/todos.ts` |
| **todos** | `backend/src/index.ts`, `backend/src/routes/api/frontend/planner/todos.ts`, `backend/src/services/todoInsights.ts` |
| **trending_repos** | `backend/src/index.ts`, `backend/src/routes/api/services/github/trending-repos.ts` |
| **user_settings** | `backend/src/routes/api/frontend/settings.ts` |
| **webhook_deliveries** | `backend/src/routes/api/services/github/pr-overview.ts`, `backend/src/routes/api/webhooks/index.ts`, `backend/src/workflows/health.ts` |
| **workshop_agent_memory** | `backend/src/routes/api/frontend/workshop.ts` |
| **workshop_project_tasks** | `backend/src/ai/agents/workshop/WorkshopAgent.ts`, `backend/src/routes/api/frontend/workshop.ts`, `backend/src/routes/api/projects/tasks.ts` |
| **workshop_projects** | `backend/src/ai/agents/workshop/WorkshopAgent.ts`, `backend/src/routes/api/frontend/workshop.ts` |
| **workshop_task_events** | `backend/src/routes/api/frontend/workshop.ts` |

## env.DB_WEBHOOKS d1 db
| Table Name | Short File Paths |
|---|---|
| **alerts** | `backend/src/routes/api/webhooks/index.ts` |
| **analysis_artifacts** | `backend/src/ai/agents/ResearchOrchestrator.ts` |
| **automation_rules** | `backend/src/routes/api/webhooks/index.ts` |
| **daily_trends** | `backend/src/routes/api/frontend/research/daily-trends.ts` |
| **pr_overviews** | `backend/src/routes/api/services/github/pr-overview.ts` |
| **repo_analysis** | `backend/src/workflows/search.ts` |
| **repo_scores** | `backend/src/ai/agents/ResearchOrchestrator.ts`, `backend/src/lib/email-reports.ts` |
| **repositories** | `backend/src/ai/agents/ResearchOrchestrator.ts`, `backend/src/lib/email-reports.ts`, `backend/src/workflows/search.ts` |
| **research_judge_logs** | `backend/src/routes/api/services/github/gh-actions.ts` |
| **research_sessions** | `backend/src/ai/agents/ResearchOrchestrator.ts`, `backend/src/lib/email-reports.ts` |
| **searches** | `backend/src/workflows/search.ts` |
| **tags** | `backend/src/lib/email-reports.ts` |
| **trending_repos** | `backend/src/routes/api/services/github/trending-repos.ts` |
| **webhook_deliveries** | `backend/src/routes/api/services/github/pr-overview.ts`, `backend/src/routes/api/webhooks/index.ts`, `backend/src/workflows/health.ts` |
