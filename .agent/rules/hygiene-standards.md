---
trigger: on_demand
---

# Hygiene Standards

- **Ignore Compliance:** Never attempt to read or modify files listed in `.antigravityignore`.
- **Artifact Management:** Temporary tree dumps (`*_tree.txt`) and `.bak` files must be deleted immediately after a successful deployment.
- **Rule Consolidation:** If a new rule is added that overlaps more than 50% with an existing rule, they must be merged to maintain a tight token budget.
