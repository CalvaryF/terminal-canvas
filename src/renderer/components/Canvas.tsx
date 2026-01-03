import { useCallback, useMemo, useEffect, useRef, useState, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  type NodeChange,
  type EdgeChange,
  type Edge,
  type Connection,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import TerminalNode from './TerminalNode'
import TextNode from './TextNode'
import DrawingNode from './DrawingNode'
import FolderNode from './FolderNode'
import CommandQueueNode from './CommandQueueNode'
import CustomEdge from './CustomEdge'
import type { CanvasNode, DrawingNode as DrawingNodeType, FolderNode as FolderNodeType, FileInfo, CommandItem } from '../types'
import type { CanvasMode } from '../App'
import type { PreviewContext } from './FilePreviewModal'
import { pointsToSVGPath, getBoundingBox, normalizePoints, smoothPoints, type Point } from '../utils/pathSmoothing'

// Check if a line segment intersects with a rectangle
function lineIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  left: number, top: number, right: number, bottom: number
): boolean {
  // Check if either endpoint is inside the rectangle
  if ((x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) ||
      (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)) {
    return true
  }

  // Check if line intersects any of the rectangle's edges
  const intersectsLine = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
    const denom = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay)
    if (Math.abs(denom) < 0.0001) return false
    const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denom
    const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / denom
    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
  }

  return (
    intersectsLine(x1, y1, x2, y2, left, top, right, top) ||     // Top edge
    intersectsLine(x1, y1, x2, y2, right, top, right, bottom) || // Right edge
    intersectsLine(x1, y1, x2, y2, left, bottom, right, bottom) || // Bottom edge
    intersectsLine(x1, y1, x2, y2, left, top, left, bottom)      // Left edge
  )
}

interface CanvasContextType {
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  onRemoveNode: (id: string) => void
  mode: CanvasMode
  isZoomActive: boolean
  setIsZoomActive: (active: boolean) => void
  onFilePreview: ((context: PreviewContext) => void) | null
  onFolderFileAdded: ((nodeId: string, filePath: string) => void) | null
  onSendCommand: ((queueId: string, action: 'add' | 'send' | 'remove', payload: CommandItem | string) => void) | null
}

export const CanvasContext = createContext<CanvasContextType>({
  focusedNodeId: null,
  setFocusedNodeId: () => {},
  onRemoveNode: () => {},
  mode: 'hand',
  isZoomActive: false,
  setIsZoomActive: () => {},
  onFilePreview: null,
  onFolderFileAdded: null,
  onSendCommand: null
})

export const useCanvasContext = () => useContext(CanvasContext)

const nodeTypes: NodeTypes = {
  terminal: TerminalNode,
  text: TextNode,
  drawing: DrawingNode,
  folder: FolderNode,
  queue: CommandQueueNode
}

const edgeTypes = {
  default: CustomEdge
}

interface CanvasProps {
  nodes: CanvasNode[]
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>
  edges: Edge[]
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  onRemoveNode: (id: string) => void
  mode: CanvasMode
  drawColor: string
  onFilePreview: (context: PreviewContext) => void
  onFolderFileAdded: (nodeId: string, filePath: string) => void
  onAddFolderAtPosition: (folderPath: string, x: number, y: number) => void
  onDuplicateNodes: (nodes: CanvasNode[]) => void
  onSendCommand: (queueId: string, action: 'add' | 'send' | 'remove', payload: CommandItem | string) => void
}

function ZoomHandler() {
  const { getViewport, setViewport } = useReactFlow()
  const { setIsZoomActive } = useCanvasContext()
  const altRef = useRef(false)
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const isDraggingRef = useRef(false)

  // Track zoom active state via ref for event handlers
  const isZoomActiveRef = useRef(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyZ') {
        isZoomActiveRef.current = true
        setIsZoomActive(true)
      }
      if (e.key === 'Alt') altRef.current = true
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyZ') {
        isZoomActiveRef.current = false
        setIsZoomActive(false)
      }
      if (e.key === 'Alt') altRef.current = false
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (!isZoomActiveRef.current) return

      e.preventDefault()
      e.stopPropagation()

      // Start marquee selection
      isDraggingRef.current = true
      setMarquee({
        startX: e.clientX,
        startY: e.clientY,
        endX: e.clientX,
        endY: e.clientY
      })
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !isZoomActiveRef.current) return

      setMarquee(prev => prev ? {
        ...prev,
        endX: e.clientX,
        endY: e.clientY
      } : null)
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return

      isDraggingRef.current = false

      setMarquee(current => {
        if (!current) return null

        const { startX, startY, endX, endY } = current
        const width = Math.abs(endX - startX)
        const height = Math.abs(endY - startY)

        // If it's just a click (small rectangle), do simple zoom
        if (width < 10 && height < 10) {
          const viewport = getViewport()
          const zoomFactor = altRef.current ? 0.5 : 2
          const newZoom = Math.min(Math.max(viewport.zoom * zoomFactor, 0.1), 2)

          const pointX = (e.clientX - viewport.x) / viewport.zoom
          const pointY = (e.clientY - viewport.y) / viewport.zoom
          const newX = e.clientX - pointX * newZoom
          const newY = e.clientY - pointY * newZoom

          setViewport({ x: newX, y: newY, zoom: newZoom })
          return null
        }

        // Marquee zoom
        const viewport = getViewport()
        const minX = Math.min(startX, endX)
        const minY = Math.min(startY, endY)

        // Get the canvas container dimensions
        const container = document.querySelector('.canvas-container')
        if (!container) return null
        const containerRect = container.getBoundingClientRect()

        if (altRef.current) {
          // Zoom out: the current view should fit into the marquee area
          const scaleX = width / containerRect.width
          const scaleY = height / containerRect.height
          const scale = Math.min(scaleX, scaleY)
          const newZoom = Math.max(viewport.zoom * scale, 0.1)

          // Center of marquee in screen coords
          const marqueeCenterX = minX + width / 2
          const marqueeCenterY = minY + height / 2

          // Center of marquee in flow coords
          const flowCenterX = (marqueeCenterX - viewport.x) / viewport.zoom
          const flowCenterY = (marqueeCenterY - viewport.y) / viewport.zoom

          // New viewport centered on the marquee center
          const newX = containerRect.width / 2 - flowCenterX * newZoom
          const newY = containerRect.height / 2 - flowCenterY * newZoom

          setViewport({ x: newX, y: newY, zoom: newZoom })
        } else {
          // Zoom in: fit the marquee area to fill the screen
          const scaleX = containerRect.width / width
          const scaleY = containerRect.height / height
          const scale = Math.min(scaleX, scaleY)
          const newZoom = Math.min(viewport.zoom * scale, 2)

          // Convert marquee corners to flow coordinates
          const flowMinX = (minX - viewport.x) / viewport.zoom
          const flowMinY = (minY - viewport.y) / viewport.zoom
          const flowMaxX = (minX + width - viewport.x) / viewport.zoom
          const flowMaxY = (minY + height - viewport.y) / viewport.zoom

          // Center of selection in flow coords
          const flowCenterX = (flowMinX + flowMaxX) / 2
          const flowCenterY = (flowMinY + flowMaxY) / 2

          // New viewport to center the selection
          const newX = containerRect.width / 2 - flowCenterX * newZoom
          const newY = containerRect.height / 2 - flowCenterY * newZoom

          setViewport({ x: newX, y: newY, zoom: newZoom })
        }

        return null
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousedown', handleMouseDown, true)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousedown', handleMouseDown, true)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [getViewport, setViewport, setIsZoomActive])

  // Render marquee overlay
  if (!marquee) return null

  const left = Math.min(marquee.startX, marquee.endX)
  const top = Math.min(marquee.startY, marquee.endY)
  const width = Math.abs(marquee.endX - marquee.startX)
  const height = Math.abs(marquee.endY - marquee.startY)

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width,
        height,
        border: '1px solid rgba(59, 130, 246, 0.6)',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  )
}

interface SelectionOverlayProps {
  nodes: CanvasNode[]
  edges: Edge[]
}

function SelectionOverlay({ nodes, edges }: SelectionOverlayProps) {
  const { getViewport } = useReactFlow()
  const viewport = getViewport()

  const selectedNodes = nodes.filter(n => n.selected === true)
  const selectedEdges = edges.filter(e => e.selected === true)

  if (selectedNodes.length === 0 && selectedEdges.length === 0) return null

  const padding = 6
  const REACT_FLOW_Y_OFFSET = 14

  // Calculate combined bounding box for all selected items
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  // Include selected nodes
  for (const node of selectedNodes) {
    if (node.type === 'drawing') {
      const points = (node as DrawingNodeType).data.points
      if (points) {
        for (const p of points) {
          const flowX = node.position.x + p.x
          const flowY = node.position.y + p.y + REACT_FLOW_Y_OFFSET
          if (flowX < minX) minX = flowX
          if (flowY < minY) minY = flowY
          if (flowX > maxX) maxX = flowX
          if (flowY > maxY) maxY = flowY
        }
      }
    } else {
      const width = node.measured?.width ?? (node.type === 'terminal' ? 400 : 200)
      const height = node.measured?.height ?? (node.type === 'terminal' ? 300 : 80)
      if (node.position.x < minX) minX = node.position.x
      if (node.position.y < minY) minY = node.position.y
      if (node.position.x + width > maxX) maxX = node.position.x + width
      if (node.position.y + height > maxY) maxY = node.position.y + height
    }
  }

  // Include selected edges
  for (const edge of selectedEdges) {
    const sourceNode = nodes.find(n => n.id === edge.source)
    const targetNode = nodes.find(n => n.id === edge.target)
    if (!sourceNode || !targetNode) continue

    const sourceWidth = sourceNode.measured?.width ?? 200
    const sourceHeight = sourceNode.measured?.height ?? 100
    const targetWidth = targetNode.measured?.width ?? 200
    const targetHeight = targetNode.measured?.height ?? 100

    const sourceIsLeft = sourceNode.position.x < targetNode.position.x

    const sourceX = sourceIsLeft
      ? sourceNode.position.x + sourceWidth
      : sourceNode.position.x
    const sourceY = sourceNode.position.y + sourceHeight / 2

    const targetX = sourceIsLeft
      ? targetNode.position.x
      : targetNode.position.x + targetWidth
    const targetY = targetNode.position.y + targetHeight / 2

    if (sourceX < minX) minX = sourceX
    if (sourceY < minY) minY = sourceY
    if (sourceX > maxX) maxX = sourceX
    if (sourceY > maxY) maxY = sourceY
    if (targetX < minX) minX = targetX
    if (targetY < minY) minY = targetY
    if (targetX > maxX) maxX = targetX
    if (targetY > maxY) maxY = targetY
  }

  if (minX === Infinity) return null

  const screenX = minX * viewport.zoom + viewport.x - padding
  const screenY = minY * viewport.zoom + viewport.y - padding + 28
  const screenWidth = (maxX - minX) * viewport.zoom + padding * 2
  const screenHeight = (maxY - minY) * viewport.zoom + padding * 2

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: screenX,
        top: screenY,
        width: screenWidth,
        height: screenHeight,
        border: '1.5px dashed #3B82F6',
        pointerEvents: 'none',
        zIndex: 1000
      }}
    />,
    document.body
  )
}

interface DrawingHandlerProps {
  mode: CanvasMode
  drawColor: string
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>
}

const STROKE_WIDTH = 3

function DrawingHandler({ mode, drawColor, setNodes }: DrawingHandlerProps) {
  const { screenToFlowPosition, getViewport } = useReactFlow()
  const { isZoomActive } = useCanvasContext()
  const [previewPath, setPreviewPath] = useState<string>('')

  // Use refs to avoid stale closure issues
  const isDrawingRef = useRef(false)
  const flowPointsRef = useRef<Point[]>([])
  const screenPointsRef = useRef<Point[]>([])
  const drawColorRef = useRef(drawColor)
  const rafRef = useRef<number | null>(null)
  const isZoomActiveRef = useRef(isZoomActive)

  // Keep refs in sync with props/context
  useEffect(() => {
    drawColorRef.current = drawColor
  }, [drawColor])

  useEffect(() => {
    isZoomActiveRef.current = isZoomActive
  }, [isZoomActive])

  useEffect(() => {
    if (mode !== 'draw') {
      // Reset state when leaving draw mode
      isDrawingRef.current = false
      flowPointsRef.current = []
      screenPointsRef.current = []
      setPreviewPath('')
      return
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return // Only left mouse button
      if (isZoomActiveRef.current) return // Zoom takes precedence

      const target = e.target as HTMLElement
      if (!target.closest('.react-flow__pane')) return // Only draw on canvas

      e.preventDefault()
      isDrawingRef.current = true

      const flowPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      flowPointsRef.current = [flowPoint]
      screenPointsRef.current = [{ x: e.clientX, y: e.clientY }]
      setPreviewPath(`M${e.clientX.toFixed(2)},${e.clientY.toFixed(2)}`)
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current) return
      if (rafRef.current) return // Throttle with RAF

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        flowPointsRef.current.push(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
        screenPointsRef.current.push({ x: e.clientX, y: e.clientY })
        setPreviewPath(pointsToSVGPath(screenPointsRef.current))
      })
    }

    const handlePointerUp = () => {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false

      const flowPoints = flowPointsRef.current

      if (flowPoints.length < 2) {
        flowPointsRef.current = []
        screenPointsRef.current = []
        setPreviewPath('')
        return
      }

      // Create the drawing node using flow coordinates
      // Smooth first, then calculate bbox from smoothed points to prevent overshoot
      const smoothedFlowPoints = smoothPoints(flowPoints)
      const bbox = getBoundingBox(smoothedFlowPoints)
      const normalizedPoints = normalizePoints(smoothedFlowPoints, bbox.minX, bbox.minY)

      // Build path directly from normalized points (already smoothed)
      let pathData = `M${normalizedPoints[0].x.toFixed(2)},${normalizedPoints[0].y.toFixed(2)}`
      for (let i = 1; i < normalizedPoints.length; i++) {
        pathData += `L${normalizedPoints[i].x.toFixed(2)},${normalizedPoints[i].y.toFixed(2)}`
      }

      // React Flow renders nodes ~14px lower than their flow position
      // This is a fixed offset in flow space (not screen space)
      const REACT_FLOW_Y_OFFSET = 14

      const newNode: DrawingNodeType = {
        id: crypto.randomUUID(),
        type: 'drawing',
        position: { x: bbox.minX, y: bbox.minY - REACT_FLOW_Y_OFFSET },
        width: bbox.width,
        height: bbox.height + REACT_FLOW_Y_OFFSET, // Extend bounds to match rendered position
        data: {
          pathData,
          color: drawColorRef.current,
          strokeWidth: STROKE_WIDTH,
          points: normalizedPoints
        }
      }

      setNodes(nds => [...nds, newNode])
      flowPointsRef.current = []
      screenPointsRef.current = []
      setPreviewPath('')
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [mode, screenToFlowPosition, setNodes])

  // Render preview stroke while drawing - use portal to escape ReactFlow's transform
  if (mode !== 'draw' || !previewPath) return null

  // Scale stroke width by zoom so preview matches final render
  const viewport = getViewport()
  const scaledStrokeWidth = STROKE_WIDTH * viewport.zoom

  return createPortal(
    <svg
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 10000
      }}
    >
      <path
        d={previewPath}
        stroke={drawColor}
        strokeWidth={scaledStrokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>,
    document.body
  )
}

function Canvas({ nodes, setNodes, edges, setEdges, focusedNodeId, setFocusedNodeId, onRemoveNode, mode, drawColor, onFilePreview, onFolderFileAdded, onAddFolderAtPosition, onDuplicateNodes, onSendCommand }: CanvasProps) {
  const [isZoomActive, setIsZoomActive] = useState(false)
  const { screenToFlowPosition } = useReactFlow()
  const duplicatedRef = useRef(false)

  const handleNodeDragStart = useCallback((_event: React.MouseEvent, _node: CanvasNode) => {
    // Check if Alt/Option key is held
    if (_event.altKey && mode === 'select') {
      // Get all selected nodes (or just the dragged one if none selected)
      const selectedNodes = nodes.filter(n => n.selected)
      const nodesToDuplicate = selectedNodes.length > 0 ? selectedNodes : [_node]

      if (!duplicatedRef.current) {
        duplicatedRef.current = true
        onDuplicateNodes(nodesToDuplicate)
      }
    }
  }, [nodes, mode, onDuplicateNodes])

  const handleNodeDragStop = useCallback(() => {
    duplicatedRef.current = false
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()

    const files = e.dataTransfer.files
    if (files.length === 0) return

    // Check if it's a directory (Electron provides the path property)
    const file = files[0] as File & { path?: string }
    if (!file.path) return

    // Check if it's a directory by trying to read it
    // On macOS, directories dragged from Finder have type ''
    if (file.type === '' || file.type === 'application/x-directory') {
      const flowPosition = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      onAddFolderAtPosition(file.path, flowPosition.x, flowPosition.y)
    }
  }, [screenToFlowPosition, onAddFolderAtPosition])

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as CanvasNode[])
    },
    [setNodes]
  )

  // Track if we're in a marquee drag
  const isMarqueeRef = useRef(false)

  useEffect(() => {
    if (mode !== 'select') return

    const onMouseDown = () => { isMarqueeRef.current = false }
    const onMouseMove = () => {
      if (document.querySelector('.react-flow__selection')) {
        isMarqueeRef.current = true
      }
    }
    const onMouseUp = () => {
      setTimeout(() => { isMarqueeRef.current = false }, 50)
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [mode])

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Filter out selection changes during marquee - we handle edge marquee selection ourselves
      const filteredChanges = changes.filter(change => {
        if (change.type === 'select' && isMarqueeRef.current) {
          return false // Block React Flow's marquee edge selection
        }
        return true
      })
      if (filteredChanges.length > 0) {
        setEdges((eds) => applyEdgeChanges(filteredChanges, eds))
      }
    },
    [setEdges]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges]
  )

  const { getViewport } = useReactFlow()

  // Track selection box coordinates during drag
  const selectionBoxRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null)

  // Monitor selection box during drag
  useEffect(() => {
    if (mode !== 'select') return

    const updateSelectionBox = () => {
      const selectionBox = document.querySelector('.react-flow__selection') as HTMLElement
      if (selectionBox) {
        const boxRect = selectionBox.getBoundingClientRect()
        const containerRect = document.querySelector('.react-flow')?.getBoundingClientRect()
        if (containerRect) {
          const viewport = getViewport()
          selectionBoxRef.current = {
            left: (boxRect.left - containerRect.left - viewport.x) / viewport.zoom,
            top: (boxRect.top - containerRect.top - viewport.y) / viewport.zoom,
            right: (boxRect.left - containerRect.left - viewport.x + boxRect.width) / viewport.zoom,
            bottom: (boxRect.top - containerRect.top - viewport.y + boxRect.height) / viewport.zoom
          }
        }
      }
    }

    const handleMouseMove = () => updateSelectionBox()
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [mode, getViewport])

  // Handle marquee selection end - check for edge intersections
  const onSelectionEnd = useCallback(() => {
    const sel = selectionBoxRef.current
    if (!sel) return

    // Check each edge for intersection with selection box
    setEdges(eds => eds.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      if (!sourceNode || !targetNode) return edge

      const sourceWidth = sourceNode.measured?.width ?? 200
      const sourceHeight = sourceNode.measured?.height ?? 100
      const targetWidth = targetNode.measured?.width ?? 200
      const targetHeight = targetNode.measured?.height ?? 100

      // Determine which node is left vs right
      const sourceIsLeft = sourceNode.position.x < targetNode.position.x

      // Get actual handle positions (edges of nodes, not centers)
      const sourceX = sourceIsLeft
        ? sourceNode.position.x + sourceWidth
        : sourceNode.position.x
      const sourceY = sourceNode.position.y + sourceHeight / 2

      const targetX = sourceIsLeft
        ? targetNode.position.x
        : targetNode.position.x + targetWidth
      const targetY = targetNode.position.y + targetHeight / 2

      // Check if line segment intersects rectangle
      const intersects = lineIntersectsRect(
        sourceX, sourceY, targetX, targetY,
        sel.left, sel.top, sel.right, sel.bottom
      )

      if (intersects) {
        return { ...edge, selected: true }
      }
      return edge
    }))

    selectionBoxRef.current = null
  }, [nodes, setEdges])

  const contextValue = useMemo(
    () => ({ focusedNodeId, setFocusedNodeId, onRemoveNode, mode, isZoomActive, setIsZoomActive, onFilePreview, onFolderFileAdded, onSendCommand }),
    [focusedNodeId, setFocusedNodeId, onRemoveNode, mode, isZoomActive, onFilePreview, onFolderFileAdded, onSendCommand]
  )

  return (
    <CanvasContext.Provider value={contextValue}>
      <div
        className={`canvas-container ${mode}-mode`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={false}
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          panOnScroll
          panOnDrag={mode === 'hand'}
          nodesDraggable={mode === 'select'}
          zoomOnDoubleClick={false}
          selectionOnDrag={mode === 'select' && !isZoomActive}
          selectionMode={SelectionMode.Partial}
          selectNodesOnDrag={mode === 'select' && !isZoomActive}
          edgesReconnectable
          edgesFocusable
          elementsSelectable={mode === 'select'}
          nodeDragThreshold={5}
          onPaneClick={() => setFocusedNodeId(null)}
          onSelectionEnd={onSelectionEnd}
        >
          <Background variant={BackgroundVariant.Dots} color="#b8b8b8" gap={16} size={2} />
          <Controls />
          <MiniMap
            nodeColor="#d4d4d4"
            maskColor="rgba(255, 255, 255, 0.8)"
          />
          <ZoomHandler />
          <DrawingHandler mode={mode} drawColor={drawColor} setNodes={setNodes} />
          <SelectionOverlay nodes={nodes} edges={edges} />
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  )
}

export default Canvas
