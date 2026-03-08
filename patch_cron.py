import re

with open('backend/src/index.ts', 'r') as f:
    content = f.read()

target = """      const successfulWorkflows = results.filter(r => r.status === 'triggered');
      const failedWorkflows = results.filter(r => r.status === 'failed');"""

replacement = target + """

      // Generate summary podcast
      let podcastId = "";
      try {
        const agentId = env.PODCAST_AGENT.idFromName("daily-summary");
        const agentStub = env.PODCAST_AGENT.get(agentId);

        const podcastReqId = crypto.randomUUID();
        await agentStub.fetch("http://internal/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: podcastReqId,
            topic: `Daily Research Summary: ${today.toLocaleDateString()}`,
            githubRepos: successfulWorkflows.map(r => `https://github.com/${r.repo}`),
          })
        });
        podcastId = podcastReqId;
      } catch (e) {
        console.error("[Scheduler] Podcast generation failed", e);
      }
"""

content = content.replace(target, replacement)

# Add podcastId to template data
target2 = """            dailyTrendsData: {
              date: today.toLocaleDateString(),"""

replacement2 = target2 + """
              podcastId: podcastId,"""

content = content.replace(target2, replacement2)

with open('backend/src/index.ts', 'w') as f:
    f.write(content)
