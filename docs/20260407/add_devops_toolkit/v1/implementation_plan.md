# Add DevOps Toolkit

We will create a new toolkit module named `DevOps` in `toolkit_cli` to handle workstation maintenance and admin overhead. The first feature of this toolkit will be to set up global pointers for Node.js ecosystem executables offloaded to an external SSD.

## User Review Required

- Should the `devops` toolkit generate and execute the bash script, or should it implement the symlinking and `.zshrc` modification natively via Python (`os.symlink`, `Path`, etc.)? Native Python implementation is typically more robust for a CLI tool.
- I have already created `.agent/workflows/implement-feature.md`, `.agent/rules/environment-paths.md`, and written the `setup-node-pointers.sh` to your home directory (`~/setup-node-pointers.sh`) as requested in the snippet. They are ready to use. 

## Proposed Changes

### Configuration and Script
#### [NEW] `~/setup-node-pointers.sh`
- A robust bash script to check the external SSD, create `/usr/local/bin` symlinks, and update ~/.zshrc. (Already written).

---

### DevOps Toolkit Module
#### [NEW] `src/toolkit/tools/devops/__init__.py`
- Initialize the module.

#### [NEW] `src/toolkit/tools/devops/models.py`
- Pydantic models for configuration, such as defining the path for the external SSD (`/Volumes/Projects`).

#### [NEW] `src/toolkit/tools/devops/service.py`
- The core logic class `DevOpsService`. Contains the logic for the `setup_node_pointers` operation (either executing the bash script or implementing natively).

#### [NEW] `src/toolkit/tools/devops/wizard.py`
- Interactive TUI using `questionary` to confirm if the external drive is mounted and prompt to execute the pointers setup.

#### [NEW] `src/toolkit/tools/devops/cli.py`
- Typer CLI interface for `toolkit devops setup-node-pointers`.

---

### Toolkit Registry
#### [MODIFY] `src/toolkit/app.py`
- Register the `devops` typer subcommand.

#### [MODIFY] `src/toolkit/tui.py`
- Add `DevOps` to the main interactive wizard menu.

#### [NEW] `tests/test_devops.py`
- Unit tests to ensure 100% test coverage for the tool, mocking system calls to avoid actual modifications to the host environment during tests.

## Open Questions
- Do you approve the python-native approach or would you prefer the tool to directly invoke the bash script?
- Any other tools/binaries (like `rust`, `go`) that we should include in the first iteration of the `devops` module?

## Verification Plan

### Automated Tests
- Run `poetry run pytest tests/test_devops.py` to achieve 100% test coverage on the internal logic.

### Manual Verification
- Run `toolkit devops setup-node-pointers` and verify the `/usr/local/bin` output.
- Verify `wizard.py` executes smoothly via `toolkit` interactive menu.
