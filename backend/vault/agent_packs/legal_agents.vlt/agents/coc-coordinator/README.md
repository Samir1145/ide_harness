# @coc-coordinator Subagent

The `@coc-coordinator` agent manages Committee of Creditors (CoC) governance, voting share calculations, meeting agendas, and formal voting outcome records under Sections 21, 24, and 25A of the Insolvency and Bankruptcy Code (IBC), 2016.

## Triggers
`@coc`, `@voting`, `@coc-meeting`

## Key Capabilities
- **Voting Share Calculation**: Automatically computes percentage voting shares excluding related parties.
- **Notice & Agenda Generator**: Auto-drafts 5-day / 24-hr meeting notices.
- **Voting Threshold Auditor**: Validates voting results against 51% (routine) and 66% (critical) statutory thresholds.
