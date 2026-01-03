import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

// FileInfo interface (must match main process)
export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isImage: boolean
  isText: boolean
  extension: string
  size: number
  modifiedTime: number
}

// Canvas save/load types
export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasNodeData {
  id: string
  type: 'terminal' | 'text' | 'drawing' | 'folder' | 'queue'
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface CanvasEdgeData {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface CanvasData {
  viewport: CanvasViewport
  nodes: CanvasNodeData[]
  edges: CanvasEdgeData[]
}

export interface SaveFileMetadata {
  name: string
  filename: string
  savedAt: string
  nodeCount: number
}

// Store callbacks by nodeId
const dataCallbacks = new Map<string, (data: string) => void>()
const exitCallbacks = new Map<string, (exitCode: number) => void>()
const fileAddedCallbacks = new Map<string, (file: FileInfo) => void>()

// Register global listeners once at load time
ipcRenderer.on(IPC_CHANNELS.PTY_DATA, (_, nodeId: string, data: string) => {
  const callback = dataCallbacks.get(nodeId)
  if (callback) {
    callback(data)
  }
})

ipcRenderer.on(IPC_CHANNELS.PTY_EXIT, (_, nodeId: string, exitCode: number) => {
  const callback = exitCallbacks.get(nodeId)
  if (callback) {
    callback(exitCode)
  }
})

ipcRenderer.on(IPC_CHANNELS.FOLDER_FILE_ADDED, (_, nodeId: string, file: FileInfo) => {
  console.log('[Preload] Received file added event for nodeId:', nodeId, 'file:', file.name)
  console.log('[Preload] Registered callbacks:', Array.from(fileAddedCallbacks.keys()))
  const callback = fileAddedCallbacks.get(nodeId)
  if (callback) {
    console.log('[Preload] Found callback, calling it')
    callback(file)
  } else {
    console.log('[Preload] No callback found for nodeId:', nodeId)
  }
})

// Agent handler callbacks
const agentHandlers = {
  getState: null as ((requestId: string, payload: unknown) => void) | null,
  createNode: null as ((requestId: string, payload: unknown) => void) | null,
  updateNode: null as ((requestId: string, payload: unknown) => void) | null,
  deleteNode: null as ((requestId: string, payload: unknown) => void) | null,
  createEdge: null as ((requestId: string, payload: unknown) => void) | null,
  deleteEdge: null as ((requestId: string, payload: unknown) => void) | null,
  setViewport: null as ((requestId: string, payload: unknown) => void) | null,
  setFocused: null as ((requestId: string, payload: unknown) => void) | null,
  addQueueCommand: null as ((requestId: string, payload: unknown) => void) | null,
  removeQueueCommand: null as ((requestId: string, payload: unknown) => void) | null
}

// Register agent IPC listeners
ipcRenderer.on(IPC_CHANNELS.AGENT_GET_STATE, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.getState) agentHandlers.getState(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_CREATE_NODE, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.createNode) agentHandlers.createNode(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_UPDATE_NODE, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.updateNode) agentHandlers.updateNode(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_DELETE_NODE, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.deleteNode) agentHandlers.deleteNode(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_CREATE_EDGE, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.createEdge) agentHandlers.createEdge(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_DELETE_EDGE, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.deleteEdge) agentHandlers.deleteEdge(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_SET_VIEWPORT, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.setViewport) agentHandlers.setViewport(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_SET_FOCUSED, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.setFocused) agentHandlers.setFocused(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_ADD_QUEUE_COMMAND, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.addQueueCommand) agentHandlers.addQueueCommand(requestId, payload)
})

ipcRenderer.on(IPC_CHANNELS.AGENT_REMOVE_QUEUE_COMMAND, (_, requestId: string, payload: unknown) => {
  if (agentHandlers.removeQueueCommand) agentHandlers.removeQueueCommand(requestId, payload)
})

// Agent handler callback type
type AgentHandler = (requestId: string, payload: unknown) => void

export interface ElectronAPI {
  // PTY methods
  createPty: (nodeId: string, command: string, cwd: string, cols: number, rows: number) => Promise<string>
  writePty: (nodeId: string, data: string) => void
  resizePty: (nodeId: string, cols: number, rows: number) => void
  killPty: (nodeId: string) => void
  getPtyCwd: (nodeId: string) => Promise<string | null>
  onPtyData: (nodeId: string, callback: (data: string) => void) => () => void
  onPtyExit: (nodeId: string, callback: (exitCode: number) => void) => () => void

  // Folder methods
  selectFolder: () => Promise<string | null>
  listFolder: (folderPath: string) => Promise<FileInfo[]>
  watchFolder: (nodeId: string, folderPath: string) => Promise<void>
  unwatchFolder: (nodeId: string) => void
  copyFile: (sourcePath: string, targetFolderPath: string) => Promise<string>
  readImageAsBase64: (imagePath: string) => Promise<string>
  readTextFile: (filePath: string) => Promise<string>
  onFileAdded: (nodeId: string, callback: (file: FileInfo) => void) => () => void

  // Canvas save/load methods
  saveCanvas: (filename: string, data: CanvasData) => Promise<void>
  loadCanvas: (filename: string) => Promise<CanvasData | null>
  listCanvases: () => Promise<SaveFileMetadata[]>
  deleteCanvas: (filename: string) => Promise<void>

  // Agent API methods
  agentResponse: (requestId: string, success: boolean, data?: unknown, error?: { code: string; message: string }) => void
  onAgentGetState: (handler: AgentHandler) => () => void
  onAgentCreateNode: (handler: AgentHandler) => () => void
  onAgentUpdateNode: (handler: AgentHandler) => () => void
  onAgentDeleteNode: (handler: AgentHandler) => () => void
  onAgentCreateEdge: (handler: AgentHandler) => () => void
  onAgentDeleteEdge: (handler: AgentHandler) => () => void
  onAgentSetViewport: (handler: AgentHandler) => () => void
  onAgentSetFocused: (handler: AgentHandler) => () => void
  onAgentAddQueueCommand: (handler: AgentHandler) => () => void
  onAgentRemoveQueueCommand: (handler: AgentHandler) => () => void
}

const electronAPI: ElectronAPI = {
  createPty: (nodeId, command, cwd, cols, rows) => {
    return ipcRenderer.invoke(IPC_CHANNELS.PTY_CREATE, nodeId, command, cwd, cols, rows)
  },
  writePty: (nodeId, data) => {
    ipcRenderer.send(IPC_CHANNELS.PTY_WRITE, nodeId, data)
  },
  resizePty: (nodeId, cols, rows) => {
    ipcRenderer.send(IPC_CHANNELS.PTY_RESIZE, nodeId, cols, rows)
  },
  killPty: (nodeId) => {
    ipcRenderer.send(IPC_CHANNELS.PTY_KILL, nodeId)
  },
  getPtyCwd: (nodeId) => {
    return ipcRenderer.invoke(IPC_CHANNELS.PTY_GET_CWD, nodeId)
  },
  onPtyData: (nodeId, callback) => {
    dataCallbacks.set(nodeId, callback)
    return () => dataCallbacks.delete(nodeId)
  },
  onPtyExit: (nodeId, callback) => {
    exitCallbacks.set(nodeId, callback)
    return () => exitCallbacks.delete(nodeId)
  },

  // Folder methods
  selectFolder: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.FOLDER_SELECT)
  },
  listFolder: (folderPath) => {
    return ipcRenderer.invoke(IPC_CHANNELS.FOLDER_LIST, folderPath)
  },
  watchFolder: (nodeId, folderPath) => {
    return ipcRenderer.invoke(IPC_CHANNELS.FOLDER_WATCH, nodeId, folderPath)
  },
  unwatchFolder: (nodeId) => {
    ipcRenderer.send(IPC_CHANNELS.FOLDER_UNWATCH, nodeId)
  },
  copyFile: (sourcePath, targetFolderPath) => {
    return ipcRenderer.invoke(IPC_CHANNELS.FOLDER_COPY, sourcePath, targetFolderPath)
  },
  readImageAsBase64: (imagePath) => {
    return ipcRenderer.invoke(IPC_CHANNELS.FOLDER_READ_IMAGE, imagePath)
  },
  readTextFile: (filePath) => {
    return ipcRenderer.invoke(IPC_CHANNELS.FOLDER_READ_TEXT, filePath)
  },
  onFileAdded: (nodeId, callback) => {
    console.log('[Preload] Registering file added callback for nodeId:', nodeId)
    fileAddedCallbacks.set(nodeId, callback)
    return () => {
      console.log('[Preload] Unregistering file added callback for nodeId:', nodeId)
      fileAddedCallbacks.delete(nodeId)
    }
  },

  // Canvas save/load methods
  saveCanvas: (filename, data) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CANVAS_SAVE, filename, data)
  },
  loadCanvas: (filename) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CANVAS_LOAD, filename)
  },
  listCanvases: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.CANVAS_LIST)
  },
  deleteCanvas: (filename) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CANVAS_DELETE, filename)
  },

  // Agent API methods
  agentResponse: (requestId, success, data, error) => {
    ipcRenderer.send(IPC_CHANNELS.AGENT_RESPONSE, { requestId, success, data, error })
  },
  onAgentGetState: (handler) => {
    agentHandlers.getState = handler
    return () => { agentHandlers.getState = null }
  },
  onAgentCreateNode: (handler) => {
    agentHandlers.createNode = handler
    return () => { agentHandlers.createNode = null }
  },
  onAgentUpdateNode: (handler) => {
    agentHandlers.updateNode = handler
    return () => { agentHandlers.updateNode = null }
  },
  onAgentDeleteNode: (handler) => {
    agentHandlers.deleteNode = handler
    return () => { agentHandlers.deleteNode = null }
  },
  onAgentCreateEdge: (handler) => {
    agentHandlers.createEdge = handler
    return () => { agentHandlers.createEdge = null }
  },
  onAgentDeleteEdge: (handler) => {
    agentHandlers.deleteEdge = handler
    return () => { agentHandlers.deleteEdge = null }
  },
  onAgentSetViewport: (handler) => {
    agentHandlers.setViewport = handler
    return () => { agentHandlers.setViewport = null }
  },
  onAgentSetFocused: (handler) => {
    agentHandlers.setFocused = handler
    return () => { agentHandlers.setFocused = null }
  },
  onAgentAddQueueCommand: (handler) => {
    agentHandlers.addQueueCommand = handler
    return () => { agentHandlers.addQueueCommand = null }
  },
  onAgentRemoveQueueCommand: (handler) => {
    agentHandlers.removeQueueCommand = handler
    return () => { agentHandlers.removeQueueCommand = null }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
