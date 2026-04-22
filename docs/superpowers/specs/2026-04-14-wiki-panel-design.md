# Wiki Panel Design — Knowledge Base View

## Overview

The wiki panel lives in the right side of the deepdive notebook layout (`/deepdive/[id]`). It displays an auto-generated knowledge base built from the user's uploaded sources. The knowledge base has three layers: **communities** (topic clusters), **entities** (individual knowledge nodes), and **relationships** (connections between entities).

## Data Model

### Three Layers

1. **Communities** — Clusters of related entities discovered by Louvain graph clustering. Each community generates a wiki page. Think of them as "topics" or "themes" that emerge from the sources.

2. **Entities** — Individual knowledge nodes extracted by the LLM from source documents. Each has:
   - `id` — slug identifier (e.g., `"lora"`, `"bf16"`)
   - `label` — display name (e.g., `"LoRA"`, `"BF16"`)
   - `type` — one of: `entity`, `concept`, `method`, `person`, `dataset`, `tool`
   - `summary` — one-line description
   - `sourceRefs` — which sources mentioned this entity
   - `community` — which community cluster it belongs to

3. **Relationships** — Edges between entities extracted from source text. Each has:
   - `source` / `target` — entity IDs
   - `relation` — type (e.g., `uses`, `improves`, `extends`, `contradicts`, `component_of`, `authored_by`, `evaluated_on`, `cites`, `alternative_to`)
   - `confidence` — `EXTRACTED` (directly stated, ✓), `INFERRED` (reasonable inference, ~), `AMBIGUOUS` (uncertain, ?)
   - `weight` — 0.0–1.0 confidence score

### Wiki Pages

Each community generates a wiki page stored in the database:
- `slug` — e.g., `"community-0"`
- `title` — named after the most-connected entity in the cluster (e.g., "BF16 & Quantization")
- `content` — LLM-generated markdown with `[[entity-slug]]` wiki links
- `pageType` — `CONCEPT`, `ENTITY`, `SUMMARY`, `COMPARISON`, `ARTICLE`
- `sourceRefs` — source document IDs that contributed to this page

### Graph Data

Stored in `NotebookGraph`:
- `graphData` — `{ nodes: GraphNode[], edges: GraphEdge[] }`
- `communities` — `{ "0": ["node-id-a", "node-id-b"], "1": [...] }`

## Current Layout

The wiki panel is split vertically:
- **Top (55%):** Knowledge base list (expandable community tree)
- **Divider:** Resizable drag handle
- **Bottom (45%):** Interactive force-directed graph visualization

## Component: Knowledge Base List

### Header

```
KNOWLEDGE BASE          4 topics · 12 entities
```

Right side has a health check button and stats.

### Community Item (Expandable)

Each community is a card with a chevron toggle:

**Collapsed state:**
```
▸ BF16 & Quantization
  3 entities · 5 relations · 2 sources
```

- Click chevron → expand/collapse
- Click title → navigate to the community's wiki page

**Expanded state:**
```
▾ BF16 & Quantization
  3 entities · 5 relations · 2 sources
  ─────────────────────────────────
  ENTITIES
  💡 BF16          concept
     "16-bit floating point format for ML training"
  🔧 NVFP4         tool
     "4-bit quantization scheme for neural networks"
  🔧 QeRL          method
     "Quantization-efficient reinforcement learning"
  
  RELATIONSHIPS
  BF16  ─ uses ─→  NVFP4    ✓
  QeRL  ─ extends ─→  BF16  ~
```

### Entity Row

```
[TypeIcon] Label                    type-badge
           One-line summary text
```

- Type icons: 💡 concept, 🔧 method/tool, 👤 person, 📊 dataset, 👥 entity
- Clickable → navigates to the entity's community page
- Summary shown as muted subtitle text

### Relationship Row

```
SourceLabel  [relation badge]  TargetLabel  confidence
```

- Relation shown as a pill/badge with human-readable text (underscores → spaces)
- Confidence indicator: ✓ (extracted), ~ (inferred), ? (ambiguous)
- Source and target labels truncated if too long

### Empty State

When no sources have been added yet:
```
[Lightbulb icon]
Add sources to discover knowledge
```

## Component: Wiki Page View

When user clicks a community title, the full wiki page opens:

### Header
```
← [Back]  Page Title           [Edit]
           N sources
```

### Content
LLM-generated markdown rendered with:
- `[[entity-slug]]` rendered as clickable wiki links (dotted underline, accent color)
- No `[source:id]` inline citations (stripped — source attribution handled separately)
- No "References" section from LLM (stripped)

### Related Sources Section
Below the content, separated by a divider:
```
─────────────────────────
RELATED SOURCES
[📄] Source Title 1        (clickable → opens source in Sources panel)
[📄] Source Title 2
```

These are the accurate `sourceRefs` from the page record, not LLM-generated.

## Component: Graph Visualization

Force-directed graph using `react-force-graph-2d`:

### Nodes
- Circle radius scales with degree (4–10px)
- Color by community (10-color palette)
- Labels appear when zoomed in (threshold: globalScale > 0.4)
- Label truncation varies by zoom level

### Edges
- Opacity/color by confidence: EXTRACTED (visible), INFERRED (semi-transparent), AMBIGUOUS (faint)
- Width by edge weight
- Hover tooltip: `"A → relation_type → B"`

### Interaction
- Click node → navigate to its community page
- Zoom range: 0.2x–6x
- Auto-zoom to fit on load

## Design Principles

1. **Communities are the primary grouping** — they're how the LLM organized the knowledge. Don't fight this structure.
2. **Progressive disclosure** — communities collapsed by default, expand to reveal entities and relationships. Avoids information overload.
3. **Three-layer hierarchy** — Community → Entities + Relationships. Each layer adds detail without leaving the panel.
4. **Accurate source attribution** — use `sourceRefs` from the database, not LLM-generated `[source:id]` citations. The LLM hallucinates references.
5. **Graph as spatial context** — the graph view complements the list by showing spatial relationships. Same click behavior (node → page).
6. **Entity summaries matter** — the one-line summary helps users distinguish between similarly-named entities without opening pages.
7. **Confidence is visible** — ✓/~/? badges on relationships help users gauge knowledge quality.

## Color & Typography

Follows the existing SparkFlow design system:
- `text-foreground` for primary text
- `text-muted-foreground` for secondary/meta text
- `bg-surface-elevated` for card backgrounds
- `border-divider` for card borders
- `hover:bg-surface-hover` for interactive states
- Font sizes: 13px titles, 12px entity labels, 11px relationships, 10px meta text, 9px section headers
- Section headers: `tracking-[1.5px] uppercase font-semibold`
- Accent color on community title hover: `text-accent-red`

## File Locations

| File | Purpose |
|------|---------|
| `components/deepdive/wiki/wiki-panel.tsx` | Main panel: list + page view |
| `components/deepdive/wiki/graph-view.tsx` | Force-directed graph visualization |
| `components/deepdive/wiki/health-check.tsx` | Health check button + dialog |
| `app/api/notebooks/[id]/wiki/route.ts` | GET wiki pages list |
| `app/api/notebooks/[id]/wiki/[slug]/route.ts` | GET/PATCH single wiki page |
| `lib/services/graph-service.ts` | Graph extraction, clustering, page generation |
| `lib/services/wiki-ingest.ts` | Source → wiki pipeline orchestrator |
| `lib/services/wiki-health.ts` | Health check logic |
