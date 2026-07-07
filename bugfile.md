# TWILLM Bug Log

## Bug: Wiki stops rendering in IDE (Port EADDRINUSE Conflicts)

### Root Cause
- **Spawning CLI Wrappers**: Previously, [wiki-server.js](file:///Users/atulgrover/Desktop/TWILLM/twillm/lib/wiki-server.js) was spawning `tiddlywiki` via the `npx tiddlywiki` CLI command wrapper.
- **Orphan Processes**: In Node.js, calling `spawn('npx', ...)` runs TiddlyWiki inside a shell sub-wrapper. When `/switch-context` is called, the parent process attempts to kill the child using `this.process.kill('SIGTERM')`. This kills the `npx` wrapper script, but **leaves the actual TiddlyWiki worker process running as a detached orphan in the background**.
- **EADDRINUSE Bind Failures**: Because the orphan process remains active, it holds the port lock (e.g. `8080`). When the companion server attempts to start a new instance of TiddlyWiki on the same port, it throws `EADDRINUSE` and crashes, causing the IDE iframe to fail to display the wiki.

### The Fix
- Changed `WikiServer` to resolve the absolute path to `node_modules/tiddlywiki/tiddlywiki.js` using `require.resolve`.
- Spawned `node` directly:
  ```javascript
  const tiddlywikiPath = require.resolve('tiddlywiki/tiddlywiki.js');
  this.process = spawn('node', [tiddlywikiPath, ...args], { ... });
  ```
- Because the process is spawned directly as `node` without shell wrappers, `SIGTERM` signals kill the TiddlyWiki process instantly, freeing the port immediately and allowing seamless context hot-swapping without conflicts.
