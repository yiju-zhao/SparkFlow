# Feature Research

**Domain:** AI-native insight/research platform with generative UI
**Researched:** 2026-03-04
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Source-based chat with citations | Core value of RAG platforms — users expect verifiable AI responses | HIGH | NotebookLM has set the standard with clickable citations linking to exact passages |
| Document/webpage upload & processing | Users expect to add their own content for analysis | MEDIUM | RagFlow handles chunking/indexing; MinIO for storage |
| Session/conference list browsing | Research Hub requires basic content discovery | LOW | List view with filters (by conference, date, topic, speaker) |
| Search functionality | Users expect to find content quickly | MEDIUM | Full-text search across sessions, documents, notes |
| Basic filters and sorting | Standard pattern for content-heavy platforms | LOW | Filter by conference, date, tags; sort by relevance, date |
| User authentication | Required for personalization and data privacy | MEDIUM | NextAuth already implemented |
| Note-taking capability | Research tools need a place to capture insights | MEDIUM | Existing notebook system covers this |
| Session detail view | Users expect to see full session information | LOW | Title, description, speakers, tags, related content |
| Personal workspace | Users expect their content to be organized | LOW | Notebooks structure already provides this |
| Responsive design | Modern web apps must work on all screen sizes | MEDIUM | Mobile-first patterns for conference attendees |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Generative UI (dynamic component rendering) | AI creates custom interfaces on demand — charts, tables, network views based on user queries | HIGH | Core differentiator — requires CopilotKit + MCP Apps + AG-UI integration |
| Proactive AI suggestions | AI surfaces related sessions, connections, insights without being asked | HIGH | Moves from reactive to anticipatory AI experience |
| Hub → Notebook import flow | Seamless transition from discovery (Hub) to deep analysis (Notebook) with RAG | MEDIUM | Leverages existing RAG capabilities for session content |
| AI-generated knowledge graphs | Visualizes relationships between sessions, topics, speakers | HIGH | Obsidian Canvas patterns show value of visual research |
| Contextual conversation memory | AI remembers across Hub and Notebook contexts | MEDIUM | LangGraph agents with state management |
| Multi-modal query support | Users can ask questions with mixed constraints (e.g., "AI sessions about healthcare after lunch") | HIGH | Requires sophisticated query parsing |
| Collaborative research | Teams can share insights, notes, and AI-generated views | MEDIUM | Defer to v1.x — complexity for v1 |
| Automated research summaries | AI generates session summaries, key takeaways, action items | MEDIUM | NotebookLM's Deep Research shows this value |
| Cross-session pattern detection | AI identifies themes spanning multiple conferences/sessions | HIGH | Unique value for industry analysts |
| Research timeline/chronology | View insights across temporal patterns in industry discourse | MEDIUM | Valuable for trend analysis |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time conference streaming | Users want live content | Massive complexity — video processing, live transcription, sync issues | Focus on post-event analysis where value is higher |
| Mobile native app | Users want offline access | Doubles development effort; web-first is sufficient for v1 | Progressive Web App (PWA) for offline capability |
| Public API for third-party integrations | Users want extensibility | Adds maintenance burden, security complexity, API design overhead | Internal APIs first; external API deferred to v2 |
| Social features (likes, comments, sharing) | Users want community engagement | Requires moderation, adds scope, distracts from core research value | Focus on personal research workflow first |
| Video content processing | Users want to analyze conference talks | Complexity explosion — audio extraction, transcription, speaker diarization | Text-first approach with session transcripts/summaries |
| Real-time collaboration | Users want to work together | Adds complexity with conflict resolution, state sync, permissions | Async collaboration through shared notebooks |
| Advanced analytics dashboards | Users want insights into their research | Build something users may not need; generative UI can create views on demand | Let AI create relevant views dynamically |

## Feature Dependencies

```
[Source ingestion & RAG pipeline]
    └──requires──> [Chat with citations]
                       └──requires──> [Session → Notebook import]
                                          └──enhances──> [Deep research analysis]

[CopilotKit framework]
    └──requires──> [Generative UI capability]
                       └──enhances──> [Proactive AI suggestions]

[Conference/session data model]
    └──requires──> [Hub browsing & filtering]
                       └──enhances──> [AI pattern detection]

[LangGraph agent orchestration]
    └──requires──> [Contextual conversation memory]
                       └──enhances──> [Cross-session pattern detection]
```

### Dependency Notes

- **Source ingestion & RAG pipeline requires Chat with citations:** Without proper retrieval and source attribution, AI responses cannot be verified — a core expectation of research platforms
- **CopilotKit framework requires Generative UI capability:** The framework enables dynamic UI generation, which is our key differentiator
- **Conference/session data model requires Hub browsing & filtering:** Without structured data, there's nothing to browse and filter in the Research Hub
- **LangGraph agent orchestration requires Contextual conversation memory:** Multi-turn conversations require state management, which LangGraph provides
- **Session → Notebook import enhances Deep research analysis:** Importing sessions into notebooks enables deeper RAG-powered analysis beyond what's available in the Hub
- **Generative UI capability enhances Proactive AI suggestions:** Dynamic interfaces make proactive suggestions more actionable and interactive
- **Hub browsing & filtering enhances AI pattern detection:** Better navigation enables users to discover patterns the AI identifies
- **Contextual conversation memory enhances Cross-session pattern detection:** Memory across conversations enables AI to identify long-term patterns

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **Chat with citations** — Core value of RAG platforms; users expect verifiable AI responses linked to sources
- [ ] **Conference/session list browsing** — Research Hub requires basic content discovery (table stakes)
- [ ] **Basic search and filtering** — Users expect to find content quickly (table stakes)
- [ ] **Session detail view** — Users expect to see full session information (table stakes)
- [ ] **Generative UI foundation** — Key differentiator; AI must be able to create simple dynamic views (charts, tables) from queries
- [ ] **Hub → Notebook import flow** — Seamless transition from discovery to deep analysis leverages existing RAG capabilities
- [ ] **Proactive AI suggestions (basic)** — AI surfaces related sessions based on current context without being asked

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Advanced generative UI components** — Network views, interactive dashboards, custom visualizations
- [ ] **AI-generated knowledge graphs** — Visualizes relationships between sessions, topics, speakers
- [ ] **Cross-session pattern detection** — AI identifies themes spanning multiple conferences/sessions
- [ ] **Automated research summaries** — AI generates session summaries, key takeaways, action items
- [ ] **Collaborative research** — Teams can share insights, notes, and AI-generated views

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Real-time conference streaming** — Focus on post-event analysis; live streaming adds massive complexity
- [ ] **Mobile native app** — Web-first approach sufficient; consider PWA for offline capability
- [ ] **Public API for third-party integrations** — Internal APIs first; external API when demand exists
- [ ] **Social features** — Community engagement is secondary to personal research value
- [ ] **Video content processing** — Text-first approach; defer video analysis capabilities

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chat with citations | HIGH | MEDIUM | P1 |
| Conference/session list browsing | HIGH | LOW | P1 |
| Basic search and filtering | HIGH | MEDIUM | P1 |
| Session detail view | HIGH | LOW | P1 |
| Generative UI foundation | HIGH | HIGH | P1 |
| Hub → Notebook import flow | HIGH | MEDIUM | P1 |
| Proactive AI suggestions (basic) | HIGH | HIGH | P1 |
| Advanced generative UI components | MEDIUM | HIGH | P2 |
| AI-generated knowledge graphs | MEDIUM | HIGH | P2 |
| Cross-session pattern detection | HIGH | HIGH | P2 |
| Automated research summaries | MEDIUM | MEDIUM | P2 |
| Collaborative research | MEDIUM | HIGH | P2 |
| Real-time conference streaming | MEDIUM | VERY HIGH | P3 |
| Mobile native app | LOW | HIGH | P3 |
| Public API for third-party integrations | LOW | MEDIUM | P3 |
| Social features | LOW | MEDIUM | P3 |
| Video content processing | LOW | VERY HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | NotebookLM | Perplexity | Obsidian (with plugins) | Our Approach |
|---------|-----------|------------|------------------------|--------------|
| Source-based citations | Excellent | Good | Variable (plugin-dependent) | Build on existing RAG pipeline with RagFlow |
| Document/webpage upload | Excellent | Good | Manual | Existing via MinIO + RagFlow |
| Generative UI | Limited | Emerging (Perplexity Labs) | Canvas plugins | Full generative UI with CopilotKit + MCP Apps |
| Proactive AI | Limited | Limited | Limited | Core differentiator with LangGraph agents |
| Conference/session focus | No | No | No | Unique to our platform — Research Hub |
| Research timeline | No | Deep Research | Limited | Cross-session pattern detection for industry analysts |
| Visual knowledge graphs | No | Limited | Canvas (manual/AI-assisted) | AI-generated knowledge graphs with AG-UI |
| Collaboration | Google Workspace | Limited | Limited | Defer to v1.x — focus on personal workflow first |

### Key Insights from Competitors

1. **NotebookLM** has set the standard for verifiable AI responses with inline citations — this is table stakes
2. **Perplexity Labs** shows the value of Deep Research with automated multi-step research — validates our proactive AI direction
3. **Obsidian Canvas plugins** demonstrate the power of AI-generated visual knowledge structures — validates our generative UI approach
4. No competitor combines **conference/session focus** with **generative AI** — this is our unique positioning

## Sources

- **LUI Revolution & Generative UI Trends** — WebSearch results on 2026 generative UI trends, Tambo AI project
- **RAG Platform Evolution** — Contextual AI, Arango, RAG 2.0 platforms
- **Conference App Features** — CES 2026, SBS 2026, AllEvents, SCECA Conference App
- **Generative UI Libraries** — Tambo (9.5k stars), Vercel json-render, Ant Design X 2.0, assistant-ui, CopilotKit
- **AI Research Platforms** — Perplexity (ranked #8 globally), Notion AI (ranked #9 globally), Claude 4, NotebookLM, Logically
- **Obsidian AI Ecosystem** — Obsidian Skills, Claudian Plugin, Copilot for Obsidian, Smart Connections v4, Khoj
- **NotebookLM Features** — Source citations, Deep Research, multi-source support, 500k word capacity
- **Event Management Trends** — AI-powered recommendations, business matching, offline capability, social integration

**Confidence Assessment:** Research findings are based on multiple sources including product announcements, GitHub repositories, and platform documentation from 2025-2026. Key features like generative UI and proactive AI are supported by emerging open-source projects and major platform announcements, though specific implementation details will require deeper technical research during roadmap phases.

---
*Feature research for: AI-native insight/research platform with generative UI*
*Researched: 2026-03-04*
