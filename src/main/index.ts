import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { ptyManager } from './pty-manager'
import { IPC_CHANNELS } from '../shared/ipc-channels'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  ptyManager.setWindow(mainWindow)

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

app.whenReady().then(() => {
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
})
