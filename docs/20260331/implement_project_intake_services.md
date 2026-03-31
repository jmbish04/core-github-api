Please ensure that this workflow (docs/20260329/continuous_improvement/seed_project_tasks.py) is setup as a restapi ... so that agents when planning can upsert project_tasks against the :owner/:repo in the src/backend/src/db/schemas/projects/backlog tables 


1) First, create a project by passing in the :owner, :repoName, :projectName -- returns a project id -- new table for projects/backlog/project.ts

2) Upsert the project artifacts (PRD, stitch plan, etc etc) -- new table under projects/backlog/artifacts.ts 
  - id auto pk 
   - project_id (fk to project above)
   - timestamp
   - artifact_type [PRD, etc etc]
    - revision_number 
    - content (the artifact content) 

** goal of this table is we can track changes over time to the artifacts via revisions with diff analysis ... 

3) Upsert epics, tasks, stories, phases  records into src/backend/src/db/schemas/projects/backlog
  - create a phases table under projects/backlog/phases.ts
 - id auto pk
  - project_id (fk to projects.ts in  #1)
   - timestamp
    - number -- in terms of the other phases
     - order -- in terms of the other phases
     - title 
     - description
     - status 
      - assignee
      - notes
      - updates

epics, tasks, stories should also have an fk to project_id and phase_id


4) #1 and #2 are required .. but #3 could be a mixture of 
     - agent upserts all the records (planning was done outside the system)
      - once #1 and #2 are completed, an api request for a planning agent to create #3 records using cloudflare docs mcp, golden paths, standardization rules, etc etc [based on #1 and #2 for context]
        - a mixture of the agent upserting all the tasks, epics, etc then requiesting a planning agent to review and improve and optimize [based on #1 and #2 and #3 for context]

5) Of course we are going to need a rich api for all of these services but this should be made very clean and easy to use and well documented on the frontend docs page, create a sub page for this service 
 -- api must handle create, update, delete (soft delete), revisions, etc 
  -- planning agent should be available on this endpoint 
  -- frontend should offer an input area where I can literally copy and paste a single gemini response which could include the PRD and other artifacts and project_tasks.json ... and then the planning orchestrator should have the ability to accept that payload and then create the recrods for #1, #2, and #3 -- and on the frontend I can see realtime progress of that and also request the planning orchestrator to improve everything etc 