# Chapter 11: Document Agent (Legal Draftsman)

The **Document Agent** assembles resolutions, notices, minutes, and corporate draft files based on layout templates and Case KV variables.

---

## 1. Capabilities & Flow

The agent compiles layouts, maps structured metrics, and identifies gaps to produce complete drafting revisions:

```
                  [User Chat Query]
                          │
                          ▼
             [Draft Assembly: draftDocument()]
             - Load format skeletons & prompt templates
                          │
                          ▼
            [Parse Unresolved Placeholders]
            - Identify [...] variables and _____ lines
                          │
                          ▼
          [Assemble Placeholders Checklist]
                          │
                          ▼
                [Gemini / Ollama LLM]
                          │
                          ▼
            [Drafting Compilation Summary]
```

1. **Skeleton Assembly:** Loads standard layout structures and prompts the drafting engine to map key corporate details.
2. **Gap Detection:** Scans the output draft for unresolved brackets or blanks.
3. **Checklist Injection:** Injects a numbered list of missing inputs into the system prompt.
4. **Draft Summary:** The LLM outputs a high-level review of the compiled draft and guides the user on remaining items.

---

## 2. Interactive Placeholders & Versioning

* **Interactive Snippets:** Unresolved brackets (e.g. `[date]`, `[amount]`) are compiled into tab-stops (e.g. `${1:date}`) in Monaco completions, letting you tab-cycle through them.
* **Archived Versions:** Each save/re-draft increments and archives previous versions (`drafts/draft_name.v1.md`), allowing side-by-side redline comparisons inside the IDE.

---

## 3. Code Coordinates

* **Agent Persona & Execution:** [agent.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/agents/document-agent/agent.js) (loads prompts from [agent.md](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/agents/document-agent/agent.md))
* **Core Drafting Engine:** [drafting.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/core/drafting.js)
* **Interactive Snippets Parser:** [extension.ts](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva-extension/src/browser/extension.ts#L1357-L1380) (`convertToSnippet`)
