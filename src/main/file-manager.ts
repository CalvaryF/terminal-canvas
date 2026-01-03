import * as chokidar from 'chokidar'
import * as fs from 'fs'
import * as path from 'path'
import { BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.py', '.rb', '.go', '.rs', '.swift', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.sql', '.graphql', '.env', '.gitignore', '.dockerignore', '.editorconfig']

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

interface WatcherInstance {
  watcher: chokidar.FSWatcher
  nodeId: string
  folderPath: string
}

export class FileManager {
  private watchers: Map<string, WatcherInstance> = new Map()
  private window: BrowserWindow | null = null

  setWindow(window: BrowserWindow) {
    this.window = window
  }

  async selectFolder(): Promise<string | null> {
    if (!this.window) return null
    const result = await dialog.showOpenDialog(this.window, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  }

  async listFolder(folderPath: string): Promise<FileInfo[]> {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
    const files: FileInfo[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue

      const fullPath = path.join(folderPath, entry.name)
      try {
        const stats = await fs.promises.stat(fullPath)
        const ext = path.extname(entry.name).toLowerCase()

        files.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          isImage: IMAGE_EXTENSIONS.includes(ext),
          isText: TEXT_EXTENSIONS.includes(ext),
          extension: ext.slice(1),
          size: stats.size,
          modifiedTime: stats.mtimeMs
        })
      } catch {
        // Skip files we can't stat
      }
    }

    return files.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  watchFolder(nodeId: string, folderPath: string): void {
    this.unwatchFolder(nodeId)

    console.log('[FileManager] Starting watcher for:', folderPath, 'nodeId:', nodeId)

    const watcher = chokidar.watch(folderPath, {
      ignoreInitial: true,
      depth: 0,
      ignored: /(^|[/\\])\./,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })

    watcher.on('ready', () => {
      console.log('[FileManager] Watcher ready for:', folderPath)
    })

    watcher.on('add', async (filePath) => {
      console.log('[FileManager] File added detected:', filePath)
      try {
        const stats = await fs.promises.stat(filePath)
        const ext = path.extname(filePath).toLowerCase()

        const fileInfo: FileInfo = {
          name: path.basename(filePath),
          path: filePath,
          isDirectory: false,
          isImage: IMAGE_EXTENSIONS.includes(ext),
          isText: TEXT_EXTENSIONS.includes(ext),
          extension: ext.slice(1),
          size: stats.size,
          modifiedTime: stats.mtimeMs
        }

        if (this.window && !this.window.isDestroyed()) {
          console.log('[FileManager] Sending file added event to renderer:', fileInfo.name)
          this.window.webContents.send(IPC_CHANNELS.FOLDER_FILE_ADDED, nodeId, fileInfo)
        }
      } catch (err) {
        console.error('[FileManager] Error stat-ing file:', err)
      }
    })

    watcher.on('error', (err) => {
      console.error('[FileManager] Watcher error:', err)
    })

    this.watchers.set(nodeId, { watcher, nodeId, folderPath })
  }

  unwatchFolder(nodeId: string): void {
    const instance = this.watchers.get(nodeId)
    if (instance) {
      instance.watcher.close()
      this.watchers.delete(nodeId)
    }
  }

  async copyFile(sourcePath: string, targetFolderPath: string): Promise<string> {
    const fileName = path.basename(sourcePath)
    let finalPath = path.join(targetFolderPath, fileName)

    // Handle name collision
    let counter = 1
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(fileName)
      const base = path.basename(fileName, ext)
      finalPath = path.join(targetFolderPath, `${base} (${counter})${ext}`)
      counter++
    }

    await fs.promises.copyFile(sourcePath, finalPath)
    return finalPath
  }

  async readImageAsBase64(imagePath: string): Promise<string> {
    const buffer = await fs.promises.readFile(imagePath)
    const ext = path.extname(imagePath).toLowerCase().slice(1)
    const mimeType = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mimeType};base64,${buffer.toString('base64')}`
  }

  async readTextFile(filePath: string): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return content
  }

  unwatchAll(): void {
    for (const [nodeId] of this.watchers) {
      this.unwatchFolder(nodeId)
    }
  }
}

export const fileManager = new FileManager()
