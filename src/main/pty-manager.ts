import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

// OSC 10 = foreground color query, OSC 11 = background color query
// Query formats: \x1b]11;?\x07 (BEL) or \x1b]11;?\x1b\\ (ST)
const OSC_10_QUERY = /\x1b\]10;?\?(\x07|\x1b\\)/g
const OSC_11_QUERY = /\x1b\]11;?\?(\x07|\x1b\\)/g

// Response colors matching the xterm.js theme (Mountaineer Light)
// Format: rgb:RRRR/GGGG/BBBB (16-bit per channel)
const FOREGROUND_COLOR = 'rgb:2c2c/2c2c/2c2c'  // #2c2c2c
const BACKGROUND_COLOR = 'rgb:f0f0/f0f0/f0f0'  // #f0f0f0

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
      env: {
        ...process.env,
        // Indicate light terminal: dark foreground (0) on light background (15)
        COLORFGBG: '0;15'
      } as { [key: string]: string }
    })

    ptyProcess.onData((data) => {
      // Respond to OSC color queries (for light theme detection)
      if (data.includes('\x1b]10;?') || data.includes('\x1b]11;?')) {
        if (OSC_10_QUERY.test(data)) {
          ptyProcess.write(`\x1b]10;${FOREGROUND_COLOR}\x1b\\`)
        }
        if (OSC_11_QUERY.test(data)) {
          ptyProcess.write(`\x1b]11;${BACKGROUND_COLOR}\x1b\\`)
        }
        // Reset regex lastIndex after test()
        OSC_10_QUERY.lastIndex = 0
        OSC_11_QUERY.lastIndex = 0
      }

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
