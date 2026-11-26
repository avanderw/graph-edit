<script>
  import { X } from 'lucide-svelte'
  import { selectNode, setDraggingNode, updateNodePosition, deleteNode, startConnectionDrag, updateConnectionDragPreview, addConnection, removeConnection, updateNodeName, updateNodeInterval, updatePortInventory, updatePortCapacity, updateRecipeQuantity, getRecipeQuantity, getSupplyLimitedCycleRate, getInputPorts, getOutputPorts, inventoryTrendPeriodMs, graph, ui } from '../stores.js'

  export let node
  export let isSelected = false

  let isDragging = false
  let dragStartX = 0
  let dragStartY = 0
  let dragStartNodeX = 0
  let dragStartNodeY = 0
  let isDrawingConnection = false
  let disconnectInputId = null
  const rateFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 })

  function formatRate(rate) {
    return rate == null ? '--' : rateFormatter.format(rate)
  }

  function formatPercent(percentage) {
    return percentage == null ? '--' : `${percentage.toFixed(1)}%`
  }

  function flowTitle(flow) {
    if (!flow.report) return 'Measuring operational flow over 3 seconds'
    return `Inflow: ${flow.report.inflow.toFixed(3)}; consumption: ${flow.report.consumption.toFixed(3)}; production: ${flow.report.production.toFixed(3)}; transfer out: ${flow.report.outflow.toFixed(3)} items/s`
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return // only left click
    if (e.target.closest('input, button')) return

    isDragging = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragStartNodeX = node.x
    dragStartNodeY = node.y

    selectNode(node.id)
    setDraggingNode(node.id)
  }

  function handleMouseMove(e) {
    if (isDrawingConnection) {
      if (!$ui.draggingConnection) {
        isDrawingConnection = false
        return
      }
      updateConnectionDragPreview(e.clientX, e.clientY)
      return
    }

    if (!isDragging) return

    const deltaX = (e.clientX - dragStartX) / $ui.zoom
    const deltaY = (e.clientY - dragStartY) / $ui.zoom

    const newX = dragStartNodeX + deltaX
    const newY = dragStartNodeY + deltaY

    updateNodePosition(node.id, newX, newY)
  }

  function handleMouseUp(e) {
    if (isDrawingConnection) {
      isDrawingConnection = false
      const targetPort = e.target.closest('.io-port.in')
      const connection = $ui.draggingConnection
      if (targetPort && connection) {
        addConnection(connection.fromNodeId, connection.fromOutput, targetPort.dataset.nodeId, targetPort.dataset.inputId)
      }
      ui.set({ ...$ui, draggingConnection: null })
      return
    }

    isDragging = false
    setDraggingNode(null)
  }

  function handleOutputPortMouseDown(e) {
    if (e.button !== 0) return
    e.stopPropagation()

    selectNode(node.id)

    const rect = e.currentTarget.getBoundingClientRect()
    const fromX = rect.left + rect.width / 2
    const fromY = rect.top + rect.height / 2

    isDrawingConnection = true
    startConnectionDrag(node.id, e.currentTarget.dataset.outputId, fromX, fromY)
  }

  function handleNameChange(e) {
    updateNodeName(node.id, e.currentTarget.value)
    e.currentTarget.value = node.name
  }

  function handleIntervalChange(e) {
    updateNodeInterval(node.id, e.currentTarget.valueAsNumber)
    e.currentTarget.value = node.intervalMs / 1000
  }

  function handleInventoryChange(e, direction, portId) {
    updatePortInventory(node.id, direction, portId, e.currentTarget.valueAsNumber)
    e.currentTarget.value = node.inventory[direction][portId]
  }

  function handleCapacityChange(e, direction, portId) {
    updatePortCapacity(node.id, direction, portId, e.currentTarget.valueAsNumber)
    e.currentTarget.value = node.capacity[direction][portId]
  }

  function handleRecipeChange(e, direction, portId) {
    updateRecipeQuantity(node.id, direction, portId, e.currentTarget.valueAsNumber)
    e.currentTarget.value = getRecipeQuantity(node, direction, portId)
  }

  function inventoryTrendTitle(trend) {
    const period = `${inventoryTrendPeriodMs / 1000}s`
    if (trend.netChange === null) return `Measuring net inventory change over ${period}`
    const signedChange = `${trend.netChange > 0 ? '+' : ''}${trend.netChange.toLocaleString()}`
    const current = `Net change over ${(trend.durationMs / 1000).toFixed(1)}s: ${signedChange}; rate: ${trend.rate.toFixed(3)} items/s`
    return trend.previousRate === null ? current : `${current}; previous rate: ${trend.previousRate.toFixed(3)} items/s`
  }

  function handleInputPortMouseDown(e) {
    e.stopPropagation()
    disconnectInputId = e.button === 0 && !$ui.draggingConnection ? e.currentTarget.dataset.inputId : null
  }

  function handleInputPortClick(e) {
    e.stopPropagation()
    const inputId = e.currentTarget.dataset.inputId
    const shouldDisconnect = !$ui.draggingConnection && (e.detail === 0 || disconnectInputId === inputId)
    disconnectInputId = null
    if (!shouldDisconnect) return

    for (const connection of $graph.connections.filter(connection => connection.to === node.id && connection.toInput === inputId)) {
      removeConnection(connection.id)
    }
  }

  function handleInputPortMouseUp(e) {
    if (!$ui.draggingConnection) return
    disconnectInputId = null
    e.stopPropagation()

    const fromNodeId = $ui.draggingConnection.fromNodeId
    const toNodeId = node.id

    // Prevent self-connections
    if (fromNodeId === toNodeId) return

    isDrawingConnection = false
    addConnection(fromNodeId, $ui.draggingConnection.fromOutput, toNodeId, e.currentTarget.dataset.inputId)
    ui.set({ ...$ui, draggingConnection: null })
  }

  function handleDelete(e) {
    e.stopPropagation()
    deleteNode(node.id)
  }

  $: nodeTypeColor = {
    'source': 'var(--editor-source)',
    'process': 'var(--editor-process)',
    'sink': 'var(--editor-sink)'
  }[node.type] || 'var(--color-accent)'
  $: ready = getInputPorts(node).every(port => node.inventory.inputs[port.id] >= getRecipeQuantity(node, 'inputs', port.id))
  $: outputFull = getOutputPorts(node).some(port => node.capacity.outputs[port.id] - node.inventory.outputs[port.id] < getRecipeQuantity(node, 'outputs', port.id))
  $: operation = { source: 'Generating', process: 'Processing', sink: 'Consuming' }[node.type]
  $: supplyLimit = getSupplyLimitedCycleRate(node)
  $: inputRatio = getInputPorts(node).map(port => getRecipeQuantity(node, 'inputs', port.id)).join(' : ')
  $: outputRatio = getOutputPorts(node).map(port => getRecipeQuantity(node, 'outputs', port.id)).join(' : ')
</script>

<svelte:document on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

<div
  class="node"
  class:selected={isSelected}
  style="
    left: {node.x}px;
    top: {node.y}px;
    width: {node.width}px;
    min-height: {node.height}px;
    --node-color: {nodeTypeColor};
    border-color: {nodeTypeColor};
  "
  on:mousedown={handleMouseDown}
  role="button"
  tabindex="0"
>
  <div class="node-header">
    <div class="node-heading">
      <span class="node-kind">{node.type}{#if node.type === 'process'} · {getInputPorts(node).length} inputs / {getOutputPorts(node).length} outputs{:else if node.type === 'source'} · {getOutputPorts(node).length} outputs{:else} · {getInputPorts(node).length} inputs{/if}</span>
      <input class="node-name" aria-label="Node name" maxlength="80" value={node.name} on:change={handleNameChange} />
    </div>
    <button class="delete-btn" on:click={handleDelete} title="Delete node" aria-label="Delete {node.name}"><X size={16} aria-hidden="true" /></button>
  </div>

  <div class="node-content">
    {#if getInputPorts(node).length}
      <div class="node-section">
        <div class="section-label">Inputs</div>
        <div class="io-list">
          {#each getInputPorts(node) as port (port.id)}
            <div class="io-item">
              <button
                type="button"
                class="io-port in"
                class:connectable={!!$ui.draggingConnection && $ui.draggingConnection.fromNodeId !== node.id}
                aria-label="Connect to {node.name} {port.label}"
                title="{port.label}: click to disconnect"
                data-node-id={node.id}
                data-input-id={port.id}
                data-port-id="input-{node.id}-{port.id}"
                on:mousedown={handleInputPortMouseDown}
                on:click={handleInputPortClick}
                on:mouseup={handleInputPortMouseUp}
              ></button>
              <span class="port-label">
                <span>{port.label}</span>
                {#if node.inventory.inputs[port.id] >= node.capacity.inputs[port.id]}
                  <span class="port-full">Full</span>
                {/if}
                <span
                  class="inventory-trend {node.inventoryTrends[port.id].direction}"
                  title={inventoryTrendTitle(node.inventoryTrends[port.id])}
                  aria-label="{port.label} inventory {node.inventoryTrends[port.id].direction}"
                >{node.inventoryTrends[port.id].direction}</span>
                <span class="flow-rates" title={flowTitle(node.flows[port.id])}>
                  <span>Received {formatRate(node.flows[port.id].report?.inflow)}/s</span>
                  <span>Consumed {formatRate(node.flows[port.id].report?.consumption)}/s</span>
                </span>
              </span>
              <div class="port-values">
                <label>
                  <span>Qty</span>
                  <input class="inventory" type="number" min="0" max={node.capacity.inputs[port.id]} step="1" aria-label="{port.label} inventory" title="{port.label} inventory: {node.inventory.inputs[port.id]} / {node.capacity.inputs[port.id]}" value={node.inventory.inputs[port.id]} on:change={e => handleInventoryChange(e, 'inputs', port.id)} />
                </label>
                <label>
                  <span>Limit</span>
                  <input class="inventory" type="number" min={node.inventory.inputs[port.id]} max={Number.MAX_SAFE_INTEGER} step="1" aria-label="{port.label} capacity" title="{port.label} capacity: {node.capacity.inputs[port.id]}" value={node.capacity.inputs[port.id]} on:change={e => handleCapacityChange(e, 'inputs', port.id)} />
                </label>
                <label>
                  <span>Cycle</span>
                  <input class="inventory" type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" aria-label="{port.label} consumed per cycle" title="{port.label}: {getRecipeQuantity(node, 'inputs', port.id)} items consumed per cycle" value={getRecipeQuantity(node, 'inputs', port.id)} on:change={e => handleRecipeChange(e, 'inputs', port.id)} />
                </label>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if getOutputPorts(node).length}
      <div class="node-section">
        <div class="section-label">Outputs</div>
        <div class="io-list">
          {#each getOutputPorts(node) as port (port.id)}
            <div class="io-item">
              <span class="port-label">
                <span>{port.label}</span>
                {#if node.inventory.outputs[port.id] >= node.capacity.outputs[port.id]}
                  <span class="port-full">Full</span>
                {/if}
                <span
                  class="inventory-trend {node.inventoryTrends[port.id].direction}"
                  title={inventoryTrendTitle(node.inventoryTrends[port.id])}
                  aria-label="{port.label} inventory {node.inventoryTrends[port.id].direction}"
                >{node.inventoryTrends[port.id].direction}</span>
                <span class="flow-rates" title={flowTitle(node.flows[port.id])}>
                  <span>Produced {formatRate(node.flows[port.id].report?.production)}/s</span>
                  <span>Transferred {formatRate(node.flows[port.id].report?.outflow)}/s</span>
                </span>
              </span>
              <div class="port-values">
                <label>
                  <span>Qty</span>
                  <input class="inventory" type="number" min="0" max={node.capacity.outputs[port.id]} step="1" aria-label="{port.label} inventory" title="{port.label} inventory: {node.inventory.outputs[port.id]} / {node.capacity.outputs[port.id]}" value={node.inventory.outputs[port.id]} on:change={e => handleInventoryChange(e, 'outputs', port.id)} />
                </label>
                <label>
                  <span>Limit</span>
                  <input class="inventory" type="number" min={node.inventory.outputs[port.id]} max={Number.MAX_SAFE_INTEGER} step="1" aria-label="{port.label} capacity" title="{port.label} capacity: {node.capacity.outputs[port.id]}" value={node.capacity.outputs[port.id]} on:change={e => handleCapacityChange(e, 'outputs', port.id)} />
                </label>
                <label>
                  <span>Cycle</span>
                  <input class="inventory" type="number" min="1" max={Number.MAX_SAFE_INTEGER} step="1" aria-label="{port.label} produced per cycle" title="{port.label}: {getRecipeQuantity(node, 'outputs', port.id)} items produced per cycle" value={getRecipeQuantity(node, 'outputs', port.id)} on:change={e => handleRecipeChange(e, 'outputs', port.id)} />
                </label>
              </div>
              <button
                type="button"
                class="io-port out"
                aria-label="Connect from {node.name} {port.label}"
                title={port.label}
                data-node-id={node.id}
                data-output-id={port.id}
                data-port-id="output-{node.id}-{port.id}"
                on:mousedown={handleOutputPortMouseDown}
              ></button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <div class="node-timer">
    <label class="timer-control">
      <span>Cycle time</span>
      <input type="number" min="0.1" max="86400" step="0.1" aria-label="Cycle duration in seconds" value={node.intervalMs / 1000} on:change={handleIntervalChange} />
      <span>sec</span>
    </label>
    <progress max={node.intervalMs} value={node.elapsedMs} aria-label="Cycle progress" style="accent-color: {nodeTypeColor}"></progress>
    <div class="cycle-status">
      <span>{outputFull ? 'Waiting for output space' : ready ? `${operation} · ${((node.intervalMs - node.elapsedMs) / 1000).toFixed(1)}s` : 'Waiting for required inputs'}</span>
      <span>{node.completedCycles} completed cycles</span>
    </div>
  </div>
  <section class="performance" aria-label="Node utilization and throughput">
    <div class="performance-header">
      <span>Utilization</span>
      <span>{node.performance.report ? `${(node.performance.report.durationMs / 1000).toFixed(1)}s` : 'Measuring'}</span>
    </div>
    <dl>
      <div>
        <dt>Busy</dt>
        <dd class="busy-value">{formatPercent(node.performance.report?.busyPercent)}</dd>
      </div>
      <div>
        <dt>Starved</dt>
        <dd>{formatPercent(node.performance.report?.starvedPercent)}</dd>
      </div>
      <div>
        <dt>Blocked</dt>
        <dd>{formatPercent(node.performance.report?.blockedPercent)}</dd>
      </div>
    </dl>
    <div class="performance-footer">
      <div><span>Total waiting time</span><span>{formatPercent(node.performance.report?.waitPercent)}</span></div>
      <div><span>Completed cycle rate</span><span>{formatRate(node.performance.report?.cycleRate)} cycles/s</span></div>
      <div><span>Configured maximum</span><span>{formatRate(1000 / node.intervalMs)} cycles/s</span></div>
    </div>
    {#if node.type === 'process'}
      <div class="supply-limit" title="Minimum of each input's inflow divided by its per-cycle consumption, capped by the configured cycle rate. Stored inputs can temporarily support a higher actual cycle rate.">
        <span>Supply-limited cycle rate</span><span>{formatRate(supplyLimit)} cycles/s</span>
      </div>
    {/if}
    {#if getInputPorts(node).length}
      <div class="process-recipe" title="Items consumed per cycle, in input port order"><span>Consumption ratio</span><span>{inputRatio}</span></div>
    {/if}
    {#if getOutputPorts(node).length}
      <div class="process-recipe" title="Items produced per cycle, in output port order"><span>Production ratio</span><span>{outputRatio}</span></div>
    {/if}
  </section>
</div>

<style>
  .node {
    position: absolute;
    background: var(--color-surface);
    border: 2px solid;
    border-radius: var(--radius-md);
    cursor: grab;
    user-select: none;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-md);
    transition: box-shadow var(--transition-fast);
    height: auto;
  }

  .node-header,
  .node-content,
  .node-timer,
  .performance {
    flex-shrink: 0;
  }

  .node:hover {
    box-shadow: 0 10px 24px rgb(0 0 0 / 14%);
  }

  .node.selected {
    box-shadow: 0 0 0 3px var(--editor-focus), var(--shadow-md);
  }

  .node-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-radius: 4px 4px 0 0;
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--node-color) 9%, var(--color-surface));
    font-weight: 400;
    font-size: 14px;
    cursor: grab;
  }

  .node-heading {
    flex: 1;
    min-width: 0;
  }

  .node-kind {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0;
    color: var(--node-color);
  }

  .node-name {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--color-text);
    font: inherit;
    font-size: 16px;
    padding: 2px 3px;
  }

  .node-name:hover,
  .node-name:focus {
    border-color: var(--color-border);
    background: var(--color-bg);
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--color-muted);
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    cursor: pointer;
    padding: 0;
    border-radius: var(--radius-sm);
    transition: color var(--transition-fast), background var(--transition-fast);
  }

  .delete-btn:hover {
    color: var(--editor-danger);
    background: var(--code-bg);
  }

  .node-content {
    flex: 1 0 auto;
    padding: 12px;
    display: flex;
    flex-direction: row;
    gap: 12px;
    font-size: 12px;
  }

  .node-section {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .io-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .io-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    color: var(--color-text);
  }

  .io-port {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: currentColor;
    cursor: pointer;
    transition: box-shadow 0.2s, filter 0.2s;
    flex-shrink: 0;
    padding: 0;
    border: none;
    color: var(--node-color);
  }

  .io-port:hover {
    box-shadow: 0 0 10px currentColor;
  }

  .io-port.in {
    order: -1;
  }

  .io-port.out {
    margin-left: auto;
    cursor: grab;
  }

  .io-port.out:active {
    cursor: grabbing;
  }

  .io-port.connectable:hover {
    box-shadow: 0 0 12px currentColor, inset 0 0 6px rgba(255, 255, 255, 0.4);
    filter: brightness(1.3);
  }

  .port-label {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    overflow-wrap: anywhere;
  }

  .inventory,
  .timer-control input {
    box-sizing: border-box;
    width: 54px;
    min-width: 0;
    padding: 3px;
    background: var(--code-bg);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text);
    font: inherit;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .port-values {
    flex: 0 0 86px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .port-values label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3px;
    font-size: 10px;
  }

  .port-full {
    display: block;
    color: var(--editor-warning);
    font-size: 10px;
    line-height: 12px;
  }

  .flow-rates {
    display: block;
    color: var(--color-muted);
    font-size: 9px;
    line-height: 11px;
    font-variant-numeric: tabular-nums;
  }

  .flow-rates span {
    display: block;
  }

  .performance {
    border-top: 1px solid var(--color-border);
    padding: 10px 12px 12px;
    color: var(--color-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .performance-header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .performance-header {
    color: var(--color-text);
  }

  .performance dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 8px 0;
  }

  .performance dd {
    margin: 2px 0 0;
    color: var(--color-text);
    font-size: 14px;
    font-family: var(--font-mono);
  }

  .performance .busy-value {
    color: var(--color-accent);
  }

  .performance-footer {
    display: grid;
    gap: 5px;
  }

  .performance-footer > div,
  .supply-limit,
  .process-recipe {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    align-items: baseline;
    gap: 8px;
    overflow-wrap: anywhere;
  }

  .performance-footer > div > span:last-child,
  .supply-limit > span:last-child,
  .process-recipe > span:last-child {
    text-align: right;
  }

  .supply-limit {
    margin-top: 5px;
    color: var(--editor-process);
  }

  .process-recipe {
    margin-top: 5px;
  }

  .inventory-trend {
    display: block;
    font-size: 9px;
    line-height: 10px;
    text-transform: capitalize;
    color: var(--color-muted);
  }

  .inventory-trend.increasing {
    color: var(--color-accent);
  }

  .inventory-trend.decreasing {
    color: var(--editor-danger);
  }

  .inventory-trend.stable {
    color: var(--color-muted);
  }

  .node-timer {
    padding: 0 12px 12px;
    font-size: 11px;
    color: var(--color-muted);
  }

  .timer-control {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .timer-control input {
    width: 80px;
  }

  progress {
    display: block;
    width: 100%;
    height: 6px;
    margin: 8px 0;
  }

  .cycle-status {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-variant-numeric: tabular-nums;
  }
</style>
