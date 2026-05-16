# hd-config.md

Harness configuration for this portfolio. Schema v5. Read by `/hd:review` and re-runs of `/hd:setup`.

```yaml
schema_version: "5"
setup_mode: greenfield
setup_date: 2026-05-15
team_size: solo
scaffold_mode: standard
article_read: false

skipped_layers:
  - L2  # skills — add later when repeated procedures emerge (e.g., "add new article")
  - L3  # orchestration — solo project, no PM tool

team_tooling:
  docs: []
  design: []
  diagramming: []
  analytics: []
  pm: []
  comms: []
  cli: []
  data_api: []

mcp_servers_at_setup: []

other_tool_harnesses_detected:
  - path: .claude/
    note: nominal — only settings.local.json + empty commands/. Treated as inert.

layer_decisions:
  L1_context: create
  L2_skills: skip
  L3_orchestration: skip
  L4_rubrics: create_starter_trio
  L5_knowledge: create
```

## Notes

- Greenfield setup. No prior harness content to coexist with.
- L1 + L4 + L5 cover the user's stated goal: an agent that learns preferences across sessions.
- L2 (skills) and L3 (orchestration) deferred. Re-run `/hd:setup --reset-skips` when patterns emerge.
- Auto-memory at `~/.claude/projects/-Users-kelly-learning-learning/memory/` complements this harness — that's user-level; this is project-level.
