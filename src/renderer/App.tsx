import { useState, useCallback, useEffect, useMemo } from 'react'
import { ReactFlowProvider, type Edge } from '@xyflow/react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import { FilePreviewModal, type PreviewContext } from './components/FilePreviewModal'
import type { CanvasNode, TerminalNode, TextNode, FolderNode, FileInfo } from './types'

export type CanvasMode = 'hand' | 'select' | 'draw'

const DRAW_COLORS = ['#2c2c2c', '#ef4444']

function App() {
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [mode, setMode] = useState<CanvasMode>('hand')
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0])
  const [previewContext, setPreviewContext] = useState<PreviewContext>(null)

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
    setMode('select')
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
    setMode('select')
  }, [nodes.length])

  const addFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return

    const id = crypto.randomUUID()
    const nodeCount = nodes.length
    const files = await window.electronAPI.listFolder(folderPath)

    const newNode: FolderNode = {
      id,
      type: 'folder',
      position: {
        x: 150 + (nodeCount % 4) * 280,
        y: 150 + Math.floor(nodeCount / 4) * 350
      },
      dragHandle: '.dragHandle',
      data: {
        folderPath,
        files,
        isWatching: true
      }
    }
    setNodes((nds) => [...nds, newNode])
    setMode('select')
  }, [nodes.length])

  const addFolderAtPosition = useCallback(async (folderPath: string, x: number, y: number) => {
    const id = crypto.randomUUID()
    const files = await window.electronAPI.listFolder(folderPath)

    const newNode: FolderNode = {
      id,
      type: 'folder',
      position: { x, y },
      dragHandle: '.dragHandle',
      data: {
        folderPath,
        files,
        isWatching: true
      }
    }
    setNodes((nds) => [...nds, newNode])
    setMode('select')
  }, [])

  const removeNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node?.type === 'terminal') {
      window.electronAPI.killPty(nodeId)
    } else if (node?.type === 'folder') {
      window.electronAPI.unwatchFolder(nodeId)
    }
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    if (focusedNodeId === nodeId) {
      setFocusedNodeId(null)
    }
  }, [focusedNodeId, nodes])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Mode switching: h = hand (pan), v = select (move nodes), p = draw (pencil)
      if (e.code === 'KeyH') {
        setMode('hand')
      } else if (e.code === 'KeyV') {
        setMode('select')
      } else if (e.code === 'KeyP') {
        setMode('draw')
      }

      // Add terminal: Cmd+T (or Ctrl+T)
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyT') {
        e.preventDefault()
        if (e.shiftKey) {
          addTerminal('claude')
        } else {
          addTerminal('')
        }
      }

      // Add text node: Cmd+N (or Ctrl+N)
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyN') {
        e.preventDefault()
        addTextbox()
      }

      // Add folder: Cmd+Shift+F (or Ctrl+Shift+F)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyF') {
        e.preventDefault()
        addFolder()
      }

      // Delete selected nodes: Delete or Backspace
      if (e.code === 'Delete' || e.code === 'Backspace') {
        setNodes(nds => {
          const selectedNodes = nds.filter(n => n.selected)
          selectedNodes.forEach(n => {
            if (n.type === 'terminal') {
              window.electronAPI.killPty(n.id)
            } else if (n.type === 'folder') {
              window.electronAPI.unwatchFolder(n.id)
            }
          })
          return nds.filter(n => !n.selected)
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addTerminal, addTextbox, addFolder, setNodes])

  // Build map of folder node connections for auto-copy pipeline
  const folderEdgeMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      if (sourceNode?.type === 'folder' && targetNode?.type === 'folder') {
        const targets = map.get(edge.source) || []
        targets.push(edge.target)
        map.set(edge.source, targets)
      }
    }
    return map
  }, [edges, nodes])

  // Handle file added in folder - copy to connected folders
  const handleFolderFileAdded = useCallback((sourceNodeId: string, filePath: string) => {
    console.log('[App] File added in folder:', sourceNodeId, filePath)
    const targetNodeIds = folderEdgeMap.get(sourceNodeId)
    console.log('[App] Target folders:', targetNodeIds)
    if (!targetNodeIds || targetNodeIds.length === 0) return

    for (const targetId of targetNodeIds) {
      const targetNode = nodes.find(n => n.id === targetId) as FolderNode | undefined
      if (targetNode?.data.folderPath) {
        console.log('[App] Copying to:', targetNode.data.folderPath)
        window.electronAPI.copyFile(filePath, targetNode.data.folderPath)
          .then(newPath => console.log('[App] Copied to:', newPath))
          .catch(err => console.error('[App] Auto-copy failed:', err))
      }
    }
  }, [folderEdgeMap, nodes])

  // Handle file change from preview modal (arrow key navigation)
  const handlePreviewFileChange = useCallback((file: FileInfo) => {
    setPreviewContext(prev => prev ? { ...prev, file } : null)
  }, [])

  return (
    <ReactFlowProvider>
      <div className="app-container">
        <div className="window-drag-bar" />
        <Toolbar
          onAddTerminal={addTerminal}
          onAddTextbox={addTextbox}
          onAddFolder={addFolder}
          mode={mode}
          onModeChange={setMode}
          drawColor={drawColor}
          onDrawColorChange={setDrawColor}
          drawColors={DRAW_COLORS}
        />
        <Canvas
          nodes={nodes}
          setNodes={setNodes}
          edges={edges}
          setEdges={setEdges}
          focusedNodeId={focusedNodeId}
          setFocusedNodeId={setFocusedNodeId}
          onRemoveNode={removeNode}
          mode={mode}
          drawColor={drawColor}
          onFilePreview={setPreviewContext}
          onFolderFileAdded={handleFolderFileAdded}
          onAddFolderAtPosition={addFolderAtPosition}
        />
        <FilePreviewModal
          context={previewContext}
          onClose={() => setPreviewContext(null)}
          onFileChange={handlePreviewFileChange}
        />
      </div>
    </ReactFlowProvider>
  )
}

export default App
