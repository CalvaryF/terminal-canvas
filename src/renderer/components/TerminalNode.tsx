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
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#e94560',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#d29922',
        blue: '#79c0ff',
        magenta: '#d2a8ff',
        cyan: '#a5d6ff',
        white: '#c9d1d9',
        brightBlack: '#484f58',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#a5d6ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#b3f0ff',
        brightWhite: '#f0f6fc'
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
    setFocusedNodeId(id)
    // Directly focus the terminal
    if (xtermRef.current) {
      xtermRef.current.focus()
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
