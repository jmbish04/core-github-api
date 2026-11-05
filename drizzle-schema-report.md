# Drizzle ORM Schema & D1 Analysis Report

## Table Names by Database

### env.DB
- action_logs
- agent_activities
- agent_sessions
- agent_skills
- ai_cost_logs
- alerts
- analysis_artifacts
- applications
- automation_logs
- automation_rules
- automation_runner_policies
- budget_events
- chat_messages
- chat_threads
- cloudflare_changelog
- config_audit_logs
- corkboard_labels
- daily_research_docs
- daily_trends
- discord_messages
- discord_research_configs
- discord_scan_log
- docs_agents
- epics
- golden_path_config
- golden_path_config_scopes
- golden_path_config_tag_definitions
- golden_path_config_tag_mappings
- health_results
- health_runs
- health_test_definitions
- jules_jobs
- jules_sessions
- jules_webhook_events
- learning_ai_insight_messages
- learning_ai_insight_prs
- learning_ai_insights
- learning_ai_pr_reflections
- learning_enrichment
- learning_messages
- learning_sessions
- learning_threads
- newsletter_repos
- plan_responses
- planning_request_artifacts
- planning_request_events
- planning_requests
- planning_requests_upscaling
- pr_comments
- pr_manager_jobs
- pr_overviews
- pr_review_checklists
- pricing_change_log
- pricing_snapshots
- project_favorites
- prompt_revisions
- pull_requests
- repo_analysis
- repo_metrics
- repo_scores
- repo_stats
- repo_sync_configs
- repositories
- repository_secret_defaults
- request_logs
- research_briefs
- research_candidates
- research_execution_logs
- research_findings
- research_judge_logs
- research_judgments
- research_plans
- research_projects
- research_recommendations
- research_reports
- research_sessions
- reverse_eng_backend
- reverse_eng_events
- reverse_eng_snapshots
- reverse_eng_ux
- searches
- sessions
- standardization_items
- standardization_rules
- standardization_tag_definitions
- standardization_tag_mappings
- starred_repos
- stories
- system_config_definitions
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
- unified_action_logs
- user_settings
- webhook_configs
- webhook_deliveries
- workshop_agent_memory
- workshop_project_tasks
- workshop_projects
- workshop_task_events
- workshop_ux_pages
- workshop_ux_runs
- workshop_ux_task_logs

### env.DB_WEBHOOKS
- analysis_artifacts
- automation_logs
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
- webhook_configs
- webhook_deliveries

### Unmapped / Orphaned Schema Tables
*(Suspicious AI Slop: Defined in code but no CRUD operations with a known D1 env var detected)*
- audit_logs
- automation_runs
- chat_tags
- cloudflare_docs_interactions
- code_review_comment_enrichments
- code_review_comments
- code_review_runs
- container_logs
- discord_scan_watermarks
- events
- learning_ai_insight_pr_mapping
- learning_tag_mapping
- learning_tags
- operation_logs
- organization_settings
- repo_ai_context
- repo_drafts
- repo_infra
- repo_tags
- repo_tech_stack
- research_files
- secrets_config

---

## Code Files Interacting with D1 Tables

### `container/lib/SessionManager.ts`
- **Tables Imported:** applications, sessions, tasks

### `container/src/server.ts`
- **Tables Imported:** sessions

### `src/backend/drizzle.config.webhooks.ts`
- **Tables Imported:** daily_trends, repo_analysis, research_judge_logs, searches, trending_repos

### `src/backend/scripts/generate-landing-cli.ts`
- **Tables Imported:** repositories, searches

### `src/backend/src/ai/agents/HealthDiagnostician.ts`
- **Tables Imported:** health_results, jules_jobs, tasks

### `src/backend/src/ai/agents/JulesOverseer.ts`
- **Tables Imported:** alerts, jules_jobs, jules_sessions, learning_ai_insights, sessions

### `src/backend/src/ai/agents/LandingPageAgent.ts`
- **Tables Imported:** jules_jobs, tasks

### `src/backend/src/ai/agents/LearningAgent.ts`
- **Tables Imported:** learning_ai_insight_prs, learning_ai_insights, learning_ai_pr_reflections, learning_enrichment, learning_messages, learning_sessions, learning_threads

### `src/backend/src/ai/agents/Orchestrator.ts`
- **Tables Imported:** tasks

### `src/backend/src/ai/agents/Research.ts`
- **Tables Imported:** repositories, research_projects, research_reports

### `src/backend/src/ai/agents/Supervisor.ts`
- **Tables Imported:** sessions

### `src/backend/src/ai/agents/TopicOrchestrator.ts`
- **Tables Imported:** research_briefs, research_plans

### `src/backend/src/ai/agents/github/Owner.ts`
- **Tables Imported:** automation_runs, events, repositories

### `src/backend/src/ai/agents/github/Repo.ts`
- **Tables Imported:** events, tasks

### `src/backend/src/ai/agents/orchestration/base-orchestrator.ts`
- **Tables Imported:** tasks

### `src/backend/src/ai/agents/patterns/orchestrator-workers.ts`
- **Tables Imported:** tasks

### `src/backend/src/ai/agents/patterns/parallelization.ts`
- **Tables Imported:** tasks

### `src/backend/src/ai/agents/planning/Orchestrator.ts`
- **Tables Imported:** epics, stories, tasks

### `src/backend/src/ai/agents/pr-manager/PrManagerAgent.ts`
- **Tables Imported:** pr_manager_jobs, tasks

### `src/backend/src/ai/agents/retrofit.ts`
- **Tables Imported:** applications

### `src/backend/src/ai/agents/reverse-engineering/Consultant.ts`
- **Tables Imported:** stories

### `src/backend/src/ai/agents/workshop/UxResearcher.ts`
- **Tables Imported:** sessions, workshop_ux_pages, workshop_ux_runs, workshop_ux_task_logs

### `src/backend/src/ai/agents/workshop/WorkshopAgent.ts`
- **Tables Imported:** applications, tasks, workshop_project_tasks, workshop_projects

### `src/backend/src/ai/fallbackLogger.ts`
- **Tables Imported:** request_logs

### `src/backend/src/ai/mcp/tools.ts`
- **Tables Imported:** repositories, sessions, tags

### `src/backend/src/ai/mcp/tools/cloudflare/containers/health.ts`
- **Tables Imported:** applications

### `src/backend/src/ai/mcp/tools/cloudflare/registry.ts`
- **Tables Imported:** audit_logs

### `src/backend/src/ai/mcp/tools/github/github.ts`
- **Tables Imported:** repositories

### `src/backend/src/ai/mcp/tools/github/health.ts`
- **Tables Imported:** webhook_deliveries

### `src/backend/src/ai/mcp/tools/github/index.ts`
- **Tables Imported:** repositories, tags

### `src/backend/src/ai/mcp/tools/github/migration-pillars.ts`
- **Tables Imported:** tags

### `src/backend/src/ai/mcp/tools/github/shared.ts`
- **Tables Imported:** repositories

### `src/backend/src/ai/mcp/tools/github/tools-health.ts`
- **Tables Imported:** repositories

### `src/backend/src/ai/mcp/tools/github_repos.ts`
- **Tables Imported:** repositories

### `src/backend/src/ai/mcp/tools/index.ts`
- **Tables Imported:** tags

### `src/backend/src/ai/mcp/tools/orchestration.ts`
- **Tables Imported:** sessions, tags

### `src/backend/src/ai/mcp/tools/orchestration/cloudflare-docs.ts`
- **Tables Imported:** tags

### `src/backend/src/ai/mcp/tools/sandbox-sdk/session-manager.ts`
- **Tables Imported:** sessions

### `src/backend/src/ai/mcp/tools/standards.ts`
- **Tables Imported:** tags

### `src/backend/src/ai/mcp/tools/vectorize-helper.ts`
- **Tables Imported:** code_review_comment_enrichments, code_review_comments, repositories

### `src/backend/src/ai/mcp/tools/vectorize.ts`
- **Tables Imported:** searches

### `src/backend/src/ai/mcp/types.ts`
- **Tables Imported:** tags

### `src/backend/src/ai/providers/index.ts`
- **Tables Imported:** tags

### `src/backend/src/ai/providers/jules.ts`
- **Tables Imported:** plan_responses, planning_requests, planning_requests_upscaling, repo_analysis, tags

### `src/backend/src/ai/providers/worker-ai.ts`
- **Tables Imported:** tasks

### `src/backend/src/ai/services/software-engineer.ts`
- **Tables Imported:** epics, tasks

### `src/backend/src/ai/utils/budget-tracker.ts`
- **Tables Imported:** ai_cost_logs, budget_events, sessions

### `src/backend/src/ai/utils/model-config.ts`
- **Tables Imported:** tasks

### `src/backend/src/ai/utils/sanitizer.ts`
- **Tables Imported:** tags

### `src/backend/src/ai/utils/streaming.ts`
- **Tables Imported:** tasks

### `src/backend/src/alerts/config.ts`
- **Tables Imported:** alerts

### `src/backend/src/alerts/index.ts`
- **Tables Imported:** alerts

### `src/backend/src/automations/core/AutomationRegistry.ts`
- **Tables Imported:** webhook_configs

### `src/backend/src/automations/core/BaseAutomation.ts`
- **Tables Imported:** automation_logs

### `src/backend/src/automations/core/health.ts`
- **Tables Imported:** webhook_configs

### `src/backend/src/automations/issues/health.ts`
- **Tables Imported:** tasks

### `src/backend/src/automations/issues/task-sync.ts`
- **Tables Imported:** tasks

### `src/backend/src/automations/pr/SentinelInterceptor.ts`
- **Tables Imported:** learning_ai_insights

### `src/backend/src/automations/pr/SentinelPostMerge.ts`
- **Tables Imported:** learning_ai_insight_prs

### `src/backend/src/automations/pr/ingest/health.ts`
- **Tables Imported:** webhook_configs

### `src/backend/src/automations/pr/jules-sync/health.ts`
- **Tables Imported:** sessions

### `src/backend/src/automations/pr/review-extraction/health.ts`
- **Tables Imported:** webhook_configs

### `src/backend/src/automations/pr/sentinel-handler.ts`
- **Tables Imported:** learning_ai_insight_prs, learning_ai_insights

### `src/backend/src/automations/push/gardener.ts`
- **Tables Imported:** tasks

### `src/backend/src/automations/push/operations/sandbox-sdk/container.ts`
- **Tables Imported:** tasks

### `src/backend/src/automations/push/orchestration/index.ts`
- **Tables Imported:** repositories

### `src/backend/src/automations/push/orchestration/sync/index.ts`
- **Tables Imported:** repo_sync_configs

### `src/backend/src/automations/push/runner-policies.ts`
- **Tables Imported:** automation_runner_policies

### `src/backend/src/automations/push/standards-check.ts`
- **Tables Imported:** repositories

### `src/backend/src/automations/repository/standardization/index.ts`
- **Tables Imported:** repositories

### `src/backend/src/automations/repository/standardization/rules.ts`
- **Tables Imported:** standardization_rules, tags

### `src/backend/src/automations/repository/stats-update.ts`
- **Tables Imported:** repo_stats

### `src/backend/src/automations/security/leak-plumber/index.ts`
- **Tables Imported:** repositories

### `src/backend/src/automations/security/leak-plumber/workflow.ts`
- **Tables Imported:** alerts

### `src/backend/src/automations/shared/sandbox.ts`
- **Tables Imported:** tasks

### `src/backend/src/cloudflare/flareclerk.ts`
- **Tables Imported:** applications

### `src/backend/src/db/ops/repos.ts`
- **Tables Imported:** repo_infra, repo_metrics, repo_tags, repo_tech_stack, repositories, tags

### `src/backend/src/db/schemas/agents/budget.ts`
- **Tables Imported:** ai_cost_logs, alerts, budget_events

### `src/backend/src/db/schemas/agents/chat.ts`
- **Tables Imported:** chat_messages, chat_tags, chat_threads, repositories

### `src/backend/src/db/schemas/agents/cloudflare-docs-interactions.ts`
- **Tables Imported:** cloudflare_docs_interactions

### `src/backend/src/db/schemas/agents/events.ts`
- **Tables Imported:** agent_activities, automation_runs, events, pr_manager_jobs

### `src/backend/src/db/schemas/agents/jules.ts`
- **Tables Imported:** jules_jobs, jules_sessions

### `src/backend/src/db/schemas/agents/pricing.ts`
- **Tables Imported:** pricing_change_log, pricing_snapshots

### `src/backend/src/db/schemas/agents/prompt-revisions.ts`
- **Tables Imported:** prompt_revisions

### `src/backend/src/db/schemas/agents/research.ts`
- **Tables Imported:** analysis_artifacts, repo_scores, research_files, research_sessions, sessions

### `src/backend/src/db/schemas/agents/skills.ts`
- **Tables Imported:** agent_skills

### `src/backend/src/db/schemas/app/action_logs.ts`
- **Tables Imported:** action_logs

### `src/backend/src/db/schemas/app/alerts.ts`
- **Tables Imported:** alerts

### `src/backend/src/db/schemas/app/applications.ts`
- **Tables Imported:** applications

### `src/backend/src/db/schemas/app/automation_rules.ts`
- **Tables Imported:** automation_rules

### `src/backend/src/db/schemas/app/automation_runner_policies.ts`
- **Tables Imported:** automation_runner_policies

### `src/backend/src/db/schemas/app/cloudflare_changelog.ts`
- **Tables Imported:** cloudflare_changelog

### `src/backend/src/db/schemas/app/config.ts`
- **Tables Imported:** config_audit_logs

### `src/backend/src/db/schemas/app/golden_path.ts`
- **Tables Imported:** golden_path_config, golden_path_config_scopes, golden_path_config_tag_definitions, golden_path_config_tag_mappings

### `src/backend/src/db/schemas/app/index.ts`
- **Tables Imported:** action_logs, alerts, applications, research_judgments, sessions, tags

### `src/backend/src/db/schemas/app/research.ts`
- **Tables Imported:** agent_sessions, newsletter_repos, research_findings

### `src/backend/src/db/schemas/app/research_judgments.ts`
- **Tables Imported:** research_judgments

### `src/backend/src/db/schemas/app/sessions.ts`
- **Tables Imported:** sessions

### `src/backend/src/db/schemas/app/settings.ts`
- **Tables Imported:** organization_settings, user_settings

### `src/backend/src/db/schemas/app/standardization.ts`
- **Tables Imported:** repo_sync_configs, repository_secret_defaults, standardization_items, standardization_rules, standardization_tag_definitions, standardization_tag_mappings, system_config_definitions

### `src/backend/src/db/schemas/app/tag_application_mapping.ts`
- **Tables Imported:** applications, tag_application_mapping, tags

### `src/backend/src/db/schemas/app/tags.ts`
- **Tables Imported:** tags

### `src/backend/src/db/schemas/app/unified_action_logs.ts`
- **Tables Imported:** unified_action_logs

### `src/backend/src/db/schemas/containers/index.ts`
- **Tables Imported:** container_logs

### `src/backend/src/db/schemas/discord/index.ts`
- **Tables Imported:** discord_messages, discord_scan_log

### `src/backend/src/db/schemas/docs/agents.ts`
- **Tables Imported:** docs_agents, tags

### `src/backend/src/db/schemas/github/drafts.ts`
- **Tables Imported:** repo_drafts, repositories

### `src/backend/src/db/schemas/github/favorites.ts`
- **Tables Imported:** project_favorites

### `src/backend/src/db/schemas/github/index.ts`
- **Tables Imported:** tasks

### `src/backend/src/db/schemas/github/learning/aiInsightMessages.ts`
- **Tables Imported:** learning_ai_insight_messages

### `src/backend/src/db/schemas/github/learning/aiInsightPrMapping.ts`
- **Tables Imported:** learning_ai_insight_pr_mapping, learning_ai_insight_prs, learning_ai_insights

### `src/backend/src/db/schemas/github/learning/aiInsightPrs.ts`
- **Tables Imported:** learning_ai_insight_prs

### `src/backend/src/db/schemas/github/learning/aiInsights.ts`
- **Tables Imported:** learning_ai_insights

### `src/backend/src/db/schemas/github/learning/aiPrReflections.ts`
- **Tables Imported:** learning_ai_pr_reflections

### `src/backend/src/db/schemas/github/learning/enrichment.ts`
- **Tables Imported:** learning_enrichment

### `src/backend/src/db/schemas/github/learning/index.ts`
- **Tables Imported:** learning_tag_mapping, learning_tags, sessions

### `src/backend/src/db/schemas/github/learning/learningTagMapping.ts`
- **Tables Imported:** learning_tag_mapping

### `src/backend/src/db/schemas/github/learning/learningTags.ts`
- **Tables Imported:** learning_tags

### `src/backend/src/db/schemas/github/learning/messages.ts`
- **Tables Imported:** learning_messages

### `src/backend/src/db/schemas/github/learning/sessions.ts`
- **Tables Imported:** learning_sessions

### `src/backend/src/db/schemas/github/learning/tagMapping.ts`
- **Tables Imported:** learning_messages, learning_tag_mapping, tags

### `src/backend/src/db/schemas/github/learning/threads.ts`
- **Tables Imported:** learning_threads

### `src/backend/src/db/schemas/github/pr_overviews.ts`
- **Tables Imported:** pr_overviews

### `src/backend/src/db/schemas/github/prs.ts`
- **Tables Imported:** pr_comments, pull_requests

### `src/backend/src/db/schemas/github/repos.ts`
- **Tables Imported:** operation_logs, repo_ai_context, repo_infra, repo_metrics, repo_stats, repo_tags, repo_tech_stack, repositories

### `src/backend/src/db/schemas/github/research.ts`
- **Tables Imported:** discord_research_configs, discord_scan_watermarks, research_briefs, research_candidates, research_execution_logs, research_plans, research_projects, research_recommendations, research_reports

### `src/backend/src/db/schemas/github/reviews.ts`
- **Tables Imported:** code_review_comment_enrichments, code_review_comments, code_review_runs, tags

### `src/backend/src/db/schemas/github/stars.ts`
- **Tables Imported:** repositories, starred_repos

### `src/backend/src/db/schemas/github/webhooks.ts`
- **Tables Imported:** daily_trends, repo_analysis, research_judge_logs, searches, trending_repos, webhook_deliveries

### `src/backend/src/db/schemas/jules/index.ts`
- **Tables Imported:** jules_jobs, jules_sessions, jules_webhook_events, sessions

### `src/backend/src/db/schemas/jules/jobs.ts`
- **Tables Imported:** jules_jobs, sessions

### `src/backend/src/db/schemas/jules/sessions.ts`
- **Tables Imported:** jules_sessions, sessions

### `src/backend/src/db/schemas/jules/webhook-events.ts`
- **Tables Imported:** alerts, jules_webhook_events

### `src/backend/src/db/schemas/logs/audit.ts`
- **Tables Imported:** audit_logs

### `src/backend/src/db/schemas/logs/automation.ts`
- **Tables Imported:** automation_logs

### `src/backend/src/db/schemas/logs/health.ts`
- **Tables Imported:** health_results, health_runs, health_test_definitions

### `src/backend/src/db/schemas/logs/logs.ts`
- **Tables Imported:** request_logs

### `src/backend/src/db/schemas/logs/system.ts`
- **Tables Imported:** system_logs

### `src/backend/src/db/schemas/ops/secrets.ts`
- **Tables Imported:** secrets_config

### `src/backend/src/db/schemas/projects/backlog/epics.ts`
- **Tables Imported:** epics, repositories

### `src/backend/src/db/schemas/projects/backlog/index.ts`
- **Tables Imported:** epics, repositories, stories, task_comments, tasks

### `src/backend/src/db/schemas/projects/backlog/stories.ts`
- **Tables Imported:** epics, repositories, stories

### `src/backend/src/db/schemas/projects/backlog/tasks.ts`
- **Tables Imported:** repositories, stories, task_comments, task_events, tasks

### `src/backend/src/db/schemas/projects/index.ts`
- **Tables Imported:** corkboard_labels, epics, stories, task_comments, task_events, tasks, todo_ai_insights, todo_links, todo_tag_map, todo_tags, todos

### `src/backend/src/db/schemas/projects/planning_requests.ts`
- **Tables Imported:** planning_request_artifacts, planning_request_events, planning_requests

### `src/backend/src/db/schemas/projects/reverse_engineering.ts`
- **Tables Imported:** repositories, reverse_eng_backend, reverse_eng_events, reverse_eng_snapshots, reverse_eng_ux

### `src/backend/src/db/schemas/projects/todos.ts`
- **Tables Imported:** corkboard_labels, todo_ai_insights, todo_links, todo_tag_map, todo_tags, todos

### `src/backend/src/db/schemas/webhooks/automations.ts`
- **Tables Imported:** webhook_configs

### `src/backend/src/db/schemas/webhooks/task_events.ts`
- **Tables Imported:** tasks, workshop_project_tasks, workshop_projects, workshop_task_events

### `src/backend/src/db/schemas/workflows/daily-research.ts`
- **Tables Imported:** daily_research_docs

### `src/backend/src/db/schemas/workshop/agent_memory.ts`
- **Tables Imported:** workshop_agent_memory, workshop_projects

### `src/backend/src/db/schemas/workshop/plan_tracking.ts`
- **Tables Imported:** plan_responses, planning_requests, planning_requests_upscaling, pr_review_checklists

### `src/backend/src/db/schemas/workshop/project_tasks.ts`
- **Tables Imported:** tasks, workshop_project_tasks, workshop_projects

### `src/backend/src/db/schemas/workshop/projects.ts`
- **Tables Imported:** workshop_projects

### `src/backend/src/db/schemas/workshop/task_logs.ts`
- **Tables Imported:** workshop_ux_runs, workshop_ux_task_logs

### `src/backend/src/db/schemas/workshop/ux_design_runs.ts`
- **Tables Imported:** workshop_ux_runs

### `src/backend/src/db/schemas/workshop/ux_pages.ts`
- **Tables Imported:** workshop_ux_pages

### `src/backend/src/db/validation.ts`
- **Tables Imported:** repositories

### `src/backend/src/do/AgentSessionDO.ts`
- **Tables Imported:** agent_sessions, research_findings

### `src/backend/src/do/JulesWebhookBroadcaster.ts`
- **Tables Imported:** tags

### `src/backend/src/health/checks/log-staleness.ts`
- **Tables Imported:** system_logs

### `src/backend/src/health/checks/webhook-staleness.ts`
- **Tables Imported:** webhook_deliveries

### `src/backend/src/health/coordinator.ts`
- **Tables Imported:** health_results, health_runs, health_test_definitions

### `src/backend/src/health/health-check.ts`
- **Tables Imported:** health_runs

### `src/backend/src/lib/crud-factory.ts`
- **Tables Imported:** tags

### `src/backend/src/lib/email-reports.ts`
- **Tables Imported:** repo_scores, repositories, research_sessions, tags

### `src/backend/src/lib/logger.ts`
- **Tables Imported:** system_logs

### `src/backend/src/lib/research-logger.ts`
- **Tables Imported:** research_execution_logs

### `src/backend/src/lib/schemas/reverse-engineering.ts`
- **Tables Imported:** epics

### `src/backend/src/routes/api/actions.ts`
- **Tables Imported:** action_logs

### `src/backend/src/routes/api/agent-planning.ts`
- **Tables Imported:** plan_responses, planning_requests_upscaling, pr_review_checklists, tasks

### `src/backend/src/routes/api/agents/jules.ts`
- **Tables Imported:** jules_jobs

### `src/backend/src/routes/api/agents/specialists.ts`
- **Tables Imported:** tags

### `src/backend/src/routes/api/agents/transcribe.ts`
- **Tables Imported:** tags

### `src/backend/src/routes/api/agents/workshop-chat.ts`
- **Tables Imported:** tags

### `src/backend/src/routes/api/cloudflare/docs/prompt.ts`
- **Tables Imported:** prompt_revisions

### `src/backend/src/routes/api/cloudflare/docs/revisions.ts`
- **Tables Imported:** prompt_revisions

### `src/backend/src/routes/api/cloudflare/logs.ts`
- **Tables Imported:** tags

### `src/backend/src/routes/api/docs/agents.ts`
- **Tables Imported:** applications, docs_agents, repositories, sessions, tags, tasks

### `src/backend/src/routes/api/frontend/ai/chat.ts`
- **Tables Imported:** chat_messages, chat_threads

### `src/backend/src/routes/api/frontend/alerts.ts`
- **Tables Imported:** alerts

### `src/backend/src/routes/api/frontend/planner/tasks.ts`
- **Tables Imported:** task_comments, task_events, tasks, workshop_project_tasks

### `src/backend/src/routes/api/frontend/planner/timeline.ts`
- **Tables Imported:** agent_activities

### `src/backend/src/routes/api/frontend/planner/todos.ts`
- **Tables Imported:** corkboard_labels, tags, todo_ai_insights, todo_links, todo_tag_map, todo_tags, todos

### `src/backend/src/routes/api/frontend/repos/actions.ts`
- **Tables Imported:** tasks

### `src/backend/src/routes/api/frontend/repos/appstore.ts`
- **Tables Imported:** applications, tag_application_mapping, tags

### `src/backend/src/routes/api/frontend/repos/base.ts`
- **Tables Imported:** repositories, tags

### `src/backend/src/routes/api/frontend/repos/favorites.ts`
- **Tables Imported:** project_favorites, repositories

### `src/backend/src/routes/api/frontend/repos/hierarchy.ts`
- **Tables Imported:** epics, repositories, stories, tasks

### `src/backend/src/routes/api/frontend/repos/planner.ts`
- **Tables Imported:** epics, repositories, stories, tasks

### `src/backend/src/routes/api/frontend/repos/stars.ts`
- **Tables Imported:** repo_metrics, repositories, starred_repos

### `src/backend/src/routes/api/frontend/repos/utils.ts`
- **Tables Imported:** repositories

### `src/backend/src/routes/api/frontend/research/daily/index.ts`
- **Tables Imported:** research_recommendations

### `src/backend/src/routes/api/frontend/research/daily/ingest.ts`
- **Tables Imported:** daily_research_docs

### `src/backend/src/routes/api/frontend/research/daily/trends.ts`
- **Tables Imported:** daily_trends

### `src/backend/src/routes/api/frontend/research/one-time.ts`
- **Tables Imported:** research_projects, research_reports

### `src/backend/src/routes/api/frontend/research/research.ts`
- **Tables Imported:** research_briefs, research_candidates, research_execution_logs

### `src/backend/src/routes/api/frontend/settings.ts`
- **Tables Imported:** config_audit_logs, system_config_definitions, tags, user_settings

### `src/backend/src/routes/api/frontend/stats.ts`
- **Tables Imported:** repo_stats, repositories

### `src/backend/src/routes/api/frontend/workshop.ts`
- **Tables Imported:** tasks, workshop_agent_memory, workshop_project_tasks, workshop_projects, workshop_task_events

### `src/backend/src/routes/api/health.ts`
- **Tables Imported:** health_runs

### `src/backend/src/routes/api/index.ts`
- **Tables Imported:** alerts, tasks, todos

### `src/backend/src/routes/api/jules/agent.ts`
- **Tables Imported:** sessions, tasks

### `src/backend/src/routes/api/jules/index.ts`
- **Tables Imported:** jules_jobs, jules_sessions, jules_webhook_events, sessions

### `src/backend/src/routes/api/learning/index.ts`
- **Tables Imported:** learning_ai_insight_messages, learning_ai_insights, learning_messages, learning_sessions, sessions

### `src/backend/src/routes/api/ops/health.ts`
- **Tables Imported:** health_test_definitions

### `src/backend/src/routes/api/ops/standards.ts`
- **Tables Imported:** standardization_items, standardization_rules, standardization_tag_definitions, standardization_tag_mappings, tags

### `src/backend/src/routes/api/ops/workflows.ts`
- **Tables Imported:** automation_logs, automation_rules, webhook_configs

### `src/backend/src/routes/api/planning.ts`
- **Tables Imported:** tasks

### `src/backend/src/routes/api/projects/sentinel/available.ts`
- **Tables Imported:** epics, stories, tasks

### `src/backend/src/routes/api/projects/sentinel/claim.ts`
- **Tables Imported:** task_events, tasks

### `src/backend/src/routes/api/projects/sentinel/clarify.ts`
- **Tables Imported:** tasks

### `src/backend/src/routes/api/projects/sentinel/health.ts`
- **Tables Imported:** tasks

### `src/backend/src/routes/api/projects/sentinel/index.ts`
- **Tables Imported:** tasks

### `src/backend/src/routes/api/projects/sentinel/ingest.ts`
- **Tables Imported:** task_events, tasks

### `src/backend/src/routes/api/projects/sentinel/mcp.ts`
- **Tables Imported:** epics, stories, task_events, tasks

### `src/backend/src/routes/api/projects/sentinel/status.ts`
- **Tables Imported:** task_events, tasks

### `src/backend/src/routes/api/projects/sentinel/submit.ts`
- **Tables Imported:** task_events, tasks

### `src/backend/src/routes/api/projects/sentinel/task.ts`
- **Tables Imported:** epics, stories, tasks

### `src/backend/src/routes/api/projects/sentinel/update.ts`
- **Tables Imported:** task_events, tasks

### `src/backend/src/routes/api/projects/tasks.ts`
- **Tables Imported:** tasks, workshop_project_tasks

### `src/backend/src/routes/api/research-orchestration.ts`
- **Tables Imported:** newsletter_repos, repositories

### `src/backend/src/routes/api/reverse-engineering.ts`
- **Tables Imported:** tags

### `src/backend/src/routes/api/sentinel/health.ts`
- **Tables Imported:** learning_ai_insights, learning_sessions, sessions, tags

### `src/backend/src/routes/api/sentinel/index.ts`
- **Tables Imported:** tasks

### `src/backend/src/routes/api/sentinel/insights.ts`
- **Tables Imported:** learning_ai_insights, tags

### `src/backend/src/routes/api/sentinel/orchestrate.ts`
- **Tables Imported:** tags

### `src/backend/src/routes/api/sentinel/tasks.ts`
- **Tables Imported:** tags, task_events, tasks

### `src/backend/src/routes/api/services/cloudflare.ts`
- **Tables Imported:** applications

### `src/backend/src/routes/api/services/discord.ts`
- **Tables Imported:** discord_research_configs

### `src/backend/src/routes/api/services/github/gh-actions.ts`
- **Tables Imported:** research_judge_logs

### `src/backend/src/routes/api/services/github/pr-overview.ts`
- **Tables Imported:** pr_overviews, webhook_deliveries

### `src/backend/src/routes/api/services/github/trending-repos.ts`
- **Tables Imported:** trending_repos

### `src/backend/src/routes/api/skills.ts`
- **Tables Imported:** agent_skills, repositories

### `src/backend/src/routes/api/standardization.ts`
- **Tables Imported:** repo_sync_configs, repositories

### `src/backend/src/routes/api/ux/index.ts`
- **Tables Imported:** workshop_ux_pages, workshop_ux_runs

### `src/backend/src/routes/api/webhooks/action-callback.ts`
- **Tables Imported:** action_logs

### `src/backend/src/routes/api/webhooks/index.ts`
- **Tables Imported:** webhook_deliveries

### `src/backend/src/routes/api/webhooks/jules.ts`
- **Tables Imported:** alerts, jules_sessions, jules_webhook_events

### `src/backend/src/routes/api/webhooks/research-judge.ts`
- **Tables Imported:** research_judgments

### `src/backend/src/routes/api/ws/action-worker.ts`
- **Tables Imported:** golden_path_config, unified_action_logs

### `src/backend/src/routes/index.ts`
- **Tables Imported:** alerts, tasks, todos

### `src/backend/src/routes/rpc/service.ts`
- **Tables Imported:** repositories

### `src/backend/src/services/appstore-ai.ts`
- **Tables Imported:** tags, tasks

### `src/backend/src/services/appstore-worker-ai.ts`
- **Tables Imported:** tags, tasks

### `src/backend/src/services/github/pr-ingestion.ts`
- **Tables Imported:** pr_comments, pull_requests

### `src/backend/src/services/github/unified-action-worker/dispatcher.ts`
- **Tables Imported:** unified_action_logs

### `src/backend/src/services/golden-path-config.ts`
- **Tables Imported:** golden_path_config, golden_path_config_scopes, golden_path_config_tag_definitions, golden_path_config_tag_mappings, tags

### `src/backend/src/services/jules/service.ts`
- **Tables Imported:** jules_jobs, jules_sessions, pull_requests, sessions, tasks

### `src/backend/src/services/landing-generator/analyzer.ts`
- **Tables Imported:** tags, tasks

### `src/backend/src/services/landing-generator/blueprint.ts`
- **Tables Imported:** repositories, tags

### `src/backend/src/services/landing-generator/types.ts`
- **Tables Imported:** tags

### `src/backend/src/services/planning/honi-babysitter.ts`
- **Tables Imported:** epics, pull_requests, stories, tasks, workshop_project_tasks, workshop_projects

### `src/backend/src/services/planning/store.ts`
- **Tables Imported:** planning_request_artifacts, planning_request_events, planning_requests

### `src/backend/src/services/pricing-scraper.ts`
- **Tables Imported:** pricing_change_log, pricing_snapshots

### `src/backend/src/services/repository-secret-defaults.ts`
- **Tables Imported:** repository_secret_defaults

### `src/backend/src/services/repository-sync.ts`
- **Tables Imported:** repositories

### `src/backend/src/services/reverse-engineering/orchestration.ts`
- **Tables Imported:** epics, sessions, stories

### `src/backend/src/services/reverse-engineering/store.ts`
- **Tables Imported:** epics, reverse_eng_backend, reverse_eng_events, reverse_eng_snapshots, reverse_eng_ux

### `src/backend/src/services/sentinel/ingestor.ts`
- **Tables Imported:** learning_ai_insights, learning_sessions

### `src/backend/src/services/stats-updater.ts`
- **Tables Imported:** repo_stats

### `src/backend/src/services/todoInsights.ts`
- **Tables Imported:** tags, todo_ai_insights, todo_links, todos

### `src/backend/src/types/github/webhooks.ts`
- **Tables Imported:** repositories

### `src/backend/src/utils/email/send/repo-discovery.ts`
- **Tables Imported:** cloudflare_changelog, tags

### `src/backend/src/utils/github/configs.ts`
- **Tables Imported:** repositories

### `src/backend/src/utils/github/detectAgent.ts`
- **Tables Imported:** tags

### `src/backend/src/utils/openapi.ts`
- **Tables Imported:** pull_requests, repositories, sessions, tags

### `src/backend/src/workflows/discord.ts`
- **Tables Imported:** discord_messages, discord_scan_log, research_briefs, research_candidates

### `src/backend/src/workflows/health.ts`
- **Tables Imported:** webhook_deliveries

### `src/backend/src/workflows/learning/LearningWorkflow.ts`
- **Tables Imported:** learning_messages, learning_sessions

### `src/backend/src/workflows/planning/health.ts`
- **Tables Imported:** planning_requests

### `src/backend/src/workflows/planning/orchestrator.ts`
- **Tables Imported:** pull_requests

### `src/backend/src/workflows/research/cloudflare-changelog.ts`
- **Tables Imported:** cloudflare_changelog

### `src/backend/src/workflows/research/deep.ts`
- **Tables Imported:** repositories, research_recommendations

### `src/backend/src/workflows/research/health.ts`
- **Tables Imported:** research_recommendations

### `src/backend/src/workflows/research/orchestrator.ts`
- **Tables Imported:** analysis_artifacts, repo_scores, repositories, research_sessions

### `src/backend/src/workflows/research/topic.ts`
- **Tables Imported:** daily_trends, research_briefs, research_candidates

### `src/backend/src/workflows/search.ts`
- **Tables Imported:** repo_analysis, repositories, searches

### `src/frontend/src/App.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/components/RecentTasksCard.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/components/WorkshopProjectViewer.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/components/alerts/AlertBadge.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/components/alerts/AlertTray.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/components/assistant-ui/assistant-modal.tsx`
- **Tables Imported:** epics, repositories, stories, tasks

### `src/frontend/src/components/cloudflare-chat/SystemPromptModal.tsx`
- **Tables Imported:** cloudflare_docs_interactions

### `src/frontend/src/components/cloudflaresdk/CloudflareSdkDashboard.tsx`
- **Tables Imported:** tags

### `src/frontend/src/components/config/StandardizationConfig.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/components/config/SyncSecretsConfig.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/components/docs/AgentDocLayout.tsx`
- **Tables Imported:** tags

### `src/frontend/src/components/docs/UxDesignAgentDoc.tsx`
- **Tables Imported:** sessions, tags, tasks

### `src/frontend/src/components/kibo-ui/editor/index.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/components/kibo-ui/tags/index.tsx`
- **Tables Imported:** tags

### `src/frontend/src/components/layout/AppSidebar.tsx`
- **Tables Imported:** todos

### `src/frontend/src/components/learning/BabysitterHUD.tsx`
- **Tables Imported:** sessions

### `src/frontend/src/components/learning/InsightTrendChart.tsx`
- **Tables Imported:** sessions

### `src/frontend/src/components/learning/SessionsTable.tsx`
- **Tables Imported:** sessions

### `src/frontend/src/components/navigation/Sidebar.tsx`
- **Tables Imported:** todos

### `src/frontend/src/components/project-dashboard/ProjectAssistant.tsx`
- **Tables Imported:** epics, stories, tasks

### `src/frontend/src/components/project-dashboard/beta/TrackerBoardView.tsx`
- **Tables Imported:** tags, tasks

### `src/frontend/src/components/project-dashboard/beta/TrackerLayout.tsx`
- **Tables Imported:** searches, tags, tasks

### `src/frontend/src/components/project-dashboard/beta/TrackerListView.tsx`
- **Tables Imported:** tags, tasks

### `src/frontend/src/components/project-dashboard/beta/TrackerReportsView.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/components/project-dashboard/hierarchy/HierarchyContext.tsx`
- **Tables Imported:** epics, tasks

### `src/frontend/src/components/project-dashboard/hierarchy/HierarchyTable.tsx`
- **Tables Imported:** epics, tasks

### `src/frontend/src/components/project-dashboard/hierarchy/KanbanView.tsx`
- **Tables Imported:** epics, tasks

### `src/frontend/src/components/project-dashboard/tabs/PlanTab.tsx`
- **Tables Imported:** epics, stories, tasks

### `src/frontend/src/components/project-dashboard/tabs/ProjectsTab.tsx`
- **Tables Imported:** epics, stories, tasks

### `src/frontend/src/components/project-dashboard/tabs/VibeCodingTab.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/components/reverse-engineering/api.ts`
- **Tables Imported:** epics

### `src/frontend/src/components/settings/AlertsTab.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/components/settings/SecretsTab.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/components/settings/StandardizationsTab.tsx`
- **Tables Imported:** tags

### `src/frontend/src/components/shared/TaskKanbanBoard.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/components/shared/kanban-utils.ts`
- **Tables Imported:** tasks

### `src/frontend/src/components/tools/AgentFactoryTool.tsx`
- **Tables Imported:** sessions

### `src/frontend/src/components/tools/registry-directory/AiAdvisorModal.tsx`
- **Tables Imported:** tags

### `src/frontend/src/components/tools/registry-directory/UxResearcherModal.tsx`
- **Tables Imported:** stories, tags

### `src/frontend/src/components/tools/registry-directory/data.ts`
- **Tables Imported:** applications

### `src/frontend/src/components/webhooks/EventCard.tsx`
- **Tables Imported:** automation_runs

### `src/frontend/src/components/webhooks/LiveEventsTab.tsx`
- **Tables Imported:** automation_runs

### `src/frontend/src/components/workflows/catalog.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/components/workflows/data.tsx`
- **Tables Imported:** repositories, tasks

### `src/frontend/src/components/workshop/AgentHandoffFlow.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/components/workshop/JulesTaskPanel.tsx`
- **Tables Imported:** sessions, tasks

### `src/frontend/src/components/workshop/PerformanceAnalytics.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/context/alerts-context.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/hooks/useAgentsRegistry.ts`
- **Tables Imported:** tags

### `src/frontend/src/hooks/useSentinel.ts`
- **Tables Imported:** sessions, tasks

### `src/frontend/src/layouts/RepoLayout.tsx`
- **Tables Imported:** tags, tasks

### `src/frontend/src/layouts/RootLayout.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/lib/error-handler.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/lib/nav-config.ts`
- **Tables Imported:** alerts, epics, stories, tasks, todos

### `src/frontend/src/routes/GlobalRoutes.tsx`
- **Tables Imported:** alerts, epics, stories, tasks, todos

### `src/frontend/src/routes/RepoRoutes.tsx`
- **Tables Imported:** epics, stories, tasks

### `src/frontend/src/views/Research.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/views/agents/GlobalInsights.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/views/control/global/Alerts.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/views/control/global/AppStore.tsx`
- **Tables Imported:** applications, tags

### `src/frontend/src/views/control/global/Kanban.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/control/global/Projects.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/views/control/global/ReverseEngineering.tsx`
- **Tables Imported:** epics, repositories

### `src/frontend/src/views/control/global/ReverseEngineeringSnapshot.tsx`
- **Tables Imported:** epics

### `src/frontend/src/views/control/global/SentinelDashboard.tsx`
- **Tables Imported:** sessions

### `src/frontend/src/views/control/global/SentinelKanban.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/control/global/Settings.tsx`
- **Tables Imported:** alerts

### `src/frontend/src/views/control/global/Standardization.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/views/control/global/TaskDetails.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/control/global/Todo.tsx`
- **Tables Imported:** todos

### `src/frontend/src/views/control/global/TrackerBeta.tsx`
- **Tables Imported:** tags, tasks

### `src/frontend/src/views/control/global/Workflows.tsx`
- **Tables Imported:** chat_messages

### `src/frontend/src/views/public/Docs.tsx`
- **Tables Imported:** epics, jules_jobs, jules_sessions, tasks

### `src/frontend/src/views/public/Home.tsx`
- **Tables Imported:** repositories, sessions

### `src/frontend/src/views/repos/Dashboard.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/repos/KanbanBoard.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/repos/Overview.tsx`
- **Tables Imported:** tags

### `src/frontend/src/views/repos/Plan.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/repos/Projects.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/repos/ProjectsBeta.tsx`
- **Tables Imported:** epics, stories, tasks

### `src/frontend/src/views/repos/TrackerBoardViewBeta.tsx`
- **Tables Imported:** tags, tasks

### `src/frontend/src/views/repos/TrackerLayoutBeta.tsx`
- **Tables Imported:** searches, tasks

### `src/frontend/src/views/repos/TrackerListViewBeta.tsx`
- **Tables Imported:** tags, tasks

### `src/frontend/src/views/repos/TrackerReportsViewBeta.tsx`
- **Tables Imported:** tasks

### `src/frontend/src/views/research/DeepResearchChatPage.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/views/research/ResearchDashboard.tsx`
- **Tables Imported:** repositories

### `src/frontend/src/views/research/components/ProjectEditor_old.tsx`
- **Tables Imported:** searches

### `src/frontend/worker-configuration.d.ts`
- **Tables Imported:** tags, tasks

### `tests/unit/planning-health.test.ts`
- **Tables Imported:** planning_requests

### `vitest.config.ts`
- **Tables Imported:** alerts

### `worker-configuration.d.ts`
- **Tables Imported:** tags, tasks

---

## env.DB d1 db
| Table Name | Short File Paths |
|---|---|
| **action_logs** | `src/backend/src/routes/api/actions.ts`, `src/backend/src/routes/api/webhooks/action-callback.ts` |
| **agent_activities** | `src/backend/src/routes/api/frontend/planner/timeline.ts` |
| **agent_sessions** | `src/backend/src/do/AgentSessionDO.ts` |
| **agent_skills** | `src/backend/src/routes/api/skills.ts` |
| **ai_cost_logs** | `src/backend/src/ai/utils/budget-tracker.ts` |
| **alerts** | `src/backend/src/ai/agents/JulesOverseer.ts`, `src/backend/src/alerts/index.ts`, `src/backend/src/automations/security/leak-plumber/workflow.ts`, `src/backend/src/routes/api/frontend/alerts.ts`, `src/backend/src/routes/api/webhooks/jules.ts` |
| **analysis_artifacts** | `src/backend/src/workflows/research/orchestrator.ts` |
| **applications** | `src/backend/src/ai/agents/workshop/WorkshopAgent.ts`, `src/backend/src/routes/api/docs/agents.ts`, `src/backend/src/routes/api/frontend/repos/appstore.ts`, `src/backend/src/routes/api/services/cloudflare.ts` |
| **automation_logs** | `src/backend/src/automations/core/BaseAutomation.ts`, `src/backend/src/db/schemas/logs/automation.ts`, `src/backend/src/routes/api/ops/workflows.ts` |
| **automation_rules** | `src/backend/src/routes/api/ops/workflows.ts` |
| **automation_runner_policies** | `src/backend/src/automations/push/runner-policies.ts` |
| **budget_events** | `src/backend/src/ai/utils/budget-tracker.ts` |
| **chat_messages** | `src/backend/src/routes/api/frontend/ai/chat.ts` |
| **chat_threads** | `src/backend/src/routes/api/frontend/ai/chat.ts` |
| **cloudflare_changelog** | `src/backend/src/utils/email/send/repo-discovery.ts`, `src/backend/src/workflows/research/cloudflare-changelog.ts` |
| **config_audit_logs** | `src/backend/src/routes/api/frontend/settings.ts` |
| **corkboard_labels** | `src/backend/src/routes/api/frontend/planner/todos.ts` |
| **daily_research_docs** | `src/backend/src/routes/api/frontend/research/daily/ingest.ts` |
| **daily_trends** | `src/backend/src/routes/api/frontend/research/daily/trends.ts`, `src/backend/src/workflows/research/topic.ts` |
| **discord_messages** | `src/backend/src/workflows/discord.ts` |
| **discord_research_configs** | `src/backend/src/routes/api/services/discord.ts` |
| **discord_scan_log** | `src/backend/src/workflows/discord.ts` |
| **docs_agents** | `src/backend/src/routes/api/docs/agents.ts` |
| **epics** | `src/backend/src/routes/api/frontend/repos/hierarchy.ts`, `src/backend/src/routes/api/frontend/repos/planner.ts`, `src/backend/src/routes/api/projects/sentinel/available.ts`, `src/backend/src/routes/api/projects/sentinel/mcp.ts`, `src/backend/src/routes/api/projects/sentinel/task.ts`, `src/backend/src/services/planning/honi-babysitter.ts`, `src/backend/src/services/reverse-engineering/store.ts` |
| **golden_path_config** | `src/backend/src/routes/api/ws/action-worker.ts`, `src/backend/src/services/golden-path-config.ts` |
| **golden_path_config_scopes** | `src/backend/src/services/golden-path-config.ts` |
| **golden_path_config_tag_definitions** | `src/backend/src/services/golden-path-config.ts` |
| **golden_path_config_tag_mappings** | `src/backend/src/services/golden-path-config.ts` |
| **health_results** | `src/backend/src/ai/agents/HealthDiagnostician.ts`, `src/backend/src/health/coordinator.ts` |
| **health_runs** | `src/backend/src/health/coordinator.ts`, `src/backend/src/health/health-check.ts`, `src/backend/src/routes/api/health.ts` |
| **health_test_definitions** | `src/backend/src/health/coordinator.ts`, `src/backend/src/routes/api/ops/health.ts` |
| **jules_jobs** | `src/backend/src/ai/agents/HealthDiagnostician.ts`, `src/backend/src/ai/agents/JulesOverseer.ts`, `src/backend/src/ai/agents/LandingPageAgent.ts`, `src/backend/src/routes/api/agents/jules.ts`, `src/backend/src/routes/api/jules/index.ts`, `src/backend/src/services/jules/service.ts` |
| **jules_sessions** | `src/backend/src/ai/agents/JulesOverseer.ts`, `src/backend/src/routes/api/jules/index.ts`, `src/backend/src/routes/api/webhooks/jules.ts`, `src/backend/src/services/jules/service.ts` |
| **jules_webhook_events** | `src/backend/src/routes/api/jules/index.ts`, `src/backend/src/routes/api/webhooks/jules.ts` |
| **learning_ai_insight_messages** | `src/backend/src/routes/api/learning/index.ts` |
| **learning_ai_insight_prs** | `src/backend/src/ai/agents/LearningAgent.ts`, `src/backend/src/automations/pr/SentinelPostMerge.ts`, `src/backend/src/automations/pr/sentinel-handler.ts` |
| **learning_ai_insights** | `src/backend/src/ai/agents/JulesOverseer.ts`, `src/backend/src/ai/agents/LearningAgent.ts`, `src/backend/src/automations/pr/SentinelInterceptor.ts`, `src/backend/src/automations/pr/sentinel-handler.ts`, `src/backend/src/routes/api/learning/index.ts`, `src/backend/src/routes/api/sentinel/health.ts`, `src/backend/src/routes/api/sentinel/insights.ts`, `src/backend/src/services/sentinel/ingestor.ts` |
| **learning_ai_pr_reflections** | `src/backend/src/ai/agents/LearningAgent.ts` |
| **learning_enrichment** | `src/backend/src/ai/agents/LearningAgent.ts` |
| **learning_messages** | `src/backend/src/ai/agents/LearningAgent.ts`, `src/backend/src/routes/api/learning/index.ts`, `src/backend/src/workflows/learning/LearningWorkflow.ts` |
| **learning_sessions** | `src/backend/src/ai/agents/LearningAgent.ts`, `src/backend/src/routes/api/learning/index.ts`, `src/backend/src/routes/api/sentinel/health.ts`, `src/backend/src/services/sentinel/ingestor.ts`, `src/backend/src/workflows/learning/LearningWorkflow.ts` |
| **learning_threads** | `src/backend/src/ai/agents/LearningAgent.ts` |
| **newsletter_repos** | `src/backend/src/routes/api/research-orchestration.ts` |
| **plan_responses** | `src/backend/src/ai/providers/jules.ts`, `src/backend/src/routes/api/agent-planning.ts` |
| **planning_request_artifacts** | `src/backend/src/services/planning/store.ts` |
| **planning_request_events** | `src/backend/src/services/planning/store.ts` |
| **planning_requests** | `src/backend/src/ai/providers/jules.ts`, `src/backend/src/services/planning/store.ts`, `src/backend/src/workflows/planning/health.ts` |
| **planning_requests_upscaling** | `src/backend/src/ai/providers/jules.ts`, `src/backend/src/routes/api/agent-planning.ts` |
| **pr_comments** | `src/backend/src/services/github/pr-ingestion.ts` |
| **pr_manager_jobs** | `src/backend/src/ai/agents/pr-manager/PrManagerAgent.ts` |
| **pr_overviews** | `src/backend/src/routes/api/services/github/pr-overview.ts` |
| **pr_review_checklists** | `src/backend/src/routes/api/agent-planning.ts` |
| **pricing_change_log** | `src/backend/src/services/pricing-scraper.ts` |
| **pricing_snapshots** | `src/backend/src/services/pricing-scraper.ts` |
| **project_favorites** | `src/backend/src/routes/api/frontend/repos/favorites.ts` |
| **prompt_revisions** | `src/backend/src/routes/api/cloudflare/docs/prompt.ts`, `src/backend/src/routes/api/cloudflare/docs/revisions.ts` |
| **pull_requests** | `src/backend/src/services/github/pr-ingestion.ts`, `src/backend/src/services/jules/service.ts`, `src/backend/src/services/planning/honi-babysitter.ts` |
| **repo_analysis** | `src/backend/src/ai/providers/jules.ts`, `src/backend/src/workflows/search.ts` |
| **repo_metrics** | `src/backend/src/routes/api/frontend/repos/stars.ts` |
| **repo_scores** | `src/backend/src/lib/email-reports.ts`, `src/backend/src/workflows/research/orchestrator.ts` |
| **repo_stats** | `src/backend/src/automations/repository/stats-update.ts`, `src/backend/src/routes/api/frontend/stats.ts`, `src/backend/src/services/stats-updater.ts` |
| **repo_sync_configs** | `src/backend/src/automations/push/orchestration/sync/index.ts`, `src/backend/src/routes/api/standardization.ts` |
| **repositories** | `src/backend/src/ai/agents/Research.ts`, `src/backend/src/ai/mcp/tools/github/github.ts`, `src/backend/src/automations/push/orchestration/index.ts`, `src/backend/src/automations/push/standards-check.ts`, `src/backend/src/lib/email-reports.ts`, `src/backend/src/routes/api/docs/agents.ts`, `src/backend/src/routes/api/frontend/repos/base.ts`, `src/backend/src/routes/api/frontend/repos/favorites.ts`, `src/backend/src/routes/api/frontend/repos/hierarchy.ts`, `src/backend/src/routes/api/frontend/repos/planner.ts`, `src/backend/src/routes/api/frontend/repos/stars.ts`, `src/backend/src/routes/api/frontend/stats.ts`, `src/backend/src/routes/api/research-orchestration.ts`, `src/backend/src/routes/api/skills.ts`, `src/backend/src/routes/api/standardization.ts`, `src/backend/src/services/repository-sync.ts`, `src/backend/src/workflows/research/deep.ts`, `src/backend/src/workflows/research/orchestrator.ts`, `src/backend/src/workflows/search.ts` |
| **repository_secret_defaults** | `src/backend/src/services/repository-secret-defaults.ts` |
| **request_logs** | `src/backend/src/ai/fallbackLogger.ts` |
| **research_briefs** | `src/backend/src/ai/agents/TopicOrchestrator.ts`, `src/backend/src/routes/api/frontend/research/research.ts`, `src/backend/src/workflows/discord.ts`, `src/backend/src/workflows/research/topic.ts` |
| **research_candidates** | `src/backend/src/routes/api/frontend/research/research.ts`, `src/backend/src/workflows/discord.ts`, `src/backend/src/workflows/research/topic.ts` |
| **research_execution_logs** | `src/backend/src/routes/api/frontend/research/research.ts` |
| **research_findings** | `src/backend/src/do/AgentSessionDO.ts` |
| **research_judge_logs** | `src/backend/src/routes/api/services/github/gh-actions.ts` |
| **research_judgments** | `src/backend/src/routes/api/webhooks/research-judge.ts` |
| **research_plans** | `src/backend/src/ai/agents/TopicOrchestrator.ts` |
| **research_projects** | `src/backend/src/ai/agents/Research.ts`, `src/backend/src/routes/api/frontend/research/one-time.ts` |
| **research_recommendations** | `src/backend/src/routes/api/frontend/research/daily/index.ts`, `src/backend/src/workflows/research/deep.ts`, `src/backend/src/workflows/research/health.ts` |
| **research_reports** | `src/backend/src/ai/agents/Research.ts`, `src/backend/src/routes/api/frontend/research/one-time.ts` |
| **research_sessions** | `src/backend/src/lib/email-reports.ts`, `src/backend/src/workflows/research/orchestrator.ts` |
| **reverse_eng_backend** | `src/backend/src/services/reverse-engineering/store.ts` |
| **reverse_eng_events** | `src/backend/src/services/reverse-engineering/store.ts` |
| **reverse_eng_snapshots** | `src/backend/src/services/reverse-engineering/store.ts` |
| **reverse_eng_ux** | `src/backend/src/services/reverse-engineering/store.ts` |
| **searches** | `src/backend/src/workflows/search.ts` |
| **sessions** | `src/backend/src/ai/agents/JulesOverseer.ts`, `src/backend/src/ai/agents/Supervisor.ts`, `src/backend/src/ai/agents/workshop/UxResearcher.ts`, `src/backend/src/ai/utils/budget-tracker.ts`, `src/backend/src/routes/api/docs/agents.ts`, `src/backend/src/routes/api/jules/index.ts`, `src/backend/src/routes/api/learning/index.ts`, `src/backend/src/routes/api/sentinel/health.ts`, `src/backend/src/services/jules/service.ts` |
| **standardization_items** | `src/backend/src/routes/api/ops/standards.ts` |
| **standardization_rules** | `src/backend/src/automations/repository/standardization/rules.ts`, `src/backend/src/routes/api/ops/standards.ts` |
| **standardization_tag_definitions** | `src/backend/src/routes/api/ops/standards.ts` |
| **standardization_tag_mappings** | `src/backend/src/routes/api/ops/standards.ts` |
| **starred_repos** | `src/backend/src/routes/api/frontend/repos/stars.ts` |
| **stories** | `src/backend/src/routes/api/frontend/repos/hierarchy.ts`, `src/backend/src/routes/api/frontend/repos/planner.ts`, `src/backend/src/routes/api/projects/sentinel/available.ts`, `src/backend/src/routes/api/projects/sentinel/mcp.ts`, `src/backend/src/routes/api/projects/sentinel/task.ts`, `src/backend/src/services/planning/honi-babysitter.ts` |
| **system_config_definitions** | `src/backend/src/routes/api/frontend/settings.ts` |
| **system_logs** | `src/backend/src/health/checks/log-staleness.ts`, `src/backend/src/lib/logger.ts` |
| **tag_application_mapping** | `src/backend/src/routes/api/frontend/repos/appstore.ts` |
| **tags** | `src/backend/src/ai/providers/jules.ts`, `src/backend/src/automations/repository/standardization/rules.ts`, `src/backend/src/lib/email-reports.ts`, `src/backend/src/routes/api/docs/agents.ts`, `src/backend/src/routes/api/frontend/planner/todos.ts`, `src/backend/src/routes/api/frontend/repos/appstore.ts`, `src/backend/src/routes/api/frontend/repos/base.ts`, `src/backend/src/routes/api/frontend/settings.ts`, `src/backend/src/routes/api/ops/standards.ts`, `src/backend/src/routes/api/sentinel/health.ts`, `src/backend/src/routes/api/sentinel/insights.ts`, `src/backend/src/routes/api/sentinel/tasks.ts`, `src/backend/src/services/golden-path-config.ts`, `src/backend/src/services/todoInsights.ts`, `src/backend/src/utils/email/send/repo-discovery.ts`, `src/frontend/worker-configuration.d.ts`, `worker-configuration.d.ts` |
| **task_comments** | `src/backend/src/routes/api/frontend/planner/tasks.ts` |
| **task_events** | `src/backend/src/routes/api/frontend/planner/tasks.ts`, `src/backend/src/routes/api/projects/sentinel/claim.ts`, `src/backend/src/routes/api/projects/sentinel/ingest.ts`, `src/backend/src/routes/api/projects/sentinel/mcp.ts`, `src/backend/src/routes/api/projects/sentinel/status.ts`, `src/backend/src/routes/api/projects/sentinel/submit.ts`, `src/backend/src/routes/api/projects/sentinel/update.ts`, `src/backend/src/routes/api/sentinel/tasks.ts` |
| **tasks** | `src/backend/src/ai/agents/HealthDiagnostician.ts`, `src/backend/src/ai/agents/LandingPageAgent.ts`, `src/backend/src/ai/agents/pr-manager/PrManagerAgent.ts`, `src/backend/src/ai/agents/workshop/WorkshopAgent.ts`, `src/backend/src/automations/issues/health.ts`, `src/backend/src/automations/issues/task-sync.ts`, `src/backend/src/routes/api/agent-planning.ts`, `src/backend/src/routes/api/docs/agents.ts`, `src/backend/src/routes/api/frontend/planner/tasks.ts`, `src/backend/src/routes/api/frontend/repos/actions.ts`, `src/backend/src/routes/api/frontend/repos/hierarchy.ts`, `src/backend/src/routes/api/frontend/repos/planner.ts`, `src/backend/src/routes/api/frontend/workshop.ts`, `src/backend/src/routes/api/projects/sentinel/available.ts`, `src/backend/src/routes/api/projects/sentinel/claim.ts`, `src/backend/src/routes/api/projects/sentinel/health.ts`, `src/backend/src/routes/api/projects/sentinel/ingest.ts`, `src/backend/src/routes/api/projects/sentinel/mcp.ts`, `src/backend/src/routes/api/projects/sentinel/status.ts`, `src/backend/src/routes/api/projects/sentinel/submit.ts`, `src/backend/src/routes/api/projects/sentinel/task.ts`, `src/backend/src/routes/api/projects/sentinel/update.ts`, `src/backend/src/routes/api/projects/tasks.ts`, `src/backend/src/routes/api/sentinel/tasks.ts`, `src/backend/src/services/jules/service.ts`, `src/backend/src/services/planning/honi-babysitter.ts`, `src/frontend/worker-configuration.d.ts`, `worker-configuration.d.ts` |
| **todo_ai_insights** | `src/backend/src/routes/api/frontend/planner/todos.ts`, `src/backend/src/services/todoInsights.ts` |
| **todo_links** | `src/backend/src/routes/api/frontend/planner/todos.ts`, `src/backend/src/services/todoInsights.ts` |
| **todo_tag_map** | `src/backend/src/routes/api/frontend/planner/todos.ts` |
| **todo_tags** | `src/backend/src/routes/api/frontend/planner/todos.ts` |
| **todos** | `src/backend/src/routes/api/frontend/planner/todos.ts`, `src/backend/src/services/todoInsights.ts` |
| **trending_repos** | `src/backend/src/routes/api/services/github/trending-repos.ts` |
| **unified_action_logs** | `src/backend/src/routes/api/ws/action-worker.ts`, `src/backend/src/services/github/unified-action-worker/dispatcher.ts` |
| **user_settings** | `src/backend/src/routes/api/frontend/settings.ts` |
| **webhook_configs** | `src/backend/src/automations/core/AutomationRegistry.ts`, `src/backend/src/automations/core/health.ts`, `src/backend/src/automations/pr/ingest/health.ts`, `src/backend/src/automations/pr/review-extraction/health.ts`, `src/backend/src/routes/api/ops/workflows.ts` |
| **webhook_deliveries** | `src/backend/src/ai/mcp/tools/github/health.ts`, `src/backend/src/health/checks/webhook-staleness.ts`, `src/backend/src/routes/api/services/github/pr-overview.ts`, `src/backend/src/routes/api/webhooks/index.ts`, `src/backend/src/workflows/health.ts` |
| **workshop_agent_memory** | `src/backend/src/routes/api/frontend/workshop.ts` |
| **workshop_project_tasks** | `src/backend/src/ai/agents/workshop/WorkshopAgent.ts`, `src/backend/src/routes/api/frontend/planner/tasks.ts`, `src/backend/src/routes/api/frontend/workshop.ts`, `src/backend/src/routes/api/projects/tasks.ts`, `src/backend/src/services/planning/honi-babysitter.ts` |
| **workshop_projects** | `src/backend/src/ai/agents/workshop/WorkshopAgent.ts`, `src/backend/src/routes/api/frontend/workshop.ts`, `src/backend/src/services/planning/honi-babysitter.ts` |
| **workshop_task_events** | `src/backend/src/routes/api/frontend/workshop.ts` |
| **workshop_ux_pages** | `src/backend/src/ai/agents/workshop/UxResearcher.ts`, `src/backend/src/routes/api/ux/index.ts` |
| **workshop_ux_runs** | `src/backend/src/ai/agents/workshop/UxResearcher.ts`, `src/backend/src/routes/api/ux/index.ts` |
| **workshop_ux_task_logs** | `src/backend/src/ai/agents/workshop/UxResearcher.ts` |

## env.DB_WEBHOOKS d1 db
| Table Name | Short File Paths |
|---|---|
| **analysis_artifacts** | `src/backend/src/workflows/research/orchestrator.ts` |
| **automation_logs** | `src/backend/src/routes/api/ops/workflows.ts` |
| **automation_rules** | `src/backend/src/routes/api/ops/workflows.ts` |
| **daily_trends** | `src/backend/src/routes/api/frontend/research/daily/trends.ts` |
| **pr_overviews** | `src/backend/src/routes/api/services/github/pr-overview.ts` |
| **repo_analysis** | `src/backend/src/workflows/search.ts` |
| **repo_scores** | `src/backend/src/lib/email-reports.ts`, `src/backend/src/workflows/research/orchestrator.ts` |
| **repositories** | `src/backend/src/lib/email-reports.ts`, `src/backend/src/workflows/research/orchestrator.ts`, `src/backend/src/workflows/search.ts` |
| **research_judge_logs** | `src/backend/src/routes/api/services/github/gh-actions.ts` |
| **research_sessions** | `src/backend/src/lib/email-reports.ts`, `src/backend/src/workflows/research/orchestrator.ts` |
| **searches** | `src/backend/src/workflows/search.ts` |
| **tags** | `src/backend/src/lib/email-reports.ts` |
| **trending_repos** | `src/backend/src/routes/api/services/github/trending-repos.ts` |
| **webhook_configs** | `src/backend/src/automations/core/AutomationRegistry.ts`, `src/backend/src/automations/core/health.ts`, `src/backend/src/automations/pr/ingest/health.ts`, `src/backend/src/automations/pr/review-extraction/health.ts`, `src/backend/src/routes/api/ops/workflows.ts` |
| **webhook_deliveries** | `src/backend/src/ai/mcp/tools/github/health.ts`, `src/backend/src/health/checks/webhook-staleness.ts`, `src/backend/src/routes/api/services/github/pr-overview.ts`, `src/backend/src/routes/api/webhooks/index.ts`, `src/backend/src/workflows/health.ts` |
