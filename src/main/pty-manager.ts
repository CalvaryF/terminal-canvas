import * as pty from 'node-pty'
import { exec } from 'child_process'
import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { agentWsManager } from './agent-ws'

// OSC 10 = foreground color query, OSC 11 = background color query
// Query formats: \x1b]11;?\x07 (BEL) or \x1b]11;?\x1b\\ (ST)
const OSC_10_QUERY = /\x1b\]10;?\?(\x07|\x1b\\)/g
const OSC_11_QUERY = /\x1b\]11;?\?(\x07|\x1b\\)/g

// Response colors matching the xterm.js theme (Mountaineer Light)
// Format: rgb:RRRR/GGGG/BBBB (16-bit per channel)
const FOREGROUND_COLOR = 'rgb:2c2c/2c2c/2c2c'  // #2c2c2c
const BACKGROUND_COLOR = 'rgb:f0f0/f0f0/f0f0'  // #f0f0f0

// Output buffer configuration
const MAX_BUFFER_LINES = 1000

interface PtyInstance {
  pty: pty.IPty
  nodeId: string
}

export class PtyManager {
  private ptys: Map<string, PtyInstance> = new Map()
  private window: BrowserWindow | null = null
  private outputBuffers: Map<string, string[]> = new Map()

  setWindow(window: BrowserWindow) {
    this.window = window
  }

  private appendToBuffer(nodeId: string, data: string) {
    let buffer = this.outputBuffers.get(nodeId)
    if (!buffer) {
      buffer = []
      this.outputBuffers.set(nodeId, buffer)
    }

    // Split data into lines and append
    const lines = data.split('\n')
    for (const line of lines) {
      if (line) {
        buffer.push(line)
      }
    }

    // Trim buffer if over limit
    while (buffer.length > MAX_BUFFER_LINES) {
      buffer.shift()
    }
  }

  getOutput(nodeId: string, lineCount?: number): string[] {
    const buffer = this.outputBuffers.get(nodeId) || []
    if (lineCount && lineCount > 0) {
      return buffer.slice(-lineCount)
    }
    return [...buffer]
  }

  clearOutput(nodeId: string) {
    this.outputBuffers.delete(nodeId)
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

      // Buffer output for agent API
      this.appendToBuffer(nodeId, data)

      // Notify WebSocket subscribers
      agentWsManager.notifyTerminalOutput(nodeId, data)

      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send(IPC_CHANNELS.PTY_DATA, nodeId, data)
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      // Notify WebSocket subscribers
      agentWsManager.notifyTerminalExit(nodeId, exitCode)

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
      this.outputBuffers.delete(nodeId)
    }
  }

  async getCwd(nodeId: string): Promise<string | null> {
    const instance = this.ptys.get(nodeId)
    if (!instance) return null

    const pid = instance.pty.pid

    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        // macOS: Use lsof to get cwd
        exec(`lsof -a -p ${pid} -d cwd -Fn`, (err, stdout) => {
          if (err) {
            resolve(null)
            return
          }
          // Parse lsof output: lines starting with 'n' have the path
          const lines = stdout.split('\n')
          const cwdLine = lines.find(l => l.startsWith('n'))
          resolve(cwdLine ? cwdLine.slice(1) : null)
        })
      } else if (process.platform === 'linux') {
        // Linux: Read /proc/PID/cwd symlink
        exec(`readlink /proc/${pid}/cwd`, (err, stdout) => {
          resolve(err ? null : stdout.trim())
        })
      } else {
        // Windows or unsupported platform
        resolve(null)
      }
    })
  }

  killAll() {
    for (const [nodeId] of this.ptys) {
      this.kill(nodeId)
    }
  }
}

export const ptyManager = new PtyManager()
