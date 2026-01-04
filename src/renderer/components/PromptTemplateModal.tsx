import { useState, useEffect, useRef } from 'react'

interface PromptTemplateModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (template: string) => void
}

export function PromptTemplateModal({ isOpen, onClose, onSubmit }: PromptTemplateModalProps) {
  const [template, setTemplate] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isOpen])

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTemplate('')
    }
  }, [isOpen])

  const handleSubmit = () => {
    if (template.trim()) {
      onSubmit(template.trim())
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
    // Cmd/Ctrl+Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit()
    }
  }

  if (!isOpen) return null

  return (
    <div className="prompt-template-overlay" onClick={onClose}>
      <div className="prompt-template-modal" onClick={e => e.stopPropagation()}>
        <div className="prompt-template-header">
          <h3>Folder → Terminal Automation</h3>
          <p className="prompt-template-hint">
            Use <code>{'{filepath}'}</code> as placeholder for the new file path
          </p>
        </div>
        <textarea
          ref={textareaRef}
          className="prompt-template-textarea"
          value={template}
          onChange={e => setTemplate(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Read {filepath} and add creative rhymes to each stanza. Save the result to ./output/"
          rows={6}
        />
        <div className="prompt-template-footer">
          <button className="prompt-template-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="prompt-template-submit"
            onClick={handleSubmit}
            disabled={!template.trim()}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
