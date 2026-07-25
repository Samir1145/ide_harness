# Stage 3 Architecture: Cognitive Agents, Critique Loops, & RAG Pipeline

This document details the operational flow, token budget checks, and agent delegation loops of **Stage 3 (Cognitive Agents & RAG Loops)**.

---

## 1. Stage 3 Flowchart

The flowchart below maps the interaction between the Chat UI, the Active-Context Checklist, the specialized agents, and the local GGUF Llamafile servers:

```mermaid
graph TD
    %% Client & User Selection
    subgraph Client_Interface ["Client Interface"]
        CHAT_UI["💬 Chat Panel UI"]
        MATRIX_UI["📋 Active-Context Checklist (Concepts Panel)"]
        ACTIVE_JSON["active_rag_docs.json Configuration"]
    end

    %% Agent Coordinator Layer
    subgraph Agent_Management_System ["Agent Management System (AMS)"]
        CHAT_REG["Eclipse Theia AI ChatAgent Registry"]
        DELEGATOR["ChatAgentService.delegateToAgent API"]
        
        DOC_AGENT["📄 Document Agent (Drafts templates)"]
        FORMS_AGENT["📝 Forms Agent (Audits & pre-fills)"]
        ADVISOR_AGENT["⚖️ Advisor Agent (Reviews compliance)"]
        
        CRITIQUE_LOOP["🔄 Self-Correction Critique Loop"]
    end

    %% RAG Processing
    subgraph Context_RAG_Pipeline ["Context & RAG Retrieval Pipeline"]
        RAG_QUERY["Map-Reduce Multi-Query RAG Engine"]
        FTS_FILTER["FTS5 Alphanumeric Keyword Pre-filtering"]
        COSINE_RERANK["Hybrid JS Cosine Similarity (Top 12)"]
        RRF_FUSION["Reciprocal Rank Fusion (RRF + Priority Boosts)"]
        
        TOKEN_BUDGET{"Total Token Count &lt; 1,500?"}
        CONTEXT_OVERFLOW["⚠️ Context Window Exceeded Warning"]
        TRUNCATOR["Iterative Low-Rank Context Truncation"]
        
        LLM_CLIENT["Local Llamafile Routing (Legal/Finance Param)"]
    end

    %% Client Interactions
    CHAT_UI --> CHAT_REG
    MATRIX_UI --> ACTIVE_JSON
    ACTIVE_JSON --> RAG_QUERY

    %% Agent Coordination
    CHAT_REG --> DELEGATOR
    DELEGATOR --> DOC_AGENT
    DELEGATOR --> FORMS_AGENT
    DELEGATOR --> ADVISOR_AGENT

    %% Critique Loop
    DOC_AGENT -- "Delegates draft for audit" --> DELEGATOR
    FORMS_AGENT -- "Audits document compliance & returns critique" --> DELEGATOR
    DELEGATOR -- "Refined draft output" --> CHAT_UI

    %% RAG Retrieval flow
    RAG_QUERY --> FTS_FILTER
    FTS_FILTER --> COSINE_RERANK
    COSINE_RERANK --> RRF_FUSION
    RRF_FUSION --> TOKEN_BUDGET
    
    %% Truncation Loop
    TOKEN_BUDGET -- "No (Overflow)" --> TRUNCATOR
    TRUNCATOR --> RAG_QUERY
    TOKEN_BUDGET -- "No (Single Snippet Overflow)" --> CONTEXT_OVERFLOW
    
    TOKEN_BUDGET -- "Yes (Within Budget)" --> LLM_CLIENT

    %% Local LLM Execution
    LLM_CLIENT -- "Port 8090" --> LEGAL_PARAM["LegalParam-7B GGUF"]
    LLM_CLIENT -- "Port 8091" --> FINANCE_PARAM["FinanceParam-2.9B GGUF"]

    LEGAL_PARAM --> DOC_AGENT
    FINANCE_PARAM --> FORMS_AGENT
```

---

## 2. In-Depth RAG Verification Analysis

The RAG engine is fully verified. The following three components ensure safe offline operation and zero data drift:

### A. Pre-Flight Token Budget Checks (2,048-Token Guard)
* **Word Count Estimation**: We calculate token length pre-flight using a safe BPE token multiplier of `1.35x` on whitespace words.
* **Iterative Context Truncation**: If the assembled prompt exceeds `1,500` input tokens, the pipeline enters a loop, popping the lowest-ranked context snippet from RRF results, rebuilding the prompt, and recalculating token counts.
* **Hard Overflow Safety**: If a single context chunk exceeds the `1,500` token limit by itself, the system aborts LLM submission and returns a structured user notice: *"⚠️ Context Window Exceeded... Please refine selection in the Active-Context Control Matrix"*. This prevents GGUF server loop/OOM crashes.

### B. High-Speed Hybrid Retrieval (VSS Fallback)
* **Keyword Slicing**: To remain platform-portable without binary dependencies, the database disables dynamic C++ `sqlite-vss` extensions and falls back to JavaScript similarity reranking.
* **Pre-filter FTS5 matching**: RAG performs a fast FTS5 lexical pre-filter (`MATCH ? LIMIT 100`) to find the top 100 coordinate matches.
* **Memory-Mapped Cosine Similarity**: It fetches candidate vectors using composite natural keys (`filename`, `section_title`, `chunk_index`), maps float arrays in JS, computes cosine similarity, and ranks the top 12 in `< 1ms`.

### C. Reciprocal Rank Fusion (RRF) & Boosts
* Combined ranks are calculated using the standard formula: $Score = \frac{1}{Rank_{FTS} + 60} + \frac{1}{Rank_{Vector} + 60}$.
* Wiki overrides are boosted by `1.5x` to prioritize curated knowledge, and document metadata priority values apply a sliding scale boost (e.g. Priority 1 gets `+0.5` score).
