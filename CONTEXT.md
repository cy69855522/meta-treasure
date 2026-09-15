# Progress

## Language

**Project**: Independent work container with its own Now/Next/Later roadmap.

**Task**: A unit of work that may sit in Inbox or belong to one Project lane.

**Lane**: Task placement — Inbox (capture), Now/Next/Later (project rhythm), or Done (history).

**Project Agent**: Advisor bound to exactly one Project; discusses progress, ideas, and confusion using that project's context. Also receives a read-only excerpt of the latest few Steward Message rounds for handoff context, plus the Skills Library catalog (name/description only). Loads a Skill body on demand via getSkill when relevant. May propose changes to Agent Memory Notes and Tasks via tools; changes apply only after the user confirms a preview in chat.

**Steward**: Global advisor (总管家); sees across all Projects and helps with portfolio-level rhythm, trade-offs, and confusion — not bound to one Project. Sees Skills/Rules Library catalogs (name/description only) and loads full bodies on demand via getSkill/getRule. May propose changes to Steward Memory Notes, Tasks (any Project or Inbox), Project Order, Project Piggy Bank membership, Skills Library, and Rules Library via tools; same confirm-before-apply gate.

**Agent Memory Note**: Editable long-lived note for a Project (goals, constraints, open questions) that the Project Agent always sees; the Steward also reads these notes as cross-project context.

**Agent Message**: One user or assistant turn in a Project Agent conversation.

**Steward Message**: One user or assistant turn in the Steward conversation; stored separately from Agent Messages.

**Steward Memory Note**: Editable long-lived note for the whole workspace (portfolio constraints, weekly focus, cross-project agreements) that the Steward always sees.

**Agent API**: External HTTP automation entry (`/api/v1` + API key) for creating/updating Tasks — not the Project Agent chat advisor.

**Skills Library**: Personal collection of Agent Skills, organized in folders.

**Skill Folder**: Named container inside the Skills Library that groups related Skills.

**Skill**: A Cursor-style Agent Skill with `name`, `description`, markdown body (SKILL.md shape), and a **Library Usage Mode**; a procedural playbook.

**Rules Library**: Personal collection of Agent Rules, organized in folders (parallel to the Skills Library).

**Rule Folder**: Named container inside the Rules Library that groups related Rules.

**Rule**: A Cursor-style standing constraint with `name`, `description`, markdown body, and a **Library Usage Mode**; persistent guidance (like `.cursor/rules`), not a step-by-step Skill.

**Library Usage Mode**: How a Skill or Rule is loaded into agent turns — **required** (必须使用: body injected every turn) or **on_demand** (按需使用: catalog + getSkill/getRule / slash when relevant).

**Project Order**: The display order of active Projects in the workspace sidebar; Steward may propose a full reorder via tool, applied only after user confirmation. Piggy-bank Projects are excluded.

**Project Piggy Bank**: Holding place for Projects the user is not actively pursuing; parked Projects are hidden from the main sidebar and excluded from Project Order. The Steward still sees their board and Agent Memory Notes in the piggy-bank snapshot. Users (and Steward tools) can move Projects in or out; restoring places a Project at the end of the active list.

**Toolbox**: App section for standalone utilities (outside Project Agent / Steward chat).

**Deep Research**: Toolbox tool that searches WeChat Official Account articles and Zhihu via TikHub, returning grouped links and metadata (no summarization in v1). Implemented as `@progress/deep-research` under `package/deep_research`.

## Relationships

- A Project has many Tasks.
- A Project has at most one Project Agent.
- There is exactly one Steward for the whole workspace.
- A Project Agent conversation is a sequence of Agent Messages scoped to that Project.
- The Steward conversation is a sequence of Steward Messages (not scoped to a Project).
- Chat UI loads the latest 30 messages first; scrolling to the top loads 30 older messages at a time.
- The Toolbox hosts Deep Research and other utilities; Deep Research calls `@progress/deep-research` (TikHub WeChat + Zhihu search; one request per source, no topK trim).
- A Project has many Agent Memory Notes.
- The Project Agent reads the live Task board; the board is not stored as Agent memory.
- The Project Agent also reads a short recent Steward Message excerpt (read-only); project board and Agent Memory Notes remain the source of truth for that Project.
- The Steward has many Steward Memory Notes.
- The Steward reads live boards and Agent Memory Notes across all Projects.
- Mutating tools (notes / tasks / completeTask / Project Order / Project Piggy Bank / Skills Library / Rules Library) pause for in-chat before/after preview; only user approval executes them.
- Projects have a workspace-wide Project Order over active Projects only; Steward may propose reordering that full list; Project Agent cannot.
- A Project is either active or in the Project Piggy Bank (not both for sidebar purposes).
- The Steward portfolio snapshot includes active Projects and Project Piggy Bank Projects (boards + Agent Memory Notes for both).
- The Steward also reads Inbox Tasks (unassigned capture) and catalogs of the Skills Library and Rules Library (folder/item ids + name + description only, not body).
- The Project Agent also reads the Skills Library catalog (same shape); both Steward and Project Agent load on-demand Skill bodies with getSkill when relevant; required Skills have their bodies injected every turn.
- Function tool calls (including read-only getSkill/getRule) are shown in the chat message UI.
- The Skills Library contains many Skill Folders.
- A Skill Folder contains many Skills.
- The Rules Library contains many Rule Folders.
- A Rule Folder contains many Rules.
- Each Skill and Rule has a Library Usage Mode (required or on_demand); Steward also auto-injects required Rules each turn.

## Flagged ambiguities

- "Agent" alone is ambiguous — resolved: use **Project Agent** for the per-project chat advisor; use **Steward** for the global advisor; use **Agent API** for the external task-write HTTP API.
- "总管家" — resolved: domain term **Steward** (UI may still show 总管家).
- Steward skill/rule context — resolved: catalog only (folder/item ids + name + description); full body via read-only getSkill/getRule tools; Steward may mutate libraries via tools after confirmation; when creating/copying, follow user instructions and preserve source body unless asked to rewrite.
- Project Agent skill context — resolved: same Skills catalog; required Skills auto-injected each turn; on-demand Skills via getSkill / slash; Project Agent does not mutate the Skills Library or use Rules Library tools.
- Library Usage Mode — resolved: **required** = 必须使用 (inject body every turn); **on_demand** = 按需使用 (catalog + getSkill/getRule); applies to both Skills and Rules (Steward injects required Rules).
- Steward vs Project Agent scope — resolved: Project Agent is single-Project progress (+ Skills catalog); Steward is portfolio-level and also sees Inbox + Skills/Rules catalogs.
- Steward → Project Agent handoff — resolved: each Project Agent prompt includes the latest 3 Steward dialogue rounds (up to 6 messages) as read-only context; no filter by project name.
- Steward Done history depth — resolved: last 10 completed Tasks per Project (title + start/complete times) in each prompt snapshot.
- "Memory" alone is ambiguous — resolved: **Agent Memory Note** + **Agent Message** history; Task board state is live fact, not memory.
- "Skill" vs project work — resolved: **Skill** means Agent Skill documents in the Skills Library, not a Project Task.
- Skill vs Rule — resolved: **Skill** = on-demand procedural playbook; **Rule** = standing constraints/preferences (Cursor rules vs skills).
- Read-only advisors — resolved: both may mutate via tools after user confirmation; they are not silent writers.
- Project sorting — resolved: **Project Order** is a full-list reorder (not single-item move); Steward-only; the proposed order must list every active Project exactly once (incomplete lists are rejected); piggy-bank Projects are excluded.
- Parked / shelved projects — resolved: domain term **Project Piggy Bank** (UI: 项目储蓄罐).
