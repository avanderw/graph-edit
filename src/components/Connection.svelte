<script>
  import { tick } from 'svelte'
  import { graph, ui } from '../stores.js'

  export let connection

  let fromNode, toNode
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0
  let hasPositions = false

  function getPortPosition(portId) {
    if (!portId) return null

    const portElement = document.querySelector(`[data-port-id="${portId}"]`)
    if (!portElement) return null

    // Get canvas element for reference
    const canvasElement = document.querySelector('.canvas')
    if (!canvasElement) return null

    const portRect = portElement.getBoundingClientRect()
    const canvasRect = canvasElement.getBoundingClientRect()

    // Calculate port position relative to canvas element (in screen space)
    const portScreenX = portRect.left - canvasRect.left + portRect.width / 2
    const portScreenY = portRect.top - canvasRect.top + portRect.height / 2

    // Convert from screen space (relative to canvas) to canvas-content space
    // Account for pan and zoom applied to canvas-content
    const canvasX = (portScreenX - $ui.panX) / $ui.zoom
    const canvasY = (portScreenY - $ui.panY) / $ui.zoom

    return { x: canvasX, y: canvasY }
  }

  function updatePositions() {
    fromNode = $graph.nodes.find(n => n.id === connection.from)
    toNode = $graph.nodes.find(n => n.id === connection.to)

    if (!fromNode || !toNode) {
      hasPositions = false
      return
    }

    const fromPortId = `output-${connection.from}-${connection.fromOutput}`
    const toPortId = `input-${connection.to}-${connection.toInput}`

    const fromPos = getPortPosition(fromPortId)
    const toPos = getPortPosition(toPortId)

    hasPositions = !!(fromPos && toPos)
    if (hasPositions) {
      x1 = fromPos.x
      y1 = fromPos.y
      x2 = toPos.x
      y2 = toPos.y
    }
  }

  $: $graph.nodes, $ui.panX, $ui.panY, $ui.zoom, tick().then(updatePositions)
</script>

{#if fromNode && toNode && hasPositions}
  <line
    {x1}
    {y1}
    {x2}
    {y2}
    stroke="var(--color-accent)"
    stroke-width="2.5"
    pointer-events="none"
    stroke-linecap="round"
  />
  <!-- Connection dots at endpoints -->
  <circle cx={x1} cy={y1} r="5" fill="var(--color-accent)" pointer-events="none" />
  <circle cx={x2} cy={y2} r="5" fill="var(--color-accent)" pointer-events="none" />
{/if}

<style>
  line {
    stroke-linecap: round;
  }
</style>
