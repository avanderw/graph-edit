<script>
  import { onMount, tick } from 'svelte'
  import Canvas from './components/Canvas.svelte'
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
          <span class="icon">◉</span>
          Source
        </button>
        <button on:click={addProcessNode} class="node-btn process">
          <span class="icon">⬚</span>
          Process
        </button>
        <button on:click={addSinkNode} class="node-btn sink">
          <span class="icon">▶</span>
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
    background: #0a0e27;
  }

  .header {
    background: linear-gradient(135deg, #1a1f3a 0%, #2a3f5f 100%);
    padding: 16px 24px;
    border-bottom: 1px solid #3a4f6f;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  h1 {
    font-size: 24px;
    font-weight: 700;
    margin: 0;
    color: #fff;
    letter-spacing: -0.5px;
  }

  .subtitle {
    font-size: 13px;
    color: #888;
    margin: 4px 0 0 0;
  }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .panel {
    width: 240px;
    background: #141829;
    border-left: 1px solid #2a3f5f;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .panel-section {
    padding: 16px;
    border-bottom: 1px solid #2a3f5f;
  }

  .panel-section h2 {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: #666;
    margin: 0 0 12px 0;
    letter-spacing: 0.5px;
  }

  .node-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    margin-bottom: 8px;
    border: 1px solid;
    background: rgba(255, 255, 255, 0.05);
    color: #e0e0e0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .node-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
  }

  .node-btn.source {
    border-color: #10b981;
    color: #10b981;
  }

  .node-btn.process {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .node-btn.sink {
    border-color: #f59e0b;
    color: #f59e0b;
  }

  .icon {
    font-size: 14px;
  }

  .process-dialog {
    box-sizing: border-box;
    width: min(360px, calc(100% - 32px));
    max-height: calc(100% - 32px);
    overflow: auto;
    padding: 24px;
    border: 1px solid #3a4f6f;
    border-radius: 8px;
    background: #141829;
    color: #eee;
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
    border: 1px solid #3a4f6f;
    border-radius: 4px;
    background: #0a0e27;
    color: #eee;
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
    border: 1px solid #3a4f6f;
    border-radius: 4px;
    background: transparent;
    color: #eee;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .dialog-actions .create-process {
    background: #2563eb;
    border-color: #3b82f6;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #888;
    margin-bottom: 8px;
  }

  .simulation-control {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ddd;
    font-size: 13px;
  }

  .info-item strong {
    color: #e0e0e0;
    font-weight: 600;
  }

  .shortcuts {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 12px;
  }

  .shortcuts li {
    color: #666;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  kbd {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid #3a4f6f;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 11px;
    color: #aaa;
  }

  @media (max-width: 768px) {
    .panel {
      display: none;
    }
  }
</style>
