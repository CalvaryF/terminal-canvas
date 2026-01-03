import { useState, useRef, useEffect, memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasContext } from './Canvas'

export interface TextNodeData {
  text: string
}

type TextNodeComponentProps = NodeProps<TextNodeData>

const TextNodeComponent = memo(function TextNodeComponent({
  id,
  data
}: TextNodeComponentProps) {
  const { onTextChange } = useCanvasContext()
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(data.text || 'Double-click to edit')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync local state with data.text when it changes externally
  useEffect(() => {
    if (!isEditing && data.text !== undefined) {
      setText(data.text || 'Double-click to edit')
    }
  }, [data.text, isEditing])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = () => {
    setIsEditing(true)
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
    }
    // Prevent node from being deleted when pressing backspace
    e.stopPropagation()
  }

  return (
    <div className="text-node" onDoubleClick={handleDoubleClick}>
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
          {text}
        </div>
      )}
      <Handle type="target" position={Position.Left} className="text-node-handle" />
      <Handle type="source" position={Position.Right} className="text-node-handle" />
    </div>
  )
})

export default TextNodeComponent
