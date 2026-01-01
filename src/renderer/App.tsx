import { useState, useCallback, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import type { CanvasNode, TerminalNode, TextNode } from './types'

export type CanvasMode = 'hand' | 'select'

function App() {
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [mode, setMode] = useState<CanvasMode>('hand')

  const addTerminal = useCallback((command: string) => {
    const id = crypto.randomUUID()
    const nodeCount = nodes.length
    const newNode: TerminalNode = {
      id,
      type: 'terminal',
      position: {
        x: 100 + (nodeCount % 3) * 420,
        y: 100 + Math.floor(nodeCount / 3) * 350
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
  }, [nodes.length])

  const addTextbox = useCallback(() => {
    const id = crypto.randomUUID()
    const nodeCount = nodes.length
    const newNode: TextNode = {
      id,
      type: 'text',
      position: {
        x: 150 + (nodeCount % 5) * 180,
        y: 150 + Math.floor(nodeCount / 5) * 120
      },
      data: {
        text: ''
      }
    }
    setNodes((nds) => [...nds, newNode])
  }, [nodes.length])

  const removeNode = useCallback((nodeId: string) => {
    window.electronAPI.killPty(nodeId)
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    if (focusedNodeId === nodeId) {
      setFocusedNodeId(null)
    }
  }, [focusedNodeId])

  // Mode switching: h = hand (pan), v = select (move nodes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't switch modes when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }
      if (e.code === 'KeyH') {
        setMode('hand')
      } else if (e.code === 'KeyV') {
        setMode('select')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ReactFlowProvider>
      <div className="app-container">
        <Toolbar onAddTerminal={addTerminal} onAddTextbox={addTextbox} mode={mode} onModeChange={setMode} />
        <Canvas
          nodes={nodes}
          setNodes={setNodes}
          focusedNodeId={focusedNodeId}
          setFocusedNodeId={setFocusedNodeId}
          onRemoveNode={removeNode}
          mode={mode}
        />
      </div>
    </ReactFlowProvider>
  )
}

export default App
