# Current integration validation

Use integration-verification.json, run-summary.json and *.stdout.txt/*.stderr.txt for this run. The seven successful suites contain 281 passing assertions. render.test.cjs was blocked by an absent optional canvas package.

`engine-results.upstream-not-rerun.json` and `render-results.upstream-not-rerun.json` are upstream reports copied with the isolated fixture, NOT newly generated evidence. The engine suite ran successfully but emits a fresh JSON file only with --report; its current evidence is engine.test.stdout.txt. Source/Project keeps every upstream artifact unchanged. No GPU/browser results are claimed.
