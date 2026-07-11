# Tests

## Running All Tests

```bash
cd /path/to/HAYAGRIVA/hayagriva
npm test
```

## Test Files

| File | Tests |
|------|-------|
| `bm25_search.test.js` | BM25 indexing, search scoring, deduplication |
| `document_splitter.test.js` | Heading regex, section extraction, edge cases |
| `form_rules_validator.test.js` | Date/math/presence rule validation |
| `multimodal_merge.test.js` | PDF visual merge, page ordering |
| `pageindex_tree.test.js` | Page tree construction, parent-child links |
| `agents_coordinator.test.js` | Agent routing, intent detection |
| `comprehensive_sanity.test.js` | Worker queue deduplication, end-to-end sanity |

## Adding Tests

Add a new `<feature>.test.js` file to this folder and register it in `run_all_tests.js`.
