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
import type { CanvasNode, DrawingNode as DrawingNodeType, FolderNode as FolderNodeType } from '../types'
import type { CanvasMode } from '../App'
import type { PreviewFile } from './FilePreviewModal'
import { pointsToSVGPath, getBoundingBox, normalizePoints, smoothPoints, type Point } from '../utils/pathSmoothing'

interface CanvasContextType {
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  onRemoveNode: (id: string) => void
  mode: CanvasMode
  isZoomActive: boolean
  setIsZoomActive: (active: boolean) => void
  onFilePreview: ((file: PreviewFile) => void) | null
  onFolderFileAdded: ((nodeId: string, filePath: string) => void) | null
}

export const CanvasContext = createContext<CanvasContextType>({
  focusedNodeId: null,
  setFocusedNodeId: () => {},
  onRemoveNode: () => {},
  mode: 'hand',
  isZoomActive: false,
  setIsZoomActive: () => {},
  onFilePreview: null,
  onFolderFileAdded: null
})

export const useCanvasContext = () => useContext(CanvasContext)

const nodeTypes: NodeTypes = {
  terminal: TerminalNode,
  text: TextNode,
  drawing: DrawingNode,
  folder: FolderNode
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
  onFilePreview: (file: PreviewFile) => void
  onFolderFileAdded: (nodeId: string, filePath: string) => void
  onAddFolderAtPosition: (folderPath: string, x: number, y: number) => void
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
        border: '2px dashed #525252',
        backgroundColor: 'rgba(82, 82, 82, 0.1)',
        pointerEvents: 'none',
        zIndex: 9999
      }}
    />
  )
}

interface SelectionOverlayProps {
  nodes: CanvasNode[]
}

function SelectionOverlay({ nodes }: SelectionOverlayProps) {
  const { getViewport } = useReactFlow()

  const selectedNodes = nodes.filter(n => n.selected === true)
  if (selectedNodes.length === 0) return null

  // Calculate combined bounding box in flow coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  const REACT_FLOW_Y_OFFSET = 14

  for (const node of selectedNodes) {
    if (node.type === 'drawing') {
      // For drawings, use the points data
      // Add Y offset to match where stroke actually renders (node position has -14 offset)
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
      // For other nodes, use measured dimensions or defaults
      const width = node.measured?.width ?? (node.type === 'terminal' ? 400 : 200)
      const height = node.measured?.height ?? (node.type === 'terminal' ? 300 : 80)

      if (node.position.x < minX) minX = node.position.x
      if (node.position.y < minY) minY = node.position.y
      if (node.position.x + width > maxX) maxX = node.position.x + width
      if (node.position.y + height > maxY) maxY = node.position.y + height
    }
  }

  if (minX === Infinity) return null

  const padding = 6
  const viewport = getViewport()

  // Convert flow coords to screen coords
  const screenX = minX * viewport.zoom + viewport.x - padding
  const screenY = minY * viewport.zoom + viewport.y - padding
  const screenWidth = (maxX - minX) * viewport.zoom + padding * 2
  const screenHeight = (maxY - minY) * viewport.zoom + padding * 2

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: screenX,
        top: screenY + 28, // Account for title bar
        width: screenWidth,
        height: screenHeight,
        border: '1px dashed #3b82f6',
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

function DrawingHandler({ mode, drawColor, setNodes }: DrawingHandlerProps) {
  const { screenToFlowPosition } = useReactFlow()
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
          strokeWidth: 2,
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
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>,
    document.body
  )
}

function Canvas({ nodes, setNodes, edges, setEdges, focusedNodeId, setFocusedNodeId, onRemoveNode, mode, drawColor, onFilePreview, onFolderFileAdded, onAddFolderAtPosition }: CanvasProps) {
  const [isZoomActive, setIsZoomActive] = useState(false)
  const { screenToFlowPosition } = useReactFlow()

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

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
    },
    [setEdges]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges]
  )

  const contextValue = useMemo(
    () => ({ focusedNodeId, setFocusedNodeId, onRemoveNode, mode, isZoomActive, setIsZoomActive, onFilePreview, onFolderFileAdded }),
    [focusedNodeId, setFocusedNodeId, onRemoveNode, mode, isZoomActive, onFilePreview, onFolderFileAdded]
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
          nodeTypes={nodeTypes}
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
          nodeDragThreshold={5}
          onPaneClick={() => setFocusedNodeId(null)}
        >
          <Background variant={BackgroundVariant.Dots} color="#d0d0d0" gap={16} size={2} />
          <Controls />
          <MiniMap
            nodeColor="#d4d4d4"
            maskColor="rgba(255, 255, 255, 0.8)"
          />
          <ZoomHandler />
          <DrawingHandler mode={mode} drawColor={drawColor} setNodes={setNodes} />
          <SelectionOverlay nodes={nodes} />
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  )
}

export default Canvas
