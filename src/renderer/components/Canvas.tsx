import { useCallback, useMemo, createContext, useContext } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
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
          selectionOnDrag={false}
          panOnDrag={[1, 2]}
          selectNodesOnDrag={false}
          nodeDragThreshold={5}
          onPaneClick={() => setFocusedNodeId(null)}
        >
          <Background color="#0f3460" gap={20} />
          <Controls />
          <MiniMap
            nodeColor="#0f3460"
            maskColor="rgba(22, 33, 62, 0.8)"
          />
        </ReactFlow>
      </div>
    </CanvasContext.Provider>
  )
}

export default Canvas
