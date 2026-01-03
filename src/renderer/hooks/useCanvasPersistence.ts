import { useState, useEffect, useCallback, useRef } from 'react'
import type { Edge, Viewport } from '@xyflow/react'
import type { CanvasNode } from '../types'
import type { CanvasData, CanvasNodeData, SaveFileMetadata } from '../../preload/index'

interface UseCanvasPersistenceOptions {
  nodes: CanvasNode[]
  edges: Edge[]
  getViewport: () => Viewport
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  setViewport: (viewport: Viewport, options?: { duration?: number }) => void
  onBeforeLoad?: () => void
}

export function useCanvasPersistence(options: UseCanvasPersistenceOptions) {
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveFiles, setSaveFiles] = useState<SaveFileMetadata[]>([])
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const isLoadingRef = useRef(false)
  const lastSavedRef = useRef<string>('')

  // Refresh list of save files
  const refreshSaveFiles = useCallback(async () => {
    const files = await window.electronAPI.listCanvases()
    setSaveFiles(files)
  }, [])

  // Load save files on mount
  useEffect(() => {
    refreshSaveFiles()
  }, [refreshSaveFiles])

  // Track changes to mark dirty (but not during load)
  useEffect(() => {
    if (isLoadingRef.current || !currentFile) return

    // Create a simple hash of the current state to detect actual changes
    const stateHash = JSON.stringify({
      nodes: options.nodes.map(n => ({ id: n.id, position: n.position, data: n.data })),
      edges: options.edges.map(e => ({ source: e.source, target: e.target }))
    })

    if (stateHash !== lastSavedRef.current) {
      setIsDirty(true)
    }
  }, [options.nodes, options.edges, currentFile])

  // Auto-save with debounce (2 second delay)
  useEffect(() => {
    if (!currentFile || !isDirty || isLoadingRef.current) return

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      save()
    }, 2000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [isDirty, currentFile])

  const gatherSaveData = useCallback(async (): Promise<CanvasData> => {
    // Get current CWD for all terminal nodes
    const nodesData: CanvasNodeData[] = await Promise.all(
      options.nodes.map(async (node) => {
        if (node.type === 'terminal') {
          const cwd = await window.electronAPI.getPtyCwd(node.id)
          return {
            id: node.id,
            type: node.type,
            position: node.position,
            data: {
              ...node.data,
              cwd: cwd || node.data.cwd
            }
          }
        }
        if (node.type === 'folder') {
          // Don't save files array or isWatching - they'll be repopulated
          return {
            id: node.id,
            type: node.type,
            position: node.position,
            data: {
              folderPath: node.data.folderPath
            }
          }
        }
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          data: node.data
        }
      })
    )

    return {
      viewport: options.getViewport(),
      nodes: nodesData,
      edges: options.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined
      }))
    }
  }, [options.nodes, options.edges, options.getViewport])

  const save = useCallback(async () => {
    if (!currentFile || isSaving) return

    setIsSaving(true)
    try {
      const data = await gatherSaveData()
      await window.electronAPI.saveCanvas(currentFile, data)

      // Update last saved hash
      lastSavedRef.current = JSON.stringify({
        nodes: options.nodes.map(n => ({ id: n.id, position: n.position, data: n.data })),
        edges: options.edges.map(e => ({ source: e.source, target: e.target }))
      })

      setIsDirty(false)
      await refreshSaveFiles()
    } catch (err) {
      console.error('[Persistence] Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [currentFile, isSaving, gatherSaveData, options.nodes, options.edges, refreshSaveFiles])

  const saveAs = useCallback(async (filename: string) => {
    if (isSaving) return

    setIsSaving(true)
    try {
      const data = await gatherSaveData()
      await window.electronAPI.saveCanvas(filename, data)

      // Update state
      setCurrentFile(filename)
      lastSavedRef.current = JSON.stringify({
        nodes: options.nodes.map(n => ({ id: n.id, position: n.position, data: n.data })),
        edges: options.edges.map(e => ({ source: e.source, target: e.target }))
      })
      setIsDirty(false)
      await refreshSaveFiles()
    } catch (err) {
      console.error('[Persistence] Save As failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, gatherSaveData, options.nodes, options.edges, refreshSaveFiles])

  const load = useCallback(async (filename: string): Promise<boolean> => {
    const data = await window.electronAPI.loadCanvas(filename)
    if (!data) return false

    isLoadingRef.current = true

    try {
      // Call cleanup callback before loading
      options.onBeforeLoad?.()

      // Kill existing PTYs and unwatchFolders
      for (const node of options.nodes) {
        if (node.type === 'terminal') {
          window.electronAPI.killPty(node.id)
        } else if (node.type === 'folder') {
          window.electronAPI.unwatchFolder(node.id)
        }
      }

      // Generate new IDs for fresh PTY/watcher initialization
      const idMap = new Map<string, string>()
      const restoredNodes: CanvasNode[] = data.nodes.map(node => {
        const newId = crypto.randomUUID()
        idMap.set(node.id, newId)

        if (node.type === 'folder') {
          return {
            id: newId,
            type: 'folder' as const,
            position: node.position,
            dragHandle: '.dragHandle',
            data: {
              folderPath: (node.data as { folderPath: string }).folderPath,
              files: [],
              isWatching: true
            }
          }
        }

        if (node.type === 'terminal') {
          return {
            id: newId,
            type: 'terminal' as const,
            position: node.position,
            dragHandle: '.dragHandle',
            data: node.data as CanvasNode['data']
          }
        }

        if (node.type === 'drawing') {
          return {
            id: newId,
            type: 'drawing' as const,
            position: node.position,
            data: node.data as CanvasNode['data']
          }
        }

        // Text node
        return {
          id: newId,
          type: 'text' as const,
          position: node.position,
          data: node.data as CanvasNode['data']
        }
      }) as CanvasNode[]

      // Update edge references to use new IDs
      const restoredEdges: Edge[] = data.edges.map(edge => ({
        id: crypto.randomUUID(),
        source: idMap.get(edge.source) || edge.source,
        target: idMap.get(edge.target) || edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      }))

      // Apply state
      options.setNodes(restoredNodes)
      options.setEdges(restoredEdges)

      // Restore viewport with a small delay to ensure nodes are rendered
      setTimeout(() => {
        options.setViewport(data.viewport)
      }, 50)

      setCurrentFile(filename)
      lastSavedRef.current = JSON.stringify({
        nodes: restoredNodes.map(n => ({ id: n.id, position: n.position, data: n.data })),
        edges: restoredEdges.map(e => ({ source: e.source, target: e.target }))
      })
      setIsDirty(false)

      return true
    } finally {
      // Small delay before re-enabling dirty tracking
      setTimeout(() => {
        isLoadingRef.current = false
      }, 500)
    }
  }, [options])

  const newCanvas = useCallback(() => {
    // Kill existing PTYs and unwatchFolders
    for (const node of options.nodes) {
      if (node.type === 'terminal') {
        window.electronAPI.killPty(node.id)
      } else if (node.type === 'folder') {
        window.electronAPI.unwatchFolder(node.id)
      }
    }

    options.setNodes([])
    options.setEdges([])
    setCurrentFile(null)
    setIsDirty(false)
    lastSavedRef.current = ''
  }, [options])

  const deleteFile = useCallback(async (filename: string) => {
    await window.electronAPI.deleteCanvas(filename)
    await refreshSaveFiles()

    // If we deleted the current file, clear state
    if (filename === currentFile) {
      setCurrentFile(null)
      setIsDirty(false)
    }
  }, [currentFile, refreshSaveFiles])

  return {
    currentFile,
    isDirty,
    isSaving,
    saveFiles,
    save,
    saveAs,
    load,
    newCanvas,
    deleteFile,
    refreshSaveFiles
  }
}
