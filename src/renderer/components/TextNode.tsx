import { useState, useRef, useEffect, memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export interface TextNodeData {
  text: string
  onChange?: (text: string) => void
}

type TextNodeComponentProps = NodeProps<TextNodeData>

const TextNodeComponent = memo(function TextNodeComponent({
  id,
  data
}: TextNodeComponentProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(data.text || 'Double-click to edit')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    if (data.onChange) {
      data.onChange(text)
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
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
    </div>
  )
})

export default TextNodeComponent
