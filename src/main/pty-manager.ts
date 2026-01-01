import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

interface PtyInstance {
  pty: pty.IPty
  nodeId: string
}

export class PtyManager {
  private ptys: Map<string, PtyInstance> = new Map()
  private window: BrowserWindow | null = null

  setWindow(window: BrowserWindow) {
    this.window = window
  }

  create(nodeId: string, command: string, cwd: string, cols: number, rows: number): string {
    const shell = command || process.env.SHELL || 'bash'
    const workingDir = cwd || process.env.HOME || '/'

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: workingDir,
      env: process.env as { [key: string]: string }
    })

    ptyProcess.onData((data) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IPC_CHANNELS.PTY_DATA, nodeId, data)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IPC_CHANNELS.PTY_EXIT, nodeId, exitCode)
      }
      this.ptys.delete(nodeId)
    })

    this.ptys.set(nodeId, { pty: ptyProcess, nodeId })
    return nodeId
  }

  write(nodeId: string, data: string) {
    const instance = this.ptys.get(nodeId)
    if (instance) {
      instance.pty.write(data)
    }
  }

  resize(nodeId: string, cols: number, rows: number) {
    const instance = this.ptys.get(nodeId)
    if (instance) {
      instance.pty.resize(cols, rows)
    }
  }

  kill(nodeId: string) {
    const instance = this.ptys.get(nodeId)
    if (instance) {
      instance.pty.kill()
      this.ptys.delete(nodeId)
    }
  }

  killAll() {
    for (const [nodeId] of this.ptys) {
      this.kill(nodeId)
    }
  }
}

export const ptyManager = new PtyManager()
