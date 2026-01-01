import { useCallback, useMemo, useEffect, useRef, createContext, useContext } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import TerminalNode from './TerminalNode'
import type { TerminalNode as TerminalNodeType } from '../types'

interface CanvasContextType {
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  onRemoveNode: (id: string) => void
}

export const CanvasContext = createContext<CanvasContextType>({
  focusedNodeId: null,
  setFocusedNodeId: () => {},
  onRemoveNode: () => {}
})

export const useCanvasContext = () => useContext(CanvasContext)

const nodeTypes: NodeTypes = {
  terminal: TerminalNode
}

interface CanvasProps {
  nodes: TerminalNodeType[]
  setNodes: React.Dispatch<React.SetStateAction<TerminalNodeType[]>>
  focusedNodeId: string | null
  setFocusedNodeId: (id: string | null) => void
  onRemoveNode: (id: string) => void
}

function ZoomHandler() {
  const { getViewport, setViewport } = useReactFlow()
  const keysRef = useRef({ z: false, alt: false })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use e.code to detect physical key regardless of modifiers
      // (Option+z on Mac produces 'Ω' for e.key, but e.code is still 'KeyZ')
      if (e.code === 'KeyZ') keysRef.current.z = true
      if (e.key === 'Alt') keysRef.current.alt = true
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyZ') keysRef.current.z = false
      if (e.key === 'Alt') keysRef.current.alt = false
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (!keysRef.current.z) return

      e.preventDefault()
      e.stopPropagation()

      const viewport = getViewport()
      const zoomFactor = keysRef.current.alt ? 0.8 : 1.25
      const newZoom = Math.min(Math.max(viewport.zoom * zoomFactor, 0.1), 2)

      // Zoom towards cursor position
      // Convert mouse position to flow coordinates, then adjust viewport
      // so that point stays under the cursor after zoom
      const mouseX = e.clientX
      const mouseY = e.clientY

      // Point in flow coordinates under the cursor
      const pointX = (mouseX - viewport.x) / viewport.zoom
      const pointY = (mouseY - viewport.y) / viewport.zoom

      // New viewport position to keep that point under cursor
      const newX = mouseX - pointX * newZoom
      const newY = mouseY - pointY * newZoom

      setViewport({ x: newX, y: newY, zoom: newZoom })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousedown', handleMouseDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [getViewport, setViewport])

  return null
}

function Canvas({ nodes, setNodes, focusedNodeId, setFocusedNodeId, onRemoveNode }: CanvasProps) {
  const onNodesChange = useCallback(
    (changes: NodeChange<TerminalNodeType>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds) as TerminalNodeType[])
    },
    [setNodes]
  )

  const contextValue = useMemo(
    () => ({ focusedNodeId, setFocusedNodeId, onRemoveNode }),
    [focusedNodeId, setFocusedNodeId, onRemoveNode]
  )

  return (
    <CanvasContext.Provider value={contextValue}>
      <div className="canvas-container">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          fitView={false}
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          panOnScroll
          panOnDrag
          zoomOnDoubleClick={false}
          selectionOnDrag={false}
          selectNodesOnDrag={false}
          nodeDragThreshold={5}
          onPaneClick={() => setFocusedNodeId(null)}
        >
          <Background color="#e5e5e5" gap={20} />
          <Controls />
          <MiniMap
            nodeColor="#d4d4d4"
            maskColor="rgba(255, 255, 255, 0.8)"
          />
          <ZoomHandler />
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  )
}

export default Canvas
