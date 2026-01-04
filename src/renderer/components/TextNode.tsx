import { useState, useRef, useEffect, memo } from 'react'
import { Handle, Position, NodeResizer, type NodeProps, type ResizeParams } from '@xyflow/react'
import { useCanvasContext } from './Canvas'

export interface TextNodeData {
  text: string
  width?: number
  height?: number
}

type TextNodeComponentProps = NodeProps<TextNodeData>

const TextNodeComponent = memo(function TextNodeComponent({
  id,
  data,
  selected
}: TextNodeComponentProps) {
  const { onTextChange, onNodeResize, mode } = useCanvasContext()
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(data.text || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync local state with data.text when it changes externally
  useEffect(() => {
    if (!isEditing && data.text !== undefined) {
      setText(data.text || '')
    }
  }, [data.text, isEditing])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleClick = (e: React.MouseEvent) => {
    // Only enter edit mode if clicking on actual text or placeholder
    const target = e.target as HTMLElement
    if (target.classList.contains('text-node-text') || target.classList.contains('text-node-placeholder')) {
      setIsEditing(true)
    }
  }

  const handleBlur = () => {
    setIsEditing(false)
    if (onTextChange) {
      onTextChange(id, text)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false)
      if (onTextChange) {
        onTextChange(id, text)
      }
    }
    // Prevent node from being deleted when pressing backspace
    e.stopPropagation()
  }

  const handleResize = (_event: unknown, params: ResizeParams) => {
    if (onNodeResize) {
      onNodeResize(id, params.width, params.height)
    }
  }

  const nodeStyle: React.CSSProperties = {
    width: data.width || 200,
    height: data.height || 80
  }

  return (
    <>
      <NodeResizer
        minWidth={100}
        minHeight={40}
        isVisible={selected && mode === 'select'}
        lineClassName="text-node-resize-line"
        handleClassName="text-node-resize-handle"
        onResize={handleResize}
      />
      <div className="text-node" style={nodeStyle} onClick={handleClick}>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="text-node-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <div className="text-node-content">
            {text ? (
              <span className="text-node-text">{text}</span>
            ) : selected ? (
              <span className="text-node-placeholder">Click to edit</span>
            ) : null}
          </div>
        )}
        <Handle type="target" position={Position.Left} className="text-node-handle" />
        <Handle type="source" position={Position.Right} className="text-node-handle" />
      </div>
    </>
  )
})

export default TextNodeComponent
