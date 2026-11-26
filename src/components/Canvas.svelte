<script>
  import { createEventDispatcher } from 'svelte'
  import { graph, ui, updatePan, setZoom } from '../stores.js'
  import Node from './Node.svelte'
  import Connection from './Connection.svelte'

  let canvasElement
  const dispatch = createEventDispatcher()
  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let panStartUIX = 0
  let panStartUIY = 0

  function handleCanvasMouseDown(e) {
    if (e.button !== 2) return // only right click for panning

    isPanning = true
    panStartX = e.clientX
    panStartY = e.clientY
    panStartUIX = $ui.panX
    panStartUIY = $ui.panY
  }

  function handleCanvasMouseMove(e) {
    if (!isPanning) return

    const deltaX = e.clientX - panStartX
    const deltaY = e.clientY - panStartY

    updatePan(panStartUIX + deltaX, panStartUIY + deltaY)
  }

  function handleCanvasMouseUp(e) {
    if (e.button !== 2) return
    isPanning = false
  }

  function handleCanvasWheel(e) {
    e.preventDefault()

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.5, Math.min(3, $ui.zoom * zoomFactor))
    setZoom(newZoom)
  }

  function handleContextMenu(e) {
    e.preventDefault()
  }

  function handleDoubleClick(e) {
    if (e.target.closest('.node')) return
    // Get canvas-relative coordinates
    const rect = canvasElement.getBoundingClientRect()
    const x = (e.clientX - rect.left - $ui.panX) / $ui.zoom
    const y = (e.clientY - rect.top - $ui.panY) / $ui.zoom

    dispatch('createsource', { x, y })
  }
</script>

<svelte:document
  on:mousemove={handleCanvasMouseMove}
  on:mouseup={handleCanvasMouseUp}
  on:contextmenu={handleContextMenu}
/>

<div
  class="canvas"
  bind:this={canvasElement}
  on:mousedown={handleCanvasMouseDown}
  on:wheel={handleCanvasWheel}
  on:dblclick={handleDoubleClick}
  role="application"
  tabindex="0"
>
  <svg class="grid" width="100%" height="100%" aria-hidden="true">
    <defs>
      <pattern
        id="grid"
        width="40"
        height="40"
        patternUnits="userSpaceOnUse"
        patternTransform="translate({$ui.panX} {$ui.panY}) scale({$ui.zoom})"
      >
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--editor-grid)" stroke-width="0.5" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" />
  </svg>

  <svg class="connections" width="100%" height="100%" aria-hidden="true">
    <g transform="translate({$ui.panX} {$ui.panY}) scale({$ui.zoom})">
      {#each $graph.connections as connection (connection.id)}
        <Connection {connection} />
      {/each}

      {#if $ui.draggingConnection}
        <line
          x1={$ui.draggingConnection.fromX}
          y1={$ui.draggingConnection.fromY}
          x2={$ui.draggingConnection.toX}
          y2={$ui.draggingConnection.toY}
          stroke="var(--color-muted)"
          stroke-width="2"
          stroke-dasharray="5,5"
          pointer-events="none"
        />
      {/if}
    </g>
  </svg>

  <div
    class="canvas-content"
    style="
      transform: translate({$ui.panX}px, {$ui.panY}px) scale({$ui.zoom});
      transform-origin: 0 0;
    "
  >
    <!-- Nodes -->
    {#each $graph.nodes as node (node.id)}
      <Node
        {node}
        isSelected={$ui.selectedNodeId === node.id}
      />
    {/each}
  </div>

  <!-- UI Overlay -->
  <div class="ui-overlay">
    <div class="info">
      <div class="zoom-info">Zoom: {($ui.zoom * 100).toFixed(0)}%</div>
      <div class="hint">Right-click + drag to pan • Double-click to add node • Scroll to zoom</div>
    </div>
  </div>
</div>

<style>
  .canvas {
    width: 100%;
    height: 100%;
    background: var(--editor-canvas);
    overflow: hidden;
    position: relative;
    cursor: grab;
    user-select: none;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .canvas:active {
    cursor: grabbing;
  }

  .canvas-content {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .grid,
  .connections {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    width: 100%;
    height: 100%;
  }

  .ui-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 16px;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    color: var(--color-muted);
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    border: 1px solid var(--color-border);
    padding: 12px;
    border-radius: var(--radius-sm);
    max-width: 400px;
  }

  .zoom-info {
    font-weight: 600;
    color: var(--color-text);
    font-family: var(--font-mono);
  }

  .hint {
    font-size: 11px;
    color: var(--color-muted);
  }
</style>
