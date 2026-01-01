import { useState, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import type { TerminalNode } from './types'

let nodeIdCounter = 0

function App() {
  const [nodes, setNodes] = useState<TerminalNode[]>([])
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  const addTerminal = useCallback((command: string) => {
    const id = `terminal-${++nodeIdCounter}`
    const newNode: TerminalNode = {
      id,
      type: 'terminal',
      position: {
        x: 100 + (nodeIdCounter % 3) * 420,
        y: 100 + Math.floor(nodeIdCounter / 3) * 350
      },
      dragHandle: '.dragHandle',
      data: {
        title: command === 'claude' ? 'Claude' : 'Terminal',
        command,
        cwd: '',
        cols: 80,
        rows: 24
      }
    }
    setNodes((nds) => [...nds, newNode])
    setFocusedNodeId(id)
  }, [])

  const removeNode = useCallback((nodeId: string) => {
    window.electronAPI.killPty(nodeId)
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    if (focusedNodeId === nodeId) {
      setFocusedNodeId(null)
    }
  }, [focusedNodeId])

  return (
    <ReactFlowProvider>
      <div className="app-container">
        <Toolbar onAddTerminal={addTerminal} />
        <Canvas
          nodes={nodes}
          setNodes={setNodes}
          focusedNodeId={focusedNodeId}
          setFocusedNodeId={setFocusedNodeId}
          onRemoveNode={removeNode}
        />
      </div>
    </ReactFlowProvider>
  )
}

export default App
