import { useEffect, useCallback, useRef } from 'react'
import type { Edge, Viewport } from '@xyflow/react'
import type { CanvasNode, TerminalNode, TextNode, FolderNode, CommandQueueNode, CommandItem } from '../types'

interface CreateTerminalOptions {
  command?: string
  cwd?: string
  position?: { x: number; y: number }
  title?: string
  cols?: number
  rows?: number
}

interface CreateTextNodeOptions {
  text?: string
  position?: { x: number; y: number }
}

interface CreateFolderNodeOptions {
  path: string
  position?: { x: number; y: number }
}

interface CreateQueueNodeOptions {
  position?: { x: number; y: number }
}

interface CreateEdgeOptions {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

interface UseAgentHandlerOptions {
  nodes: CanvasNode[]
  edges: Edge[]
  getViewport: () => Viewport
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  setViewport: (viewport: Viewport) => void
  setFocusedNodeId: (id: string | null) => void
  mode: string
}

export function useAgentHandler(options: UseAgentHandlerOptions) {
  const {
    nodes,
    edges,
    getViewport,
    setNodes,
    setEdges,
    setViewport,
    setFocusedNodeId,
    mode
  } = options

  // Use refs to access latest state in callbacks without re-registering handlers
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const modeRef = useRef(mode)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    modeRef.current = mode
  }, [nodes, edges, mode])

  // Helper to send response
  const sendResponse = useCallback((requestId: string, success: boolean, data?: unknown, error?: { code: string; message: string }) => {
    window.electronAPI.agentResponse(requestId, success, data, error)
  }, [])

  // Calculate default position for new nodes
  const calculatePosition = useCallback((offset: number = 0) => {
    const nodeCount = nodesRef.current.length + offset
    return {
      x: 100 + (nodeCount % 3) * 420,
      y: 100 + Math.floor(nodeCount / 3) * 350
    }
  }, [])

  // Handler: Get canvas state
  const handleGetState = useCallback((requestId: string) => {
    const state = {
      nodes: nodesRef.current,
      edges: edgesRef.current,
      viewport: getViewport(),
      focusedNodeId: nodesRef.current.find(n => n.selected)?.id || null,
      mode: modeRef.current
    }
    sendResponse(requestId, true, state)
  }, [getViewport, sendResponse])

  // Handler: Create node
  const handleCreateNode = useCallback(async (requestId: string, payload: unknown) => {
    const { type, ...options } = payload as { type: string } & Record<string, unknown>

    try {
      let newNode: CanvasNode

      switch (type) {
        case 'terminal': {
          const opts = options as CreateTerminalOptions
          const id = crypto.randomUUID()
          const position = opts.position || calculatePosition()
          newNode = {
            id,
            type: 'terminal',
            position,
            dragHandle: '.dragHandle',
            data: {
              title: opts.title || (opts.command === 'claude' ? 'Claude' : 'Terminal'),
              command: opts.command || '',
              cwd: opts.cwd || '',
              cols: opts.cols || 80,
              rows: opts.rows || 24
            }
          } as TerminalNode
          break
        }

        case 'text': {
          const opts = options as CreateTextNodeOptions
          const id = crypto.randomUUID()
          const position = opts.position || calculatePosition()
          newNode = {
            id,
            type: 'text',
            position,
            data: {
              text: opts.text || ''
            }
          } as TextNode
          break
        }

        case 'folder': {
          const opts = options as CreateFolderNodeOptions
          if (!opts.path) {
            sendResponse(requestId, false, undefined, {
              code: 'INVALID_REQUEST',
              message: 'Folder path is required'
            })
            return
          }
          const id = crypto.randomUUID()
          const position = opts.position || calculatePosition()
          const files = await window.electronAPI.listFolder(opts.path)
          newNode = {
            id,
            type: 'folder',
            position,
            dragHandle: '.dragHandle',
            data: {
              folderPath: opts.path,
              files,
              isWatching: true
            }
          } as FolderNode
          break
        }

        case 'queue': {
          const opts = options as CreateQueueNodeOptions
          const id = crypto.randomUUID()
          const position = opts.position || calculatePosition()
          newNode = {
            id,
            type: 'queue',
            position,
            dragHandle: '.dragHandle',
            data: {
              commands: []
            }
          } as CommandQueueNode
          break
        }

        default:
          sendResponse(requestId, false, undefined, {
            code: 'INVALID_NODE_TYPE',
            message: `Invalid node type: ${type}`
          })
          return
      }

      setNodes(nds => [...nds, newNode])
      sendResponse(requestId, true, newNode)
    } catch (err) {
      sendResponse(requestId, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: (err as Error).message
      })
    }
  }, [calculatePosition, setNodes, sendResponse])

  // Handler: Update node
  const handleUpdateNode = useCallback((requestId: string, payload: unknown) => {
    const { nodeId, updates } = payload as { nodeId: string; updates: Partial<CanvasNode> }

    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) {
      sendResponse(requestId, false, undefined, {
        code: 'NODE_NOT_FOUND',
        message: `Node ${nodeId} not found`
      })
      return
    }

    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      return {
        ...n,
        ...updates,
        data: updates.data ? { ...n.data, ...updates.data } : n.data
      } as CanvasNode
    }))

    // Get updated node
    const updatedNode = {
      ...node,
      ...updates,
      data: updates.data ? { ...node.data, ...updates.data } : node.data
    }
    sendResponse(requestId, true, updatedNode)
  }, [setNodes, sendResponse])

  // Handler: Delete node
  const handleDeleteNode = useCallback((requestId: string, payload: unknown) => {
    const { nodeId } = payload as { nodeId: string }

    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) {
      sendResponse(requestId, false, undefined, {
        code: 'NODE_NOT_FOUND',
        message: `Node ${nodeId} not found`
      })
      return
    }

    // Cleanup resources
    if (node.type === 'terminal') {
      window.electronAPI.killPty(nodeId)
    } else if (node.type === 'folder') {
      window.electronAPI.unwatchFolder(nodeId)
    }

    setNodes(nds => nds.filter(n => n.id !== nodeId))
    // Also remove connected edges
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))

    sendResponse(requestId, true, { deleted: nodeId })
  }, [setNodes, setEdges, sendResponse])

  // Handler: Create edge
  const handleCreateEdge = useCallback((requestId: string, payload: unknown) => {
    const opts = payload as CreateEdgeOptions

    const sourceNode = nodesRef.current.find(n => n.id === opts.source)
    const targetNode = nodesRef.current.find(n => n.id === opts.target)

    if (!sourceNode) {
      sendResponse(requestId, false, undefined, {
        code: 'NODE_NOT_FOUND',
        message: `Source node ${opts.source} not found`
      })
      return
    }

    if (!targetNode) {
      sendResponse(requestId, false, undefined, {
        code: 'NODE_NOT_FOUND',
        message: `Target node ${opts.target} not found`
      })
      return
    }

    const newEdge: Edge = {
      id: `${opts.source}-${opts.target}-${Date.now()}`,
      source: opts.source,
      target: opts.target,
      sourceHandle: opts.sourceHandle,
      targetHandle: opts.targetHandle
    }

    setEdges(eds => [...eds, newEdge])
    sendResponse(requestId, true, newEdge)
  }, [setEdges, sendResponse])

  // Handler: Delete edge
  const handleDeleteEdge = useCallback((requestId: string, payload: unknown) => {
    const { edgeId } = payload as { edgeId: string }

    const edge = edgesRef.current.find(e => e.id === edgeId)
    if (!edge) {
      sendResponse(requestId, false, undefined, {
        code: 'NODE_NOT_FOUND',
        message: `Edge ${edgeId} not found`
      })
      return
    }

    setEdges(eds => eds.filter(e => e.id !== edgeId))
    sendResponse(requestId, true, { deleted: edgeId })
  }, [setEdges, sendResponse])

  // Handler: Set viewport
  const handleSetViewport = useCallback((requestId: string, payload: unknown) => {
    const viewport = payload as Viewport
    setViewport(viewport)
    sendResponse(requestId, true, viewport)
  }, [setViewport, sendResponse])

  // Handler: Set focused node
  const handleSetFocused = useCallback((requestId: string, payload: unknown) => {
    const { nodeId } = payload as { nodeId: string | null }
    setFocusedNodeId(nodeId)
    sendResponse(requestId, true, { focusedNodeId: nodeId })
  }, [setFocusedNodeId, sendResponse])

  // Handler: Add command to queue
  const handleAddQueueCommand = useCallback((requestId: string, payload: unknown) => {
    const { queueId, command } = payload as { queueId: string; command: string }

    const node = nodesRef.current.find(n => n.id === queueId)
    if (!node || node.type !== 'queue') {
      sendResponse(requestId, false, undefined, {
        code: 'NODE_NOT_FOUND',
        message: `Queue ${queueId} not found`
      })
      return
    }

    const newCommand: CommandItem = {
      id: crypto.randomUUID(),
      command,
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

    sendResponse(requestId, true, newCommand)
  }, [setNodes, sendResponse])

  // Handler: Remove command from queue
  const handleRemoveQueueCommand = useCallback((requestId: string, payload: unknown) => {
    const { queueId, commandId } = payload as { queueId: string; commandId: string }

    const node = nodesRef.current.find(n => n.id === queueId)
    if (!node || node.type !== 'queue') {
      sendResponse(requestId, false, undefined, {
        code: 'NODE_NOT_FOUND',
        message: `Queue ${queueId} not found`
      })
      return
    }

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

    sendResponse(requestId, true, { removed: commandId })
  }, [setNodes, sendResponse])

  // Register all handlers
  useEffect(() => {
    const unsubscribers = [
      window.electronAPI.onAgentGetState(handleGetState),
      window.electronAPI.onAgentCreateNode(handleCreateNode),
      window.electronAPI.onAgentUpdateNode(handleUpdateNode),
      window.electronAPI.onAgentDeleteNode(handleDeleteNode),
      window.electronAPI.onAgentCreateEdge(handleCreateEdge),
      window.electronAPI.onAgentDeleteEdge(handleDeleteEdge),
      window.electronAPI.onAgentSetViewport(handleSetViewport),
      window.electronAPI.onAgentSetFocused(handleSetFocused),
      window.electronAPI.onAgentAddQueueCommand(handleAddQueueCommand),
      window.electronAPI.onAgentRemoveQueueCommand(handleRemoveQueueCommand)
    ]

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [
    handleGetState,
    handleCreateNode,
    handleUpdateNode,
    handleDeleteNode,
    handleCreateEdge,
    handleDeleteEdge,
    handleSetViewport,
    handleSetFocused,
    handleAddQueueCommand,
    handleRemoveQueueCommand
  ])
}
