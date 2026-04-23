# SparkFlow skills

These Markdown files are example skills for the hermes harness.

## Installation

Copy any file you want to activate into `~/.sparkflow/skills/`:

```bash
mkdir -p ~/.sparkflow/skills
cp apps/agent/skills/defaults/*.md ~/.sparkflow/skills/
```

The hermes `SkillsLoader` scans that directory at first use and caches the index in-memory.

## Authoring

Each skill is a Markdown file with YAML frontmatter:

```yaml
---
name: short-kebab-name
description: One-line summary shown in the system prompt.
applies_to: [notebook, hub]  # empty = any surface
tools_required: [wiki_search, source_read]  # only listed skills appear when ALL required tools are available to the surface
---

# Free-form body — only fetched via ``skill_read(name)`` at the LLM's request.
```

The body is shown to the LLM only when it explicitly calls `skill_read(name)` (progressive disclosure).
