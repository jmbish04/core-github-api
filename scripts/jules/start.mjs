import readline from 'readline';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// We optionally take sessionId to skip the first prompt, but it's not required.
let sessionId = process.argv[2] || '';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function asyncQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

function runScript(scriptName, extraArgs = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName);
    
    // Pass sessionId if the script expects it (session specific scripts)
    const args = sessionId && !scriptName.match(/run|all|select|sources/) 
      ? [scriptPath, sessionId, ...extraArgs] 
      : [scriptPath, ...extraArgs];

    const child = spawn('node', args, { stdio: 'inherit' });
    child.on('close', (code) => {
      console.log(`\n\x1b[90m--- Finished running ${scriptName} ---\x1b[0m`);
      resolve(code);
    });
  });
}

function printMainMenu() {
  console.log('\n=======================================');
  console.log(`🚀 Jules Scripts Interactive Menu`);
  console.log('=======================================');
  console.log('1. Interact with an ongoing Jules session');
  console.log('2. Create new sessions / AI fleet');
  console.log('3. Query knowledge base or data sources');
  console.log('4. Fleet PR Reconciliation (jules-merge)');
  console.log('0. Exit');
  console.log('=======================================');
  
  rl.question(`\nSelect an option (0-4): `, async (choice) => {
    console.log('');
    switch (choice.trim()) {
      case '1':
        if (!sessionId) {
          sessionId = await asyncQuestion('Enter the Session ID: ');
          sessionId = sessionId.trim();
        }
        return printSessionMenu();
      case '2':
        return printCreateMenu();
      case '3':
        return printQueryMenu();
      case '4':
        return printMergeMenu();
      case '0':
        console.log('Exiting...');
        rl.close();
        return;
      default:
        console.log('Invalid option, please try again.');
        return printMainMenu();
    }
  });
}

function printSessionMenu() {
  console.log('\n=======================================');
  console.log(`--- Session Specific Commands ---`);
  console.log(`Active Session ID: ${sessionId}`);
  console.log('=======================================');
  console.log('1. Monitor Agent Progress (Streaming)');
  console.log('2. Ask Agent a Question / Send Feedback');
  console.log('3. Approve Pending Plan');
  console.log('4. View Session Information / Result');
  console.log('5. Generate Session Snapshot');
  console.log('6. Send Fire-and-Forget Message (send)');
  console.log('7. Wait For State (waitFor)');
  console.log('8. View Activity History (history)');
  console.log('9. Stream Live Updates (updates)');
  console.log('10. Handle & View Artifacts (artifacts)');
  console.log('0. Back to Main Menu');
  console.log('=======================================');

  rl.question(`\nSelect an option (0-10): `, async (choice) => {
    console.log('');
    switch (choice.trim()) {
      case '1': await runScript('interact/monitor_agent_progress.mjs'); break;
      case '2': 
        const askMsg = await asyncQuestion('Enter your message for the agent: ');
        if (askMsg.trim()) {
          await runScript('interact/ask.mjs', [askMsg]);
        } else {
          console.log('Message cannot be empty. Aborting.');
        }
        break;
      case '3': await runScript('interact/approve.mjs'); break;
      case '4': await runScript('interact/info.mjs'); break;
      case '5': await runScript('interact/snapshot.mjs'); break;
      case '6': 
        const msg = await asyncQuestion('Message to send: ');
        await runScript('interact/send.mjs', [msg]);
        break;
      case '7':
        await new Promise(res => {
          console.log('\n--- Target States ---');
          console.log('1. QUEUED');
          console.log('2. PLANNING');
          console.log('3. AWAITING_PLAN_APPROVAL');
          console.log('4. AWAITING_USER_FEEDBACK');
          console.log('5. IN_PROGRESS');
          console.log('6. PAUSED');
          console.log('7. COMPLETED');
          console.log('8. FAILED');
          
          rl.question('\nSelect an option (1-8) or type a custom state name: ', async (ans) => {
            let state;
            switch(ans.trim()) {
              case '1': state = 'QUEUED'; break;
              case '2': state = 'PLANNING'; break;
              case '3': state = 'AWAITING_PLAN_APPROVAL'; break;
              case '4': state = 'AWAITING_USER_FEEDBACK'; break;
              case '5': state = 'IN_PROGRESS'; break;
              case '6': state = 'PAUSED'; break;
              case '7': state = 'COMPLETED'; break;
              case '8': state = 'FAILED'; break;
              default: state = ans.trim(); break;
            }
            if (!state) state = 'AWAITING_PLAN_APPROVAL';
            await runScript('interact/waitFor.mjs', [state]);
            res();
          });
        });
        break;
      case '8': await runScript('interact/history.mjs'); break;
      case '9': await runScript('interact/updates.mjs'); break;
      case '10': await runScript('interact/artifacts.mjs'); break;
      case '0':
        sessionId = ''; // clear session to allow re-entry
        return printMainMenu();
      default:
        console.log('Invalid option, please try again.');
    }
    
    await asyncQuestion('\nPress Enter to return to the session menu...');
    printSessionMenu();
  });
}

function printCreateMenu() {
  console.log('\n=======================================');
  console.log(`--- Create New Sessions ---`);
  console.log('=======================================');
  console.log('1. Run Automated Repoless Session (run)');
  console.log('2. Run Batch Sessions / Fleet (all)');
  console.log('3. Create Connected Session (session)');
  console.log('0. Back to Main Menu');
  console.log('=======================================');

  rl.question(`\nSelect an option (0-3): `, async (choice) => {
    console.log('');
    switch (choice.trim()) {
      case '1': 
        const prompt = await asyncQuestion('Prompt for the automated session (e.g., "Write a hello world script"): ');
        await runScript('create/run.mjs', [prompt]);
        break;
      case '2': 
        const allRepo = await asyncQuestion('GitHub Repo (leave empty for repoless fleet): ');
        let allBranch = '';
        let allAutoPr = 'false';
        if (allRepo.trim()) {
           allBranch = await asyncQuestion('Base Branch (e.g. main): ');
           const prAns = await asyncQuestion('Auto PR? (y/N): ');
           allAutoPr = prAns.trim().toLowerCase() === 'y' ? 'true' : 'false';
        }
        const concAns = await asyncQuestion('Concurrency (default 5): ');
        const allConc = concAns.trim() || '5';
        const tasksInput = await asyncQuestion('Tasks (comma separated): ');
        if (!tasksInput.trim()) {
           console.log('Tasks cannot be empty.');
           break;
        }
        await runScript('create/all.mjs', [
            allRepo.trim(), 
            allBranch.trim() || 'main', 
            allAutoPr, 
            allConc, 
            tasksInput.trim()
        ]);
        break;
      case '3':
        const repo = await asyncQuestion('GitHub Repo (e.g. davideast/dataprompt): ');
        if (!repo.trim()) break;
        const branch = await asyncQuestion('Base Branch (e.g. main): ');
        const autoPrAns = await asyncQuestion('Auto PR? (y/N): ');
        const sessionPrompt = await asyncQuestion('Prompt: ');
        if (!sessionPrompt.trim()) {
           console.log('Prompt cannot be empty.');
           break;
        }
        await runScript('create/session.mjs', [
          repo.trim(), 
          branch.trim() || 'main', 
          autoPrAns.trim().toLowerCase() === 'y' ? 'true' : 'false', 
          sessionPrompt.trim()
        ]);
        break;
      case '0':
        return printMainMenu();
      default:
        console.log('Invalid option, please try again.');
    }
    
    await asyncQuestion('\nPress Enter to return to the menu...');
    printCreateMenu();
  });
}

function printQueryMenu() {
  console.log('\n=======================================');
  console.log(`--- Query Knowledge Base ---`);
  console.log('=======================================');
  console.log('1. Query Knowledge Base Cache (select)');
  console.log('2. View Connected Sources (sources)');
  console.log('0. Back to Main Menu');
  console.log('=======================================');

  rl.question(`\nSelect an option (0-2): `, async (choice) => {
    console.log('');
    switch (choice.trim()) {
      case '1':
        const filter = await asyncQuestion('Filter (e.g., state=failed OR type=agentMessaged): ');
        await runScript('query/select.mjs', [filter || 'state=failed']);
        break;
      case '2': await runScript('query/sources.mjs'); break;
      case '0':
        return printMainMenu();
      default:
        console.log('Invalid option, please try again.');
    }
    
    await asyncQuestion('\nPress Enter to return to the menu...');
    printQueryMenu();
  });
}

function printMergeMenu() {
  console.log('\n=======================================');
  console.log(`--- Fleet PR Reconciliation ---`);
  console.log('=======================================');
  console.log('1. Scan PRs for overlapping changes (scan)');
  console.log('2. Fetch file content (get-contents)');
  console.log('3. Stage resolved file (stage-resolution)');
  console.log('4. View reconciliation status (status)');
  console.log('5. Push reconciliation PR (push)');
  console.log('6. Merge reconciliation PR (merge)');
  console.log('0. Back to Main Menu');
  console.log('=======================================');

  rl.question(`\nSelect an option (0-6): `, async (choice) => {
    console.log('');
    switch (choice.trim()) {
      case '1':
        const scanRepo = await asyncQuestion('GitHub Repo (e.g. owner/repo): ');
        if (!scanRepo) break;
        const scanPrs = await asyncQuestion('PR Numbers (comma separated, e.g. 10,11): ');
        const scanBase = await asyncQuestion('Base branch (default "main"): ');
        await runScript('merge/scan.mjs', [scanRepo, scanPrs, scanBase || 'main']);
        break;
      case '2':
        const getRepo = await asyncQuestion('GitHub Repo (e.g. owner/repo): ');
        if (!getRepo) break;
        const getSource = await asyncQuestion('Source ("base", "main", or "pr:N"): ');
        const getPath = await asyncQuestion('File path: ');
        await runScript('merge/get-contents.mjs', [getRepo, getSource, getPath]);
        break;
      case '3':
        const stagePath = await asyncQuestion('File path to stage: ');
        if (!stagePath) break;
        const stageParents = await asyncQuestion('Parents (e.g. "main,10,11"): ');
        const stageContent = await asyncQuestion('Resolved content string (or path to local file): ');
        await runScript('merge/stage-resolution.mjs', [stagePath, stageContent, stageParents]);
        break;
      case '4':
        await runScript('merge/status.mjs');
        break;
      case '5':
        const pushRepo = await asyncQuestion('GitHub Repo (e.g. owner/repo): ');
        if (!pushRepo) break;
        const pushBranch = await asyncQuestion('Branch name for PR (e.g. reconcile/batch): ');
        const pushMsg = await asyncQuestion('PR Message (optional): ');
        await runScript('merge/push.mjs', [pushRepo, pushBranch, pushMsg]);
        break;
      case '6':
        const mergeRepo = await asyncQuestion('GitHub Repo (e.g. owner/repo): ');
        if (!mergeRepo) break;
        const mergePr = await asyncQuestion('PR Number to merge: ');
        await runScript('merge/merge.mjs', [mergeRepo, mergePr]);
        break;
      case '0':
        return printMainMenu();
      default:
        console.log('Invalid option, please try again.');
    }
    
    await asyncQuestion('\nPress Enter to return to the menu...');
    printMergeMenu();
  });
}

// Start immediately on main menu if no args, else jump to session
if (sessionId) {
  printSessionMenu();
} else {
  printMainMenu();
}
