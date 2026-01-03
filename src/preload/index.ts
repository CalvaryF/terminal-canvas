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

export interface ElectronAPI {
  // PTY methods
  createPty: (nodeId: string, command: string, cwd: string, cols: number, rows: number) => Promise<string>
  writePty: (nodeId: string, data: string) => void
  resizePty: (nodeId: string, cols: number, rows: number) => void
  killPty: (nodeId: string) => void
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
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
