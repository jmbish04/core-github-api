with open("backend/src/routes/api/frontend/planner/tasks.ts") as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    print(f"{i+1:03d} {line}", end='')
