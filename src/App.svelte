<script>
  import { onMount, tick } from 'svelte'
  import Canvas from './components/Canvas.svelte'
  import SiteChrome from './components/SiteChrome.svelte'
  import { Upload, Settings2, Download } from 'lucide-svelte'
  import { graph, addNode, advanceSimulation } from './stores.js'

  let simulationRunning = true
  let nodeDialog
  let creationType = 'process'
  let creationPosition = { x: 300, y: 200 }
  let creationCounts = {
    source: { inputCount: 0, outputCount: 1 },
    process: { inputCount: 2, outputCount: 1 },
    sink: { inputCount: 1, outputCount: 0 }
  }

  onMount(() => {
    let lastTime = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      if (simulationRunning) advanceSimulation(now - lastTime)
      lastTime = now
    }, 100)
    return () => clearInterval(timer)
  })

  function toggleSimulation() {
    simulationRunning = !simulationRunning
  }

  function addSourceNode() {
    openNodeDialog('source', 100, 100)
  }

  async function openNodeDialog(type, x, y) {
    creationType = type
    creationPosition = { x, y }
    await tick()
    nodeDialog.showModal()
  }

  function addProcessNode() {
    openNodeDialog('process', 300, 200)
  }

  function createConfiguredNode() {
    const counts = creationCounts[creationType]
    const activeCounts = creationType === 'source' ? [counts.outputCount] : creationType === 'sink' ? [counts.inputCount] : [counts.inputCount, counts.outputCount]
    if (!activeCounts.every(count => Number.isInteger(count) && count >= 1 && count <= 32)) return
    addNode(creationType, creationPosition.x, creationPosition.y, counts)
    nodeDialog.close()
  }

  function addSinkNode() {
    openNodeDialog('sink', 500, 100)
  }
</script>

<div class="app">
  <SiteChrome />
  <header class="header">
    <h1>Graph Edit</h1>
    <p class="subtitle">Economy Simulation Node Editor</p>
  </header>

  <div class="main">
    <Canvas on:createsource={event => openNodeDialog('source', event.detail.x, event.detail.y)} />

    <aside class="panel">
      <div class="panel-section">
        <h2>Add Node</h2>
        <button on:click={addSourceNode} class="node-btn source">
          <Upload size={17} aria-hidden="true" />
          Source
        </button>
        <button on:click={addProcessNode} class="node-btn process">
          <Settings2 size={17} aria-hidden="true" />
          Process
        </button>
        <button on:click={addSinkNode} class="node-btn sink">
          <Download size={17} aria-hidden="true" />
          Sink
        </button>
      </div>

      <div class="panel-section">
        <h2>Simulation</h2>
        <label class="simulation-control">
          <input type="checkbox" checked={simulationRunning} on:change={toggleSimulation} />
          {simulationRunning ? 'Running' : 'Paused'}
        </label>
      </div>

      <div class="panel-section">
        <h2>Graph Info</h2>
        <div class="info-item">
          <span>Nodes:</span>
          <strong>{$graph.nodes.length}</strong>
        </div>
        <div class="info-item">
          <span>Connections:</span>
          <strong>{$graph.connections.length}</strong>
        </div>
      </div>

      <div class="panel-section">
        <h2>Shortcuts</h2>
        <ul class="shortcuts">
          <li><kbd>Double-click</kbd> Add node</li>
          <li><kbd>Right-drag</kbd> Pan view</li>
          <li><kbd>Scroll</kbd> Zoom</li>
          <li><kbd>Click node</kbd> Select</li>
          <li><kbd>Delete</kbd> Remove node</li>
        </ul>
      </div>
    </aside>
  </div>

  <details class="site-contact">
    <summary>Contact &amp; site information</summary>
    <SiteChrome kind="footer" />
  </details>

  <dialog class="process-dialog" bind:this={nodeDialog} aria-labelledby="node-dialog-title">
    <form on:submit|preventDefault={createConfiguredNode}>
      <h2 id="node-dialog-title">New {creationType} node</h2>
      {#if creationType !== 'source'}
        <label>
          <span>{creationType === 'sink' ? 'Number of sinks (inputs)' : 'Number of inputs'}</span>
          <input type="number" min="1" max="32" step="1" required bind:value={creationCounts[creationType].inputCount} />
        </label>
      {/if}
      {#if creationType !== 'sink'}
        <label>
          <span>{creationType === 'source' ? 'Number of sources (outputs)' : 'Number of outputs'}</span>
          <input type="number" min="1" max="32" step="1" required bind:value={creationCounts[creationType].outputCount} />
        </label>
      {/if}
      <div class="dialog-actions">
        <button type="button" on:click={() => nodeDialog.close()}>Cancel</button>
        <button type="submit" class="create-process">Create {creationType}</button>
      </div>
    </form>
  </dialog>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--color-bg);
  }

  .header {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 16px;
    flex-shrink: 0;
    background: var(--color-bg);
    padding: 12px 24px;
    border-bottom: 1px solid var(--color-border);
  }

  h1 {
    font-size: 24px;
    font-weight: 400;
    margin: 0;
    color: var(--color-text);
    letter-spacing: 0;
  }

  .subtitle {
    font-size: 13px;
    color: var(--color-muted);
    margin: 0;
    font-style: italic;
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
    min-width: 0;
  }

  .panel {
    flex: 0 0 232px;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .panel-section {
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .panel-section h2 {
    font-size: 17px;
    font-weight: 400;
    font-style: italic;
    color: var(--color-text);
    margin: 0 0 12px 0;
    letter-spacing: 0;
  }

  .node-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    margin-bottom: 8px;
    border: 1px solid;
    background: var(--color-bg);
    color: var(--color-text);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 15px;
    font-weight: 400;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .node-btn:hover {
    background: var(--code-bg);
  }

  .node-btn.source {
    border-color: var(--editor-source);
    color: var(--editor-source);
  }

  .node-btn.process {
    border-color: var(--editor-process);
    color: var(--editor-process);
  }

  .node-btn.sink {
    border-color: var(--editor-sink);
    color: var(--editor-sink);
  }

  .site-contact {
    flex-shrink: 0;
    max-height: 35vh;
    overflow: auto;
    border-top: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  .site-contact summary {
    padding: 6px 24px;
    color: var(--color-muted);
    font-size: 12px;
    cursor: pointer;
  }

  .process-dialog {
    box-sizing: border-box;
    width: min(360px, calc(100% - 32px));
    max-height: calc(100% - 32px);
    overflow: auto;
    padding: 24px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-md);
  }

  .process-dialog::backdrop {
    background: rgba(0, 0, 0, 0.65);
  }

  .process-dialog form {
    display: grid;
    gap: 20px;
  }

  .process-dialog h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 400;
    overflow-wrap: anywhere;
  }

  .process-dialog label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }

  .process-dialog input {
    width: 64px;
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--code-bg);
    color: var(--color-text);
    font: inherit;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }

  .dialog-actions button {
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .dialog-actions .create-process {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-contrast);
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--color-muted);
    margin-bottom: 8px;
  }

  .simulation-control {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text);
    font-size: 13px;
  }

  .info-item strong {
    color: var(--color-text);
    font-family: var(--font-mono);
    font-weight: 400;
  }

  .shortcuts {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 12px;
  }

  .shortcuts li {
    color: var(--color-muted);
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  kbd {
    background: var(--code-bg);
    border: 1px solid var(--color-border);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-muted);
  }

  @media (max-width: 768px) {
    .header {
      padding: 8px 12px;
    }

    .main {
      flex-direction: column-reverse;
    }

    .panel {
      flex: 0 0 auto;
      max-height: 160px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      border-left: 0;
      border-bottom: 1px solid var(--color-border);
    }

    .panel-section {
      padding: 10px 12px;
    }

    .panel-section:first-child {
      grid-row: span 2;
    }

    .panel-section:last-child {
      display: none;
    }

    .panel-section h2 {
      margin-bottom: 6px;
    }

    .node-btn {
      padding: 4px 8px;
      margin-bottom: 4px;
    }
  }
</style>
