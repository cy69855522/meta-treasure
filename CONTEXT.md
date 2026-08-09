# Progress

## Language

**Project**: Independent work container with its own Now/Next/Later roadmap.

**Task**: A unit of work that may sit in Inbox or belong to one Project lane.

**Lane**: Task placement — Inbox (capture), Now/Next/Later (project rhythm), or Done (history).

**Project Agent**: Advisor bound to exactly one Project; discusses progress, ideas, and confusion using that project's context. Also receives a read-only excerpt of the latest few Steward Message rounds for handoff context. May propose changes to Agent Memory Notes and Tasks via tools; changes apply only after the user confirms a preview in chat.

**Steward**: Global advisor (总管家); sees across all Projects and helps with portfolio-level rhythm, trade-offs, and confusion — not bound to one Project. May propose changes to Steward Memory Notes, Tasks (any Project or Inbox), Project Order, Project Piggy Bank membership, Skills Library, and Rules Library via tools; same confirm-before-apply gate.

**Agent Memory Note**: Editable long-lived note for a Project (goals, constraints, open questions) that the Project Agent always sees; the Steward also reads these notes as cross-project context.

**Agent Message**: One user or assistant turn in a Project Agent conversation.

**Steward Message**: One user or assistant turn in the Steward conversation; stored separately from Agent Messages.

**Steward Memory Note**: Editable long-lived note for the whole workspace (portfolio constraints, weekly focus, cross-project agreements) that the Steward always sees.

**Agent API**: External HTTP automation entry (`/api/v1` + API key) for creating/updating Tasks — not the Project Agent chat advisor.

**Skills Library**: Personal collection of Agent Skills, organized in folders.

**Skill Folder**: Named container inside the Skills Library that groups related Skills.

**Skill**: A Cursor-style Agent Skill with `name`, `description`, and markdown body (SKILL.md shape); a procedural playbook invoked when relevant.

**Rules Library**: Personal collection of Agent Rules, organized in folders (parallel to the Skills Library).

**Rule Folder**: Named container inside the Rules Library that groups related Rules.

**Rule**: A Cursor-style standing constraint with `name`, `description`, and markdown body; persistent guidance (like `.cursor/rules`), not a step-by-step Skill.

**Project Order**: The display order of active Projects in the workspace sidebar; Steward may propose a full reorder via tool, applied only after user confirmation. Piggy-bank Projects are excluded.

**Project Piggy Bank**: Holding place for Projects the user is not actively pursuing; parked Projects are hidden from the main sidebar and excluded from Project Order. Users (and Steward tools) can move Projects in or out; restoring places a Project at the end of the active list.

## Relationships

- A Project has many Tasks.
- A Project has at most one Project Agent.
- There is exactly one Steward for the whole workspace.
- A Project Agent conversation is a sequence of Agent Messages scoped to that Project.
- The Steward conversation is a sequence of Steward Messages (not scoped to a Project).
- A Project has many Agent Memory Notes.
- The Project Agent reads the live Task board; the board is not stored as Agent memory.
- The Project Agent also reads a short recent Steward Message excerpt (read-only); project board and Agent Memory Notes remain the source of truth for that Project.
- The Steward has many Steward Memory Notes.
- The Steward reads live boards and Agent Memory Notes across all Projects.
- Mutating tools (notes / tasks / Project Order / Project Piggy Bank / Skills Library / Rules Library) pause for in-chat before/after preview; only user approval executes them.
- Projects have a workspace-wide Project Order over active Projects only; Steward may propose reordering that full list; Project Agent cannot.
- A Project is either active or in the Project Piggy Bank (not both for sidebar purposes).
- The Steward also reads Inbox Tasks (unassigned capture) and catalogs of the Skills Library and Rules Library (folder/item ids + name + description only, not body).
- The Skills Library contains many Skill Folders.
- A Skill Folder contains many Skills.
- The Rules Library contains many Rule Folders.
- A Rule Folder contains many Rules.

## Flagged ambiguities

- "Agent" alone is ambiguous — resolved: use **Project Agent** for the per-project chat advisor; use **Steward** for the global advisor; use **Agent API** for the external task-write HTTP API.
- "总管家" — resolved: domain term **Steward** (UI may still show 总管家).
- Steward skill/rule context — resolved: catalog only (folder/item ids + name + description); not full Skill/Rule body; Steward may mutate libraries via tools after confirmation.
- Steward vs Project Agent scope — resolved: Project Agent is single-Project progress; Steward is portfolio-level and also sees Inbox + Skills catalog.
- Steward → Project Agent handoff — resolved: each Project Agent prompt includes the latest 3 Steward dialogue rounds (up to 6 messages) as read-only context; no filter by project name.
- Steward Done history depth — resolved: last 10 completed Tasks per Project (title + start/complete times) in each prompt snapshot.
- "Memory" alone is ambiguous — resolved: **Agent Memory Note** + **Agent Message** history; Task board state is live fact, not memory.
- "Skill" vs project work — resolved: **Skill** means Agent Skill documents in the Skills Library, not a Project Task.
- Skill vs Rule — resolved: **Skill** = on-demand procedural playbook; **Rule** = standing constraints/preferences (Cursor rules vs skills).
- Read-only advisors — resolved: both may mutate via tools after user confirmation; they are not silent writers.
- Project sorting — resolved: **Project Order** is a full-list reorder (not single-item move); Steward-only; the proposed order must list every active Project exactly once (incomplete lists are rejected); piggy-bank Projects are excluded.
- Parked / shelved projects — resolved: domain term **Project Piggy Bank** (UI: 项目储蓄罐).
