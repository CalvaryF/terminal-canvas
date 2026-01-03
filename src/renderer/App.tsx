import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import { FileMenu } from './components/FileMenu'
import { FilePreviewModal, type PreviewContext } from './components/FilePreviewModal'
import { useCanvasPersistence } from './hooks/useCanvasPersistence'
import { useAgentHandler } from './hooks/useAgentHandler'
import type { CanvasNode, TerminalNode, TextNode, FolderNode, FileInfo, CommandQueueNode, CommandItem } from './types'

export type CanvasMode = 'hand' | 'select' | 'draw'

const DRAW_COLORS = ['#2c2c2c', '#ef4444']

function AppContent() {
  const { getViewport, setViewport } = useReactFlow()
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [mode, setMode] = useState<CanvasMode>('hand')
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0])
  const [previewContext, setPreviewContext] = useState<PreviewContext>(null)
  const clipboardRef = useRef<CanvasNode[]>([])

  // Canvas persistence
  const persistence = useCanvasPersistence({
    nodes,
    edges,
    getViewport,
    setNodes,
    setEdges,
    setViewport
  })

  // Agent API handler - allows external control via HTTP/WebSocket
  useAgentHandler({
    nodes,
    edges,
    getViewport,
    setNodes,
    setEdges,
    setViewport,
    setFocusedNodeId,
    mode
  })

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

  const addCommandQueue = useCallback(() => {
    const id = crypto.randomUUID()
    const nodeCount = nodes.length
    const newNode: CommandQueueNode = {
      id,
      type: 'queue',
      position: {
        x: 150 + (nodeCount % 4) * 280,
        y: 150 + Math.floor(nodeCount / 4) * 250
      },
      dragHandle: '.dragHandle',
      data: {
        commands: []
      }
    }
    setNodes((nds) => [...nds, newNode])
    setMode('select')
  }, [nodes.length])

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
        // Clear all selections in hand mode
        setNodes(nds => nds.map(n => ({ ...n, selected: false })))
        setEdges(eds => eds.map(e => ({ ...e, selected: false })))
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

      // Save: Cmd+S (or Ctrl+S)
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
        e.preventDefault()
        if (e.shiftKey) {
          // Cmd+Shift+S - trigger save as (handled by FileMenu)
        } else if (persistence.currentFile) {
          persistence.save()
        }
      }

      // Copy: Cmd+C
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyC') {
        const selectedNodes = nodes.filter(n => n.selected)
        if (selectedNodes.length > 0) {
          e.preventDefault()
          clipboardRef.current = selectedNodes.map(n => ({ ...n }))
        }
      }

      // Paste: Cmd+V
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV') {
        if (clipboardRef.current.length > 0) {
          e.preventDefault()
          const offset = 50
          const newNodes = clipboardRef.current.map(n => ({
            ...n,
            id: crypto.randomUUID(),
            position: { x: n.position.x + offset, y: n.position.y + offset },
            selected: true,
            // Reset terminal/folder specific state
            ...(n.type === 'terminal' ? { data: { ...n.data, cwd: '' } } : {}),
            ...(n.type === 'folder' ? { data: { ...n.data, files: [], isWatching: true } } : {})
          })) as CanvasNode[]

          // Deselect old nodes, add new ones
          setNodes(nds => [
            ...nds.map(n => ({ ...n, selected: false })),
            ...newNodes
          ])
          // Update clipboard to new nodes for repeated paste
          clipboardRef.current = newNodes.map(n => ({ ...n }))
        }
      }

      // Delete selected nodes and edges: Delete or Backspace
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
        setEdges(eds => eds.filter(e => !e.selected))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addTerminal, addTextbox, addFolder, setNodes, persistence, nodes])

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

  // Build map of queue -> terminal connections
  const queueTerminalMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      if (sourceNode?.type === 'queue' && targetNode?.type === 'terminal') {
        map.set(edge.source, edge.target)
      }
    }
    return map
  }, [edges, nodes])

  // Handle command queue actions (add, send, remove)
  const handleSendCommand = useCallback((queueId: string, action: 'add' | 'send' | 'remove', payload: CommandItem | string) => {
    if (action === 'add') {
      // Add a new command to the queue
      const command = payload as CommandItem
      setNodes(nds => nds.map(n => {
        if (n.id !== queueId || n.type !== 'queue') return n
        const queueNode = n as CommandQueueNode
        return {
          ...queueNode,
          data: {
            ...queueNode.data,
            commands: [...queueNode.data.commands, command]
          }
        }
      }))
    } else if (action === 'send') {
      // Send a command to the connected terminal
      const commandId = payload as string
      const terminalId = queueTerminalMap.get(queueId)

      if (!terminalId) {
        console.warn('[App] No terminal connected to queue:', queueId)
        return
      }

      // Find the command
      const queueNode = nodes.find(n => n.id === queueId && n.type === 'queue') as CommandQueueNode | undefined
      const command = queueNode?.data.commands.find(c => c.id === commandId)

      if (!command) {
        console.warn('[App] Command not found:', commandId)
        return
      }

      // Send to terminal
      window.electronAPI.writePty(terminalId, command.command + '\n')

      // Remove command from queue after sending
      setNodes(nds => nds.map(n => {
        if (n.id !== queueId || n.type !== 'queue') return n
        const qNode = n as CommandQueueNode
        return {
          ...qNode,
          data: {
            ...qNode.data,
            commands: qNode.data.commands.filter(c => c.id !== commandId)
          }
        }
      }))
    } else if (action === 'remove') {
      // Remove a pending command from the queue
      const commandId = payload as string
      setNodes(nds => nds.map(n => {
        if (n.id !== queueId || n.type !== 'queue') return n
        const queueNode = n as CommandQueueNode
        return {
          ...queueNode,
          data: {
            ...queueNode.data,
            commands: queueNode.data.commands.filter(c => c.id !== commandId)
          }
        }
      }))
    }
  }, [queueTerminalMap, nodes])

  // Handle text node content changes
  const handleTextChange = useCallback((nodeId: string, text: string) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId || n.type !== 'text') return n
      return {
        ...n,
        data: { ...n.data, text }
      }
    }))
  }, [])

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

  // Handle option+drag duplication
  const handleDuplicateNodes = useCallback((nodesToDuplicate: CanvasNode[]) => {
    const newNodes = nodesToDuplicate.map(n => ({
      ...n,
      id: crypto.randomUUID(),
      selected: false,
      // Reset terminal/folder specific state
      ...(n.type === 'terminal' ? { data: { ...n.data, cwd: '' } } : {}),
      ...(n.type === 'folder' ? { data: { ...n.data, files: [], isWatching: true } } : {})
    })) as CanvasNode[]

    setNodes(nds => [...nds, ...newNodes])
  }, [setNodes])

  return (
    <div className="app-container">
      <div className="window-drag-bar">
        <FileMenu
          currentFile={persistence.currentFile}
          isDirty={persistence.isDirty}
          isSaving={persistence.isSaving}
          saveFiles={persistence.saveFiles}
          onSave={persistence.save}
          onSaveAs={persistence.saveAs}
          onLoad={persistence.load}
          onNew={persistence.newCanvas}
        />
      </div>
      <Toolbar
          onAddTerminal={addTerminal}
          onAddTextbox={addTextbox}
          onAddFolder={addFolder}
          onAddCommandQueue={addCommandQueue}
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
          onDuplicateNodes={handleDuplicateNodes}
          onSendCommand={handleSendCommand}
          onTextChange={handleTextChange}
        />
        <FilePreviewModal
          context={previewContext}
          onClose={() => setPreviewContext(null)}
          onFileChange={handlePreviewFileChange}
        />
    </div>
  )
}

function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  )
}

export default App
