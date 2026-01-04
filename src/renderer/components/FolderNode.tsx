import { useEffect, useState, useCallback, memo, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasContext } from './Canvas'
import type { FolderNodeData, FileInfo } from '../types'

interface PromptTemplateProps {
  template: string | undefined
  onChange: (template: string) => void
  isHandMode: boolean
}

function PromptTemplateSection({ template, onChange, isHandMode }: PromptTemplateProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(template || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    onChange(editValue)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(template || '')
      setIsEditing(false)
    }
  }

  if (!template && !isEditing) {
    return (
      <div
        className={`folder-prompt-empty ${isHandMode ? '' : 'nodrag nowheel nopan'}`}
        onClick={(e) => {
          e.stopPropagation()
          if (!isHandMode) {
            setEditValue('')
            setIsEditing(true)
          }
        }}
      >
        <span className="folder-prompt-placeholder">+ Add prompt template</span>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className={`folder-prompt-edit ${isHandMode ? '' : 'nodrag nowheel nopan'}`}>
        <textarea
          ref={textareaRef}
          className="folder-prompt-textarea"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter prompt template... Use {filepath} for the file path"
        />
        <div className="folder-prompt-actions">
          <button
            className="folder-prompt-btn"
            onClick={(e) => {
              e.stopPropagation()
              setEditValue(template || '')
              setIsEditing(false)
            }}
          >
            Cancel
          </button>
          <button
            className="folder-prompt-btn folder-prompt-btn-save"
            onClick={(e) => {
              e.stopPropagation()
              handleSave()
            }}
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`folder-prompt-display ${isHandMode ? '' : 'nodrag nowheel nopan'}`}
      onClick={(e) => {
        e.stopPropagation()
        if (!isHandMode) {
          setEditValue(template)
          setIsEditing(true)
        }
      }}
      title="Click to edit prompt template"
    >
      <div className="folder-prompt-label">Prompt Template:</div>
      <div className="folder-prompt-text">{template}</div>
    </div>
  )
}

const getFileIcon = (file: FileInfo): string => {
  if (file.isDirectory) return '📁'
  if (file.isImage) return '🖼️'
  const iconMap: Record<string, string> = {
    pdf: '📄',
    doc: '📝', docx: '📝',
    xls: '📊', xlsx: '📊',
    txt: '📃',
    js: '📜', ts: '📜', tsx: '📜', jsx: '📜',
    json: '📋',
    md: '📖',
    html: '🌐', css: '🎨',
    py: '🐍',
    rb: '💎',
    go: '🔷',
    rs: '🦀',
    swift: '🍎',
    sh: '⚡', bash: '⚡', zsh: '⚡'
  }
  return iconMap[file.extension] || '📄'
}

type FolderNodeComponentProps = NodeProps<FolderNodeData>

const FolderNodeComponent = memo(function FolderNodeComponent({
  id,
  data
}: FolderNodeComponentProps) {
  const { mode, onFilePreview, onFolderFileAdded, onFolderPromptChange } = useCanvasContext()
  const isHandMode = mode === 'hand'
  const [files, setFiles] = useState<FileInfo[]>(data.files || [])

  const handlePromptChange = useCallback((template: string) => {
    if (onFolderPromptChange) {
      onFolderPromptChange(id, template)
    }
  }, [id, onFolderPromptChange])

  // Use ref for callback to avoid recreating watcher when callback changes
  const onFolderFileAddedRef = useRef(onFolderFileAdded)
  useEffect(() => {
    onFolderFileAddedRef.current = onFolderFileAdded
  }, [onFolderFileAdded])

  useEffect(() => {
    if (!data.folderPath) return

    console.log('[FolderNode] Setting up watcher for:', data.folderPath)
    window.electronAPI.watchFolder(id, data.folderPath)

    const unsubscribe = window.electronAPI.onFileAdded(id, (newFile) => {
      console.log('[FolderNode] File added:', newFile.name)
      setFiles(prev => {
        const updated = [...prev, newFile]
        return updated.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      })
      // Notify App of new file for pipeline processing
      if (onFolderFileAddedRef.current) {
        onFolderFileAddedRef.current(id, newFile.path)
      }
    })

    return () => {
      console.log('[FolderNode] Cleaning up watcher for:', data.folderPath)
      window.electronAPI.unwatchFolder(id)
      unsubscribe()
    }
  }, [id, data.folderPath])

  useEffect(() => {
    if (data.folderPath && files.length === 0) {
      window.electronAPI.listFolder(data.folderPath).then(setFiles)
    }
  }, [data.folderPath, files.length])

  const folderName = data.folderPath?.split('/').pop() || 'Folder'

  const handleFileClick = useCallback((file: FileInfo) => {
    if ((file.isImage || file.isText) && onFilePreview) {
      onFilePreview({
        file,
        files,
        folderName
      })
    }
  }, [onFilePreview, files, folderName])

  return (
    <div className="folder-node">
      <div className="folder-header dragHandle">
        <span className="folder-title">📂 {folderName}</span>
      </div>
      <div className={`folder-body ${isHandMode ? '' : 'nodrag nowheel nopan'}`}>
        {files.length === 0 ? (
          <div className="folder-empty">No files</div>
        ) : (
          <ul className="file-list">
            {files.map(file => (
              <li
                key={file.path}
                className={`file-item ${file.isImage || file.isText ? 'clickable' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleFileClick(file)
                }}
              >
                <span className="file-icon">{getFileIcon(file)}</span>
                <span className="file-name">{file.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PromptTemplateSection
        template={data.promptTemplate}
        onChange={handlePromptChange}
        isHandMode={isHandMode}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="node-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="node-handle"
      />
    </div>
  )
})

export default FolderNodeComponent
