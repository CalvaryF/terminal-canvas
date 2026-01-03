import { useEffect, useState, useCallback, memo, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCanvasContext } from './Canvas'
import type { FolderNodeData, FileInfo } from '../types'

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
  const { onRemoveNode, mode, onFilePreview, onFolderFileAdded } = useCanvasContext()
  const isHandMode = mode === 'hand'
  const [files, setFiles] = useState<FileInfo[]>(data.files || [])

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

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRemoveNode(id)
  }

  return (
    <div className="folder-node">
      <div className="folder-header dragHandle">
        <span className="folder-title">📂 {folderName}</span>
        <button className="folder-close" onClick={handleClose} />
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
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="folder-handle folder-handle-target"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="folder-handle folder-handle-source"
      />
    </div>
  )
})

export default FolderNodeComponent
