# Forms Agent

Compliance auditing and form mapping (AOC-4, MGT-7) rules engine.

## Folder Layout
* `agent.js` — Core execution file. Maps variables via `mapper.js` and validator.
* `agent.md` — System instructions for compliance checking.
* `schema.json` — Target rules and data constraints.
* `README.md` — This file.

## Execution
Loads active case variables, checks mathematical constraints and date order sequences, and lists compliance warning markers.
