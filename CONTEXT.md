# Progress

## Language

**Project**: Independent work container with its own Now/Next/Later roadmap.

**Task**: A unit of work that may sit in Inbox or belong to one Project lane.

**Lane**: Task placement — Inbox (capture), Now/Next/Later (project rhythm), or Done (history).

**Project Agent**: Advisor bound to exactly one Project; discusses progress, ideas, and confusion using that project's context. Also receives a read-only excerpt of the latest few Steward Message rounds for handoff context, plus the Skills Library and Rules Library catalogs (name/description only). Loads Skill/Rule bodies on demand via getSkill/getRule when relevant. May propose changes to Agent Memory Notes, Tasks, Skills Library, and Rules Library via tools; changes apply only after the user confirms a preview in chat. May use two-phase web search tools (`webSearch` → `fetchPages`) for WeChat / Baidu / Google, and `fetchUrl` to read a specific URL directly (native HTTP fetch in Progress, falling back to local headless Chrome when blocked; failures are shown, not hidden).

**Steward**: Global advisor (总管家); sees across all Projects and helps with portfolio-level rhythm, trade-offs, and confusion — not bound to one Project. Sees Skills/Rules Library catalogs (name/description only) and loads full bodies on demand via getSkill/getRule. May propose changes to Steward Memory Notes, Tasks (any Project or Inbox), Project Order, Project Piggy Bank membership, Skills Library, and Rules Library via tools; same confirm-before-apply gate. May use the same two-phase web search tools as the Project Agent.

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

**Toolbox**: App section for utilities and shortcuts outside Project Agent / Steward chat; its Deep Radar and Hot Radar cards open their integrated workspaces in new browser tabs.

**Deep Radar**: Integrated Progress workspace for Deep Research, its Knowledge Base, and research settings; it opens in a new browser tab with its own focused navigation and does not include Skills or Rules management.

**Codex Runtime**: The shared Progress execution environment and model catalog used by Project Agents, the Steward, and Deep Radar; each consumer may select its own model from that catalog.

**Deep Radar Settings**: Research-specific configuration for the selected research model, maximum research rounds, and enabled information sources; visual theme remains a workspace-wide Progress setting.

**Deep Radar Research Session**: One persistent Deep Research conversation, including its messages, research state, sources, and report; existing sessions remain available after Deep Radar is integrated into Progress.

**Deep Radar Store**: The SQLite store owned by Deep Radar Research Sessions; it runs in the Progress process but remains separate from the Progress project-management store.

**Deep Research package**: Internal `@progress/deep-research` search and extraction library under `package/deep_research`, shared by agent `webSearch`/`fetchPages` and the Deep Radar research pipeline.

**Hot Radar**: Integrated Progress workspace for monitoring Reddit weekly hot posts and reading extracted post or linked-page text; it uses its own focused navigation and the Progress global theme.

**Hot Radar Store**: Dedicated SQLite store for Reddit synchronization runs, ranked posts, and extracted text; it is accessed directly by the Progress process.

**Hot Radar History**: Read-only weekly snapshots of automatically fetched Reddit rankings and extracted text, selected by fetch date from the Hot Radar right sidebar and browsable by subreddit in the main view.

## Relationships

- A Project has many Tasks.
- A Project has at most one Project Agent.
- There is exactly one Steward for the whole workspace.
- A Project Agent conversation is a sequence of Agent Messages scoped to that Project.
- The Steward conversation is a sequence of Steward Messages (not scoped to a Project).
- Chat UI loads the latest 30 messages first; scrolling to the top loads 30 older messages at a time.
- The Toolbox Deep Radar card opens the integrated Deep Radar workspace in a new browser tab.
- The Toolbox Hot Radar card opens the integrated Hot Radar workspace in a new browser tab.
- The Deep Radar browser tab uses its own focused shell rather than the Progress project sidebar; its navigation contains Settings, Favorites, Deep Research, and Knowledge Base.
- Deep Radar contains Settings, Favorites, Deep Research, and Knowledge Base capabilities; Skills and Rules management remain Progress capabilities outside Deep Radar.
- Favorited research reports are listed in Deep Radar Favorites and injected as an id/title/snippet catalog into Project Agent and Steward prompts; agents load full report bodies on demand via deepRadarReport.
- Deep Radar research does not read or apply the Progress Skills Library or Rules Library.
- Deep Radar uses the shared Progress Codex Runtime while retaining its own research-model selection.
- The Progress theme applies to the Deep Radar workspace; Deep Radar Settings do not own a separate theme.
- Agent chat uses `@progress/deep-research` via `webSearch`/`fetchPages`; Deep Radar reuses the same package inside its longer interview, outline, search-loop, and report workflow.
- Existing Deep Radar Research Sessions are migrated into Progress once; after migration, Progress does not read research history from the old Deep Radar repository.
- Progress and Deep Radar use separate SQLite stores within the same application process; this boundary does not involve a network or process bridge.
- Hot Radar runs in the Progress application process, while its Reddit history remains in a dedicated Hot Radar Store.
- Hot Radar starts its Reddit monitor when its workspace or synchronization API is first opened; it does not require a separate server.
- Hot Radar refreshes only through its weekly system monitor; users cannot manually trigger or restart synchronization.
- Each automatic weekly fetch remains available through Hot Radar History rather than replacing older dates.
- The Progress theme applies to Hot Radar; Hot Radar does not own a second theme setting.
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
- The Project Agent also reads the Skills Library and Rules Library catalogs (same shape); both Steward and Project Agent load on-demand Skill/Rule bodies with getSkill/getRule when relevant; required Skills and Rules have their bodies injected every turn.
- Function tool calls (including read-only getSkill/getRule) are shown in the chat message UI.
- The Skills Library contains many Skill Folders.
- A Skill Folder contains many Skills.
- The Rules Library contains many Rule Folders.
- A Rule Folder contains many Rules.
- Each Skill and Rule has a Library Usage Mode (required or on_demand); both Steward and Project Agent auto-inject required items each turn and may mutate both libraries via tools after confirmation.

## Flagged ambiguities

- "Agent" alone is ambiguous — resolved: use **Project Agent** for the per-project chat advisor; use **Steward** for the global advisor; use **Agent API** for the external task-write HTTP API.
- "总管家" — resolved: domain term **Steward** (UI may still show 总管家).
- Steward skill/rule context — resolved: catalog only (folder/item ids + name + description); full body via read-only getSkill/getRule tools; Steward may mutate libraries via tools after confirmation; when creating/copying, follow user instructions and preserve source body unless asked to rewrite.
- Project Agent skill/rule context — resolved: same Skills and Rules catalogs as Steward; required items auto-injected each turn; on-demand via getSkill/getRule / slash; Project Agent may mutate both libraries via the same tools after confirmation.
- Library Usage Mode — resolved: **required** = 必须使用 (inject body every turn into Steward and Project Agent); **on_demand** = 按需使用 (catalog + getSkill/getRule).
- Steward vs Project Agent scope — resolved: Project Agent is single-Project progress (+ Skills/Rules catalogs and library mutation); Steward is portfolio-level (Inbox + Project Order + Piggy Bank + same library tools).
- Steward → Project Agent handoff — resolved: each Project Agent prompt includes the latest 3 Steward dialogue rounds (up to 6 messages) as read-only context; no filter by project name.
- Steward Done history depth — resolved: last 10 completed Tasks per Project (title + start/complete times) in each prompt snapshot.
- "Memory" alone is ambiguous — resolved: **Agent Memory Note** + **Agent Message** history; Task board state is live fact, not memory.
- "Skill" vs project work — resolved: **Skill** means Agent Skill documents in the Skills Library, not a Project Task.
- Skill vs Rule — resolved: **Skill** = on-demand procedural playbook; **Rule** = standing constraints/preferences (Cursor rules vs skills).
- Read-only advisors — resolved: both may mutate via tools after user confirmation; they are not silent writers.
- Project sorting — resolved: **Project Order** is a full-list reorder (not single-item move); Steward-only; the proposed order must list every active Project exactly once (incomplete lists are rejected); piggy-bank Projects are excluded.
- Parked / shelved projects — resolved: domain term **Project Piggy Bank** (UI: 项目储蓄罐).
- Deep Radar history migration — resolved: preserve and migrate all existing Deep Radar Research Sessions into Progress, with no runtime dependency on the old Deep Radar repository.
- Deep Radar Skills/Rules boundary — resolved: do not migrate Deep Radar Skills or Rules, and do not inject Progress Skills or Rules into Deep Radar research.
- Deep Radar Codex isolation — resolved: use the shared Progress Codex Runtime and model catalog instead of maintaining a second Deep Radar Codex Home and execution service.
- Deep Radar theme/settings boundary — resolved: Progress owns the global theme; migrate Deep Radar's research model, maximum rounds, and information-source selections as Deep Radar Settings.
- Deep Radar storage boundary — resolved: keep Deep Radar Research Sessions in a dedicated Deep Radar Store rather than merging their tables into the Progress project-management store.
- Deep Radar workspace shell — resolved: open the integrated `/deep-radar` workspace in a new tab with its own three-item navigation and route research reports within that workspace.
- Hot Radar runtime boundary — resolved: integrate it under `/hot-radar`, use the Progress process and global theme, retain a separate SQLite store, and remove the standalone 1315-port dependency.
- Hot Radar refresh authority — resolved: only the system monitor may fetch new Reddit data; the UI and API expose no manual refresh operation, and older automatic snapshots remain read-only history.
