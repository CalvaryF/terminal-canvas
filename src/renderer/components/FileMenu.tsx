import { useState, useRef, useEffect } from 'react'
import type { SaveFileMetadata } from '../../preload/index'

interface FileMenuProps {
  currentFile: string | null
  isDirty: boolean
  isSaving: boolean
  saveFiles: SaveFileMetadata[]
  onSave: () => void
  onSaveAs: (filename: string) => void
  onLoad: (filename: string) => void
  onNew: () => void
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

export function FileMenu({
  currentFile,
  isDirty,
  isSaving,
  saveFiles,
  onSave,
  onSaveAs,
  onLoad,
  onNew
}: FileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Focus input when save dialog opens
  useEffect(() => {
    if (showSaveDialog && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showSaveDialog])

  const handleSaveAs = () => {
    if (newFileName.trim()) {
      onSaveAs(newFileName.trim())
      setNewFileName('')
      setShowSaveDialog(false)
      setIsOpen(false)
    }
  }

  const handleLoad = (filename: string) => {
    onLoad(filename)
    setIsOpen(false)
  }

  const handleNew = () => {
    onNew()
    setIsOpen(false)
  }

  const displayName = currentFile || 'Untitled'

  return (
    <div className="file-menu" ref={menuRef}>
      <button
        className="file-menu-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="file-menu-name">{displayName}</span>
        {isDirty && <span className="file-menu-dirty">*</span>}
        {isSaving && <span className="file-menu-saving">Saving...</span>}
        <span className="file-menu-arrow">&#9662;</span>
      </button>

      {isOpen && (
        <div className="file-menu-dropdown">
          <button className="file-menu-item" onClick={handleNew}>
            New Canvas
          </button>

          <button
            className="file-menu-item"
            onClick={() => {
              onSave()
              setIsOpen(false)
            }}
            disabled={!currentFile}
          >
            Save
            <span className="file-menu-shortcut">&#8984;S</span>
          </button>

          <button
            className="file-menu-item"
            onClick={() => setShowSaveDialog(true)}
          >
            Save As...
            <span className="file-menu-shortcut">&#8679;&#8984;S</span>
          </button>

          {saveFiles.length > 0 && (
            <>
              <div className="file-menu-divider" />
              <div className="file-menu-section-label">Recent</div>
              <div className="file-menu-files">
                {saveFiles.map(file => (
                  <button
                    key={file.filename}
                    className={`file-menu-file-button ${file.filename === currentFile ? 'active' : ''}`}
                    onClick={() => handleLoad(file.filename)}
                  >
                    <span className="file-menu-file-name">{file.name}</span>
                    <span className="file-menu-file-meta">
                      {file.nodeCount} nodes &middot; {formatDate(file.savedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {showSaveDialog && (
        <div className="file-menu-dialog-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="file-menu-dialog" onClick={e => e.stopPropagation()}>
            <div className="file-menu-dialog-title">Save Canvas As</div>
            <input
              ref={inputRef}
              type="text"
              className="file-menu-dialog-input"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAs()
                if (e.key === 'Escape') setShowSaveDialog(false)
              }}
              placeholder="Canvas name"
            />
            <div className="file-menu-dialog-buttons">
              <button
                className="file-menu-dialog-button cancel"
                onClick={() => setShowSaveDialog(false)}
              >
                Cancel
              </button>
              <button
                className="file-menu-dialog-button save"
                onClick={handleSaveAs}
                disabled={!newFileName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
