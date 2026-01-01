import { useEffect, useRef, memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useCanvasContext } from './Canvas'
import type { TerminalNodeData } from '../types'

type TerminalNodeComponentProps = NodeProps<TerminalNodeData>

const TerminalNodeComponent = memo(function TerminalNodeComponent({
  id,
  data
}: TerminalNodeComponentProps) {
  const { focusedNodeId, setFocusedNodeId, onRemoveNode } = useCanvasContext()
  const isFocused = focusedNodeId === id

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const initializedRef = useRef(false)
  const zoomModeRef = useRef(false)

  // Track z key to prevent focusing terminal during zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyZ') zoomModeRef.current = true
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyZ') zoomModeRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    if (!terminalRef.current || initializedRef.current) return
    initializedRef.current = true

    const term = new Terminal({
      cols: data.cols,
      rows: data.rows,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#ffffff',
        foreground: '#171717',
        cursor: '#171717',
        cursorAccent: '#ffffff',
        selectionBackground: '#d4d4d4',
        black: '#171717',
        red: '#dc2626',
        green: '#16a34a',
        yellow: '#ca8a04',
        blue: '#2563eb',
        magenta: '#9333ea',
        cyan: '#0891b2',
        white: '#f5f5f5',
        brightBlack: '#737373',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#eab308',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#ffffff'
      }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)

    xtermRef.current = term

    // PTY output -> xterm
    const removeDataListener = window.electronAPI.onPtyData(id, (output) => {
      term.write(output)
    })

    // PTY exit handler
    const removeExitListener = window.electronAPI.onPtyExit(id, () => {
      term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
    })

    // xterm input -> PTY
    const dataDisposable = term.onData((input) => {
      window.electronAPI.writePty(id, input)
    })

    // Create PTY
    window.electronAPI.createPty(id, data.command, data.cwd, data.cols, data.rows)

    return () => {
      dataDisposable.dispose()
      removeDataListener()
      removeExitListener()
      term.dispose()
      window.electronAPI.killPty(id)
    }
  }, [id, data.command, data.cwd, data.cols, data.rows])

  // Focus terminal when node is focused
  useEffect(() => {
    if (isFocused && xtermRef.current) {
      xtermRef.current.focus()
    }
  }, [isFocused])

  const handleTerminalClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Don't focus terminal when in zoom mode (z key held)
    if (zoomModeRef.current) return

    setFocusedNodeId(id)
    // Directly focus the terminal
    if (xtermRef.current) {
      xtermRef.current.focus()
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer.files
    if (files.length > 0) {
      // Get paths from all dropped files/folders and join with spaces
      const paths = Array.from(files)
        .map(file => {
          // Escape spaces and special characters in path
          const path = (file as any).path as string
          if (path.includes(' ') || path.includes('(') || path.includes(')')) {
            return `"${path}"`
          }
          return path
        })
        .join(' ')

      // Write the path(s) to the terminal
      window.electronAPI.writePty(id, paths)
    }
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRemoveNode(id)
  }

  return (
    <div
      className={`terminal-node ${isFocused ? 'focused' : ''}`}
    >
      <div className="terminal-header dragHandle">
        <span className="terminal-title">{data.title}</span>
        <button className="terminal-close" onClick={handleClose} />
      </div>
      <div
        className="terminal-body nodrag nowheel"
        ref={terminalRef}
        onClick={handleTerminalClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          width: data.cols * 8 + 16,
          height: data.rows * 17 + 16
        }}
      />
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
    </div>
  )
})

export default TerminalNodeComponent
