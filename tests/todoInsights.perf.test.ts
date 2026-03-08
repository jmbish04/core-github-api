import { describe, it, expect, vi } from 'vitest';
import { TodoInsightService } from '../backend/src/services/todoInsights';
import { getDb } from '../backend/src/db';

vi.mock('../backend/src/db', () => ({
  getDb: vi.fn()
}));

vi.mock('@openai/agents', () => {
  return {
    Agent: class MockAgent {}
  };
});

vi.mock('../backend/src/ai/agents/base/agent-ai', () => ({
  resolveDefaultAiProvider: vi.fn().mockReturnValue('mock-provider'),
  resolveDefaultAiModel: vi.fn().mockReturnValue('mock-model'),
  createRunner: vi.fn().mockResolvedValue({
    run: vi.fn().mockResolvedValue({
      finalOutput: {
        insights: Array.from({ length: 50 }).map((_, i) => ({
          type: 'enrich_todo',
          insight: `Insight ${i}`
        }))
      }
    })
  })
}));

describe('TodoInsightService Performance', () => {
  it('should measure time to insert insights and verify bulk insert', async () => {
    const insertValuesMock = vi.fn().mockImplementation(async () => {
      // Simulate database latency
      await new Promise(r => setTimeout(r, 5));
    });

    const insertMock = vi.fn().mockReturnValue({
      values: insertValuesMock
    });

    vi.mocked(getDb).mockReturnValue({
      insert: insertMock
    } as any);

    const env = { DB: {} };
    const todo = { id: 'todo-123', title: 'Test', content: 'Test content' };
    const links: any[] = [];

    const start = performance.now();

    // Call private method using any cast
    await (TodoInsightService as any).generateInsights(env, todo, links);

    const end = performance.now();
    const duration = end - start;

    console.log(`Insertion took ${duration}ms with ${insertValuesMock.mock.calls.length} DB calls`);

    // In N+1 it would be 50 calls. In bulk it's 1 call.
    expect(insertValuesMock.mock.calls.length).toBe(1);
    expect(duration).toBeGreaterThan(0);

    // Verify it passes an array of length 50
    const insertedValues = insertValuesMock.mock.calls[0][0];
    expect(Array.isArray(insertedValues)).toBe(true);
    expect(insertedValues.length).toBe(50);
  });
});
