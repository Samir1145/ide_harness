# Chapter 10: Forms Agent (Compliance & Form Auditor)

The **Forms Agent** audits corporate filing data (such as MCA AOC-4 or MGT-7 sheets) by executing programmatic equation and chronological date checks.

---

## 1. Capabilities & Flow

The agent translates raw form values and rule validation logs into diagnostic auditing recommendations:

```
                  [User Chat Query]
                          │
                          ▼
            [Forms Mapping: populateFormInstance()]
            - Hydrate from reviews/case_kv_dictionary.json
                          │
                          ▼
             [Rules Engine: validateFormRules()]
             - Execute math and chronological formulas
                          │
                          ▼
           [Assemble Audit Log Context]
           - Populated values list
           - ❌ Validation failures details
                          │
                          ▼
                [Gemini / Ollama LLM]
                          │
                          ▼
             [Analytical Compliance Audit]
```

1. **Extraction Mapping:** Gathers corporate parameters from the central `case_kv_dictionary.json` file.
2. **Rules Audit:** Runs mathematical validation schemas (e.g. assets = liabilities + share capital) and date order sequences.
3. **Prompt Composition:** Injects a flat log of values and failures into the LLM system prompt.
4. **Diagnostic Summary:** The LLM produces a methodical, analytical audit report highlighting errors and compliance actions.

---

## 2. Validation Constraints

* **Equation Checks:** Evaluates mathematical invariants defined in the form's `schema.json` configuration.
* **Chronological Orders:** Normalizes date strings (e.g. signature dates, Board resolution dates, AGM dates) to millisecond timestamps to verify chronological order constraints.
* **Source Citations:** Collects clickable reference coordinates (`concepts/...md`) to show exactly where values were extracted.

---

## 3. Code Coordinates

* **Agent Persona & Execution:** [agent.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/agents/forms-agent/agent.js) (loads prompts from [agent.md](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/agents/forms-agent/agent.md))
* **Logical Rules Engine:** [rules_validator.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/pipeline/forms/rules_validator.js)
* **Form Values Hydration:** [mapper.js](file:///Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/lib/pipeline/forms/mapper.js)
