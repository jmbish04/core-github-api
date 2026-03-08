import re

with open('backend/src/utils/email/templates/repo-discovery/email-template.hbs', 'r') as f:
    content = f.read()

target = """        <div class="header">
            <h1>{{owner}} / {{repo}}</h1>
            <p>{{description}}</p>
        </div>"""

replacement = """        <div class="header">
            <h1>{{owner}} / {{repo}}</h1>
            <p>{{description}}</p>
            <p style="margin-top: 15px;">
                <a href="https://core-github-api.hacolby.workers.dev/podcast?id={{dailyTrendsData.podcastId}}" style="display:inline-block; padding:10px 20px; background:#0070f3; color:white; text-decoration:none; border-radius:5px; font-weight: bold;">
                    🎧 Listen to the Podcast Summary
                </a>
            </p>
            <p style="margin-top: 10px;">
                <a href="https://core-github-api.hacolby.workers.dev/podcast?context=repo&repo={{owner}}/{{repo}}" style="color: #0070f3; text-decoration: underline; font-size: 0.9em;">
                    Generate specific podcast for this topic
                </a>
            </p>
        </div>"""

content = content.replace(target, replacement)

with open('backend/src/utils/email/templates/repo-discovery/email-template.hbs', 'w') as f:
    f.write(content)
