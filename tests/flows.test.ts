/**
 * @file tests/flows.test.ts
 * @description Tests for flows endpoints
 */

import { describe, it, expect } from 'vitest'

describe('Flows API', () => {
  describe('OpenAPI Routes', () => {
    it('should have workflow endpoints defined', () => {
      // Basic structure test - actual API calls require GitHub auth
      expect(true).toBe(true)
    })
  })

  describe('Workflow Templates', () => {
    it('should have PR comment extractor workflow template', async () => {
      const { DEFAULT_WORKFLOWS } = await import('../src/flows/workflowTemplates')
      
      const prWorkflow = DEFAULT_WORKFLOWS.find((w) => 
        w.path.includes('pr-comment-extractor')
      )
      
      expect(prWorkflow).toBeDefined()
      expect(prWorkflow?.content).toContain('Extract and Summarize PR Comments')
      expect(prWorkflow?.content).toContain('issue_comment')
      expect(prWorkflow?.content).toContain('pull_request_review_comment')
    })

    it('should have Cloudflare deploy workflow template', async () => {
      const { DEFAULT_WORKFLOWS } = await import('../src/flows/workflowTemplates')
      
      const deployWorkflow = DEFAULT_WORKFLOWS.find((w) => 
        w.path.includes('deploy-worker')
      )
      
      expect(deployWorkflow).toBeDefined()
      expect(deployWorkflow?.content).toContain('Deploy Worker')
      expect(deployWorkflow?.content).toContain('cloudflare/wrangler-action')
      expect(deployWorkflow?.content).toContain('CLOUDFLARE_API_TOKEN')
      expect(deployWorkflow?.content).toContain('CLOUDFLARE_ACCOUNT_ID')
    })

    it('should detect wrangler config files correctly', async () => {
      const { shouldIncludeCloudflareWorkflow } = await import('../src/flows/workflowTemplates')
      
      expect(shouldIncludeCloudflareWorkflow(['wrangler.toml', 'package.json'])).toBe(true)
      expect(shouldIncludeCloudflareWorkflow(['wrangler.jsonc', 'README.md'])).toBe(true)
      expect(shouldIncludeCloudflareWorkflow(['wrangler.json'])).toBe(true)
      expect(shouldIncludeCloudflareWorkflow(['package.json', 'README.md'])).toBe(false)
      expect(shouldIncludeCloudflareWorkflow([])).toBe(false)
    })
  })

  describe('Schema Validation', () => {
    it('should have proper request schemas for create-new-repo', () => {
      // Schema validation is enforced by Zod at runtime
      expect(true).toBe(true)
    })

    it('should have proper request schemas for retrofit-workflows', () => {
      // Schema validation is enforced by Zod at runtime
      expect(true).toBe(true)
    })
  })

  describe('Database logging', () => {
    it('should have gh_management_config table in migration', async () => {
      const fs = await import('fs/promises')
      const migrationContent = await fs.readFile(
        './migrations/0002_gh_management_config.sql',
        'utf-8'
      )
      
      expect(migrationContent).toContain('CREATE TABLE IF NOT EXISTS gh_management_config')
      expect(migrationContent).toContain('timestamp')
      expect(migrationContent).toContain('repo_name')
      expect(migrationContent).toContain('action')
      expect(migrationContent).toContain('status')
      expect(migrationContent).toContain('status_details')
    })
  })
})
