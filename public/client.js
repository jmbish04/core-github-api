async function loadNav() {
  const response = await fetch('/nav.html');
  const navHtml = await response.text();
  document.getElementById('nav-container').innerHTML = navHtml;
}

async function loadHealthDashboard() {
  const runTestsBtn = document.getElementById('run-tests-btn');
  const testResultsContainer = document.getElementById('test-results');

  async function fetchAndRenderTests() {
    const response = await fetch('/api/tests/latest');
    const data = await response.json();

    if (data.results) {
      testResultsContainer.innerHTML = '';
      for (const result of data.results) {
        const testResultEl = document.createElement('div');
        testResultEl.className = `p-4 rounded-lg ${result.status === 'pass' ? 'bg-green-800' : 'bg-red-800'}`;
        testResultEl.innerHTML = `
          <div class="flex items-center justify-between">
            <div>
              <p class="font-bold">${result.test.name}</p>
              <p class="text-sm text-gray-300">${result.test.description}</p>
            </div>
            <div class="text-right">
              <p class="text-sm">${result.duration_ms} ms</p>
              <p class="text-lg font-bold">${result.status.toUpperCase()}</p>
            </div>
          </div>
          ${result.ai_human_readable_error_description ? `<div class="mt-4 p-2 bg-gray-700 rounded"><strong>AI Analysis:</strong> ${result.ai_human_readable_error_description}</div>` : ''}
        `;
        testResultsContainer.appendChild(testResultEl);
      }
    } else {
      testResultsContainer.innerHTML = '<p>No test results available. Run a test to see the results.</p>';
    }
  }

  runTestsBtn.addEventListener('click', async () => {
    runTestsBtn.disabled = true;
    runTestsBtn.textContent = 'Running tests...';
    testResultsContainer.innerHTML = '<p>Running tests...</p>';

    const response = await fetch('/api/tests/run', { method: 'POST' });
    const { session_uuid } = await response.json();

    // Poll for results
    const interval = setInterval(async () => {
      const sessionResponse = await fetch(`/api/tests/session/${session_uuid}`);
      const sessionData = await sessionResponse.json();

      if (sessionData.results.length > 0) {
        await fetchAndRenderTests();
      }

      const isComplete = sessionData.results.every(r => r.finished_at);
      if (isComplete) {
        clearInterval(interval);
        runTestsBtn.disabled = false;
        runTestsBtn.textContent = 'Run Health Tests';
      }
    }, 2000);
  });

  fetchAndRenderTests();
}
