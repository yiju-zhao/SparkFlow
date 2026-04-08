# Graph-Enhanced Wiki — Design Spec

**Date:** 2026-04-08
**Status:** Approved
**Scope:** Add knowledge graph layer to notebook wiki — graph-first ingest, community-based retrieval, interactive visualization
**Inspired by:** [Graphify v3](https://github.com/safishamsi/graphify/tree/v3) — applying graph-native knowledge representation to SparkFlow's LLM Wiki

## Problem

The current wiki produces flat pages with `[[slug]]` links. There's no structured relationship data between entities, no confidence tracking on claims, no way to discover non-obvious connections, and source removal requires expensive LLM rewriting.

## Solution

Store a **knowledge graph** (nodes + typed edges) as the primary artifact per notebook. Wiki pages become a **readable projection** generated from graph communities. This enables:
- Typed relationships with confidence (EXTRACTED/INFERRED/AMBIGUOUS)
- Community-based retrieval (Leiden clustering)
- Deterministic source removal (filter graph, re-cluster, regenerate)
- Interactive graph visualization

## Architecture

```
Source → Extract (LLM → structured nodes + edges)
       → Merge (into existing graph)
       → Cluster (Leiden, no LLM)
       → Generate wiki pages (LLM, from communities)
       → Store (graph JSON + wiki pages in PG)
```

The graph is the source of truth. Wiki pages are a cache of the human-readable view. The agent reads wiki pages (community-level) for queries.

## Data Model

### NotebookGraph (new)

```prisma
model NotebookGraph {
  id          String   @id @default(cuid())
  notebookId  String   @unique
  graphData   Json     // {nodes: [...], edges: [...]}
  communities Json     // {community_id: [node_ids]}
  updatedAt   DateTime @updatedAt

  notebook Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  @@map("notebook_graphs")
}
```

**Node schema:**
```json
{
  "id": "qerl",
  "label": "QERL",
  "type": "entity|concept|method|person|dataset",
  "summary": "Quantization-Enhanced Low-Rank RL for LLMs",
  "sourceRefs": ["source-id-1"],
  "community": 0
}
```

**Edge schema:**
```json
{
  "source": "qerl",
  "target": "ppo",
  "relation": "improves|uses|alternative_to|component_of|authored_by",
  "confidence": "EXTRACTED|INFERRED|AMBIGUOUS",
  "weight": 0.8,
  "sourceRef": "source-id-1"
}
```

### WikiPage (kept, content changes)

Same table, but pages are now generated from communities:
- **Community pages** (pageType: CONCEPT) — all nodes + edges in a community, narrative form
- **God node pages** (pageType: ENTITY) — high-degree nodes with all neighbors by relation type
- **Index** — community catalog with node counts and bridge edges
- **Log** — unchanged

### Notebook (modified)

Add relation: `graph NotebookGraph?`

## Ingest Pipeline

All runs in Next.js (TypeScript). No Python agent dependency.

### Step 1: Extract (LLM)

OpenAI SDK call with structured JSON output:

```json
{
  "nodes": [
    {"id": "slug", "label": "Display Name", "type": "method", "summary": "one-line description"}
  ],
  "edges": [
    {"source": "slug-a", "target": "slug-b", "relation": "uses", "confidence": "EXTRACTED", "weight": 1.0}
  ],
  "normalizedTitle": "Author — Title, Year"
}
```

Extraction rules (from Graphify):
- Every edge tagged: EXTRACTED (directly stated, weight 1.0), INFERRED (reasonable, weight 0.6-0.9), AMBIGUOUS (uncertain, weight 0.1-0.3)
- Node types: entity, concept, method, person, dataset, tool
- Relation types: uses, improves, alternative_to, component_of, authored_by, evaluated_on, contradicts, extends, cites
- Only genuinely important entities — not every noun

### Step 2: Merge (deterministic)

Pure TypeScript. Merge new nodes/edges into existing graph:
- New node ID exists → append sourceRef, keep richer summary
- New edge between existing nodes → keep higher confidence, merge sourceRefs
- Deduplicate by node ID and edge (source, target, relation) tuple

### Step 3: Cluster (algorithmic)

`graphology` + `graphology-communities-louvain` in Node.js:
- Run Louvain community detection on full graph
- Assign community ID to each node
- Identify bridge edges (cross-community connections)
- Identify god nodes (highest degree per community)

Milliseconds for ~500 nodes. No LLM needed.

### Step 4: Generate wiki pages (LLM)

One OpenAI call per affected community:
- Input: community nodes + edges + bridge edges
- Output: narrative markdown page with `[[slug]]` links and `[source:id]` citations
- Plus: god node pages for high-degree entities
- Plus: rebuilt index page

### Step 5: Store

- `NotebookGraph.graphData` updated with merged graph
- `NotebookGraph.communities` updated with cluster results
- WikiPage records upserted for affected communities
- Log appended

## Source Removal

Deterministic graph operations — no LLM for removal, only for regeneration:

1. Filter: remove nodes where `sourceRefs` only contains deleted sourceId
2. Update: for shared nodes, remove sourceId from `sourceRefs` array
3. Clean: remove edges that reference deleted nodes or only cite deleted source
4. Re-cluster: Louvain on modified graph
5. Regenerate: LLM rewrites affected community pages (only changed communities)
6. Log: record removal

## Query System

Agent uses existing wiki tools with progressive disclosure:

```
wiki_list() → community index (titles + node counts + bridge summary)
wiki_read(slug) → full community page (all nodes, edges, confidence)
```

**Same-community question:** Load one community page → answer from rich context.
**Cross-community question:** Load source community → follow bridge edge → load target community → synthesize.

No new tools needed. Communities are just wiki pages.

## Visualization

### Wiki tab gets a view toggle:

```
[📋 Pages] [🔗 Graph]
```

**Graph view** using `react-force-graph-2d`:
- Nodes colored by community
- Edge thickness by weight, style by confidence (solid/dashed/dotted)
- Click node → opens community wiki page
- Hover → label + type + connection count
- Data source: `NotebookGraph.graphData` (already in client from page.tsx fetch)

## Tech Stack (JS-only, no Python)

| Component | Library |
|-----------|---------|
| Graph data structure | `graphology` |
| Community detection | `graphology-communities-louvain` |
| Graph visualization | `react-force-graph-2d` |
| LLM extraction + generation | OpenAI SDK (already installed) |
| Storage | Prisma + PostgreSQL JSON columns |

## What Changes from Current Wiki

| Current | Graph-Enhanced |
|---------|---------------|
| LLM writes free-text pages directly | LLM extracts structured graph → pages generated from communities |
| Flat page list | Pages organized by auto-discovered communities |
| `[[slug]]` links (manual) | Typed edges with confidence (EXTRACTED/INFERRED/AMBIGUOUS) |
| Source removal: LLM rewrites pages | Source removal: filter graph → re-cluster → regenerate |
| No visualization | Interactive graph in wiki tab |
| Agent reads pages one by one | Agent reads community pages (pre-compiled rich context) |

## Migration

1. Add `NotebookGraph` model to Prisma schema
2. Install `graphology`, `graphology-communities-louvain`, `react-force-graph-2d`
3. Create `lib/services/graph-service.ts` — extract, merge, cluster, generate
4. Rewrite `wiki-ingest.ts` to use graph service
5. Rewrite source removal to use graph operations
6. Add graph view toggle to wiki panel
7. Existing notebooks: graph starts empty, builds as sources are (re-)ingested
