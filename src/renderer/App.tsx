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

// Pattern to detect when Claude Code is idle and ready for next command
// Matches the prompt line that Claude Code shows when waiting for input
function detectIdlePattern(output: string): boolean {
  // Claude Code typically shows a prompt like "> " when ready
  // Also check for common shell prompts ending with $ or %
  const trimmed = output.trim()
  return (
    trimmed.endsWith('> ') ||
    trimmed.endsWith('>') ||
    trimmed.endsWith('$ ') ||
    trimmed.endsWith('$') ||
    trimmed.endsWith('% ') ||
    trimmed.endsWith('%') ||
    // Claude Code specific: look for the completion message
    trimmed.includes('Task completed') ||
    trimmed.includes('Done!')
  )
}

function AppContent() {
  const { getViewport, setViewport } = useReactFlow()
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [mode, setMode] = useState<CanvasMode>('hand')
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0])
  const [previewContext, setPreviewContext] = useState<PreviewContext>(null)
  const clipboardRef = useRef<CanvasNode[]>([])

  // Terminal queue state for folder→terminal automation
  const [terminalQueues, setTerminalQueues] = useState<Map<string, string[]>>(new Map())
  const [busyTerminals, setBusyTerminals] = useState<Set<string>>(new Set())

  // Get the center of the current view in flow coordinates
  const getViewCenter = useCallback(() => {
    const viewport = getViewport()
    const container = document.querySelector('.canvas-container')
    if (!container) return { x: 200, y: 200 }
    const rect = container.getBoundingClientRect()
    return {
      x: (-viewport.x + rect.width / 2) / viewport.zoom,
      y: (-viewport.y + rect.height / 2) / viewport.zoom
    }
  }, [getViewport])

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
    const center = getViewCenter()
    // Terminal nodes are ~400x300, offset to center
    const newNode: TerminalNode = {
      id,
      type: 'terminal',
      position: {
        x: center.x - 200,
        y: center.y - 150
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
  }, [getViewCenter])

  const addTextbox = useCallback(() => {
    const id = crypto.randomUUID()
    const center = getViewCenter()
    // Text nodes are ~200x80, offset to center
    const newNode: TextNode = {
      id,
      type: 'text',
      position: {
        x: center.x - 100,
        y: center.y - 40
      },
      data: {
        text: ''
      }
    }
    setNodes((nds) => [...nds, newNode])
    setMode('select')
  }, [getViewCenter])

  const addFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder()
    if (!folderPath) return

    const id = crypto.randomUUID()
    const center = getViewCenter()
    const files = await window.electronAPI.listFolder(folderPath)

    // Folder nodes are ~220x300, offset to center
    const newNode: FolderNode = {
      id,
      type: 'folder',
      position: {
        x: center.x - 110,
        y: center.y - 150
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
  }, [getViewCenter])

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
    const center = getViewCenter()
    // Queue nodes are ~240x200, offset to center
    const newNode: CommandQueueNode = {
      id,
      type: 'queue',
      position: {
        x: center.x - 120,
        y: center.y - 100
      },
      dragHandle: '.dragHandle',
      data: {
        commands: []
      }
    }
    setNodes((nds) => [...nds, newNode])
    setMode('select')
  }, [getViewCenter])

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

      // Bring to front: ]
      if (e.code === 'BracketRight') {
        setNodes(nds => {
          const maxZ = Math.max(0, ...nds.map(n => n.zIndex || 0))
          return nds.map(n => n.selected ? { ...n, zIndex: maxZ + 1 } : n)
        })
      }

      // Send to back: [
      if (e.code === 'BracketLeft') {
        setNodes(nds => {
          const minZ = Math.min(0, ...nds.map(n => n.zIndex || 0))
          return nds.map(n => n.selected ? { ...n, zIndex: minZ - 1 } : n)
        })
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

  // Build map of folder -> queue connections
  // The prompt template is now stored on the folder node itself
  const folderQueueMap = useMemo(() => {
    const map = new Map<string, string>()  // folderId -> queueId
    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      if (sourceNode?.type === 'folder' && targetNode?.type === 'queue') {
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

      // Send command text first, then Enter separately after a short delay
      // Interactive prompts (like Claude Code) need this separation to process correctly
      window.electronAPI.writePty(terminalId, command.command)
      setTimeout(() => {
        window.electronAPI.writePty(terminalId, '\r')
      }, 50)

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

  // Handle node resize
  const handleNodeResize = useCallback((nodeId: string, width: number, height: number) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      return {
        ...n,
        data: { ...n.data, width, height }
      }
    }))
  }, [])

  // Handle terminal title change
  const handleTerminalTitleChange = useCallback((nodeId: string, title: string) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId || n.type !== 'terminal') return n
      return {
        ...n,
        data: { ...n.data, title }
      }
    }))
  }, [])

  // Process next command in queue for a terminal
  const processQueue = useCallback((terminalId: string) => {
    setTerminalQueues(prev => {
      const queue = prev.get(terminalId)
      if (!queue || queue.length === 0) return prev

      const [nextCommand, ...rest] = queue

      // Mark terminal as busy
      setBusyTerminals(b => new Set(b).add(terminalId))

      // Send command
      console.log('[App] Sending queued command to terminal:', terminalId, nextCommand)
      window.electronAPI.writePty(terminalId, nextCommand + '\r')

      // Update queue
      const next = new Map(prev)
      next.set(terminalId, rest)
      return next
    })
  }, [])

  // Terminal idle detection - monitors PTY output for ready signals
  useEffect(() => {
    const listeners: (() => void)[] = []

    for (const node of nodes) {
      if (node.type !== 'terminal') continue

      const removeListener = window.electronAPI.onPtyData(node.id, (output) => {
        // Check if this terminal has queued commands and output indicates idle
        if (busyTerminals.has(node.id) && detectIdlePattern(output)) {
          console.log('[App] Terminal idle detected:', node.id)
          setBusyTerminals(prev => {
            const next = new Set(prev)
            next.delete(node.id)
            return next
          })
          // Process next queued command
          processQueue(node.id)
        }
      })
      listeners.push(removeListener)
    }

    return () => listeners.forEach(l => l())
  }, [nodes, busyTerminals, processQueue])

  // Handle file added in folder - copy to connected folders AND add commands to connected queues
  const handleFolderFileAdded = useCallback((sourceNodeId: string, filePath: string) => {
    console.log('[App] File added in folder:', sourceNodeId, filePath)

    // Folder → Folder: copy files to connected folders
    const targetNodeIds = folderEdgeMap.get(sourceNodeId)
    console.log('[App] Target folders:', targetNodeIds)
    if (targetNodeIds && targetNodeIds.length > 0) {
      for (const targetId of targetNodeIds) {
        const targetNode = nodes.find(n => n.id === targetId) as FolderNode | undefined
        if (targetNode?.data.folderPath) {
          console.log('[App] Copying to:', targetNode.data.folderPath)
          window.electronAPI.copyFile(filePath, targetNode.data.folderPath)
            .then(newPath => console.log('[App] Copied to:', newPath))
            .catch(err => console.error('[App] Auto-copy failed:', err))
        }
      }
    }

    // Folder → Queue: add command to connected queue
    const queueId = folderQueueMap.get(sourceNodeId)
    if (queueId) {
      // Get prompt template from the folder node
      const folderNode = nodes.find(n => n.id === sourceNodeId) as FolderNode | undefined
      const promptTemplate = folderNode?.data.promptTemplate

      if (promptTemplate) {
        const commandText = promptTemplate.replace('{filepath}', filePath)
        console.log('[App] Adding command to queue:', queueId, commandText)

        // Create a new command item and add it to the queue
        const newCommand: CommandItem = {
          id: crypto.randomUUID(),
          command: commandText,
          status: 'pending',
          addedAt: Date.now()
        }

        setNodes(nds => nds.map(n => {
          if (n.id !== queueId || n.type !== 'queue') return n
          const queueNode = n as CommandQueueNode
          return {
            ...queueNode,
            data: {
              ...queueNode.data,
              commands: [...queueNode.data.commands, newCommand]
            }
          }
        }))
      } else {
        console.log('[App] No prompt template set for folder:', sourceNodeId)
      }
    }
  }, [folderEdgeMap, folderQueueMap, nodes])

  // Handle file change from preview modal (arrow key navigation)
  const handlePreviewFileChange = useCallback((file: FileInfo) => {
    setPreviewContext(prev => prev ? { ...prev, file } : null)
  }, [])

  // Handle folder prompt template change
  const handleFolderPromptChange = useCallback((nodeId: string, promptTemplate: string) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId || n.type !== 'folder') return n
      return {
        ...n,
        data: { ...n.data, promptTemplate }
      }
    }))
  }, [])


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
          onSendCommand={handleSendCommand}
          onTextChange={handleTextChange}
          onNodeResize={handleNodeResize}
          onTerminalTitleChange={handleTerminalTitleChange}
          onFolderPromptChange={handleFolderPromptChange}
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
