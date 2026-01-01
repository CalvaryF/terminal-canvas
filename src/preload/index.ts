import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

// Store callbacks by nodeId
const dataCallbacks = new Map<string, (data: string) => void>()
const exitCallbacks = new Map<string, (exitCode: number) => void>()

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

export interface ElectronAPI {
  createPty: (nodeId: string, command: string, cwd: string, cols: number, rows: number) => Promise<string>
  writePty: (nodeId: string, data: string) => void
  resizePty: (nodeId: string, cols: number, rows: number) => void
  killPty: (nodeId: string) => void
  onPtyData: (nodeId: string, callback: (data: string) => void) => () => void
  onPtyExit: (nodeId: string, callback: (exitCode: number) => void) => () => void
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
  onPtyData: (nodeId, callback) => {
    dataCallbacks.set(nodeId, callback)
    return () => dataCallbacks.delete(nodeId)
  },
  onPtyExit: (nodeId, callback) => {
    exitCallbacks.set(nodeId, callback)
    return () => exitCallbacks.delete(nodeId)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
