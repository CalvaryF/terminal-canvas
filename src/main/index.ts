import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { ptyManager } from './pty-manager'
import { fileManager } from './file-manager'
import { IPC_CHANNELS } from '../shared/ipc-channels'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  ptyManager.setWindow(mainWindow)
  fileManager.setWindow(mainWindow)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC Handlers
ipcMain.handle(IPC_CHANNELS.PTY_CREATE, (_, nodeId: string, command: string, cwd: string, cols: number, rows: number) => {
  return ptyManager.create(nodeId, command, cwd, cols, rows)
})

ipcMain.on(IPC_CHANNELS.PTY_WRITE, (_, nodeId: string, data: string) => {
  ptyManager.write(nodeId, data)
})

ipcMain.on(IPC_CHANNELS.PTY_RESIZE, (_, nodeId: string, cols: number, rows: number) => {
  ptyManager.resize(nodeId, cols, rows)
})

ipcMain.on(IPC_CHANNELS.PTY_KILL, (_, nodeId: string) => {
  ptyManager.kill(nodeId)
})

// Folder IPC Handlers
ipcMain.handle(IPC_CHANNELS.FOLDER_SELECT, () => {
  return fileManager.selectFolder()
})

ipcMain.handle(IPC_CHANNELS.FOLDER_LIST, (_, folderPath: string) => {
  return fileManager.listFolder(folderPath)
})

ipcMain.handle(IPC_CHANNELS.FOLDER_WATCH, (_, nodeId: string, folderPath: string) => {
  fileManager.watchFolder(nodeId, folderPath)
})

ipcMain.on(IPC_CHANNELS.FOLDER_UNWATCH, (_, nodeId: string) => {
  fileManager.unwatchFolder(nodeId)
})

ipcMain.handle(IPC_CHANNELS.FOLDER_COPY, (_, sourcePath: string, targetPath: string) => {
  return fileManager.copyFile(sourcePath, targetPath)
})

ipcMain.handle(IPC_CHANNELS.FOLDER_READ_IMAGE, (_, imagePath: string) => {
  return fileManager.readImageAsBase64(imagePath)
})

ipcMain.handle(IPC_CHANNELS.FOLDER_READ_TEXT, (_, filePath: string) => {
  return fileManager.readTextFile(filePath)
})

// Register custom protocol for serving local files (avoids base64 encoding freeze)
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { bypassCSP: true, stream: true } }
])

app.whenReady().then(() => {
  // Handle local-file:// protocol to serve files directly
  protocol.handle('local-file', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-file://', ''))
    return net.fetch(pathToFileURL(filePath).toString())
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  ptyManager.killAll()
  fileManager.unwatchAll()
})
