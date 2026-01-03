import { useState, useCallback, memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasContext } from './Canvas'
import type { CommandQueueNodeData, CommandItem } from '../types'

type CommandQueueNodeComponentProps = NodeProps<CommandQueueNodeData>

const CommandQueueNodeComponent = memo(function CommandQueueNodeComponent({
  id,
  data
}: CommandQueueNodeComponentProps) {
  const { mode, onSendCommand } = useCanvasContext()
  const isHandMode = mode === 'hand'
  const [newCommand, setNewCommand] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const commands = data.commands || []

  const handleAddCommand = useCallback(() => {
    if (!newCommand.trim()) return

    // Create new command item
    const command: CommandItem = {
      id: crypto.randomUUID(),
      command: newCommand.trim(),
      status: 'pending',
      addedAt: Date.now()
    }

    // Notify parent to add command to node data
    if (onSendCommand) {
      onSendCommand(id, 'add', command)
    }

    setNewCommand('')
    setIsAdding(false)
  }, [id, newCommand, onSendCommand])

  const handleSendCommand = useCallback((commandId: string) => {
    if (onSendCommand) {
      onSendCommand(id, 'send', commandId)
    }
  }, [id, onSendCommand])

  const handleRemoveCommand = useCallback((commandId: string) => {
    if (onSendCommand) {
      onSendCommand(id, 'remove', commandId)
    }
  }, [id, onSendCommand])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddCommand()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewCommand('')
    }
  }

  const getStatusIcon = (status: CommandItem['status']) => {
    switch (status) {
      case 'pending': return '○'
      case 'sent': return '◐'
      case 'done': return '✓'
      case 'error': return '✗'
    }
  }

  const getStatusClass = (status: CommandItem['status']) => {
    return `command-status command-status-${status}`
  }

  return (
    <div className="command-queue-node">
      <div className="command-queue-header dragHandle">
        <span className="command-queue-title">Command Queue</span>
        <button
          className="command-queue-add-btn"
          onClick={(e) => {
            e.stopPropagation()
            setIsAdding(true)
          }}
          title="Add command"
        >
          +
        </button>
      </div>

      <div className={`command-queue-body ${isHandMode ? '' : 'nodrag nowheel nopan'}`}>
        {isAdding && (
          <div className="command-input-row">
            <input
              type="text"
              className="command-input"
              placeholder="Enter command..."
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button
              className="command-input-submit"
              onClick={handleAddCommand}
              disabled={!newCommand.trim()}
            >
              ↵
            </button>
          </div>
        )}

        {commands.length === 0 && !isAdding ? (
          <div className="command-queue-empty">No commands queued</div>
        ) : (
          <ul className="command-list">
            {commands.map(cmd => (
              <li key={cmd.id} className={`command-item ${getStatusClass(cmd.status)}`}>
                <span className="command-status-icon">{getStatusIcon(cmd.status)}</span>
                <span className="command-text">{cmd.command}</span>
                <div className="command-actions">
                  {cmd.status === 'pending' && (
                    <>
                      <button
                        className="command-send-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSendCommand(cmd.id)
                        }}
                        title="Send command"
                      >
                        ▶
                      </button>
                      <button
                        className="command-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveCommand(cmd.id)
                        }}
                        title="Remove command"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="node-handle"
      />
    </div>
  )
})

export default CommandQueueNodeComponent
