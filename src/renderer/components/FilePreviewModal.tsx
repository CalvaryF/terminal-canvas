import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import hljs from 'highlight.js'
import type { FileInfo } from '../types'

export type PreviewContext = {
  file: FileInfo
  files: FileInfo[]
  folderName: string
} | null

interface FilePreviewModalProps {
  context: PreviewContext
  onClose: () => void
  onFileChange: (file: FileInfo) => void
}

// Map file extensions to highlight.js language names
const extensionToLanguage: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  graphql: 'graphql',
  md: 'markdown',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'dockerfile'
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

export function FilePreviewModal({ context, onClose, onFileChange }: FilePreviewModalProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const codeRef = useRef<HTMLElement>(null)
  const fileListRef = useRef<HTMLUListElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Get previewable files (images and text files only)
  const previewableFiles = useMemo(() =>
    context?.files.filter(f => f.isImage || f.isText) || [],
    [context?.files]
  )
  const currentIndex = previewableFiles.findIndex(f => f.path === context?.file.path)

  // Use refs to avoid stale closures in keyboard handler
  const previewableFilesRef = useRef(previewableFiles)
  const currentIndexRef = useRef(currentIndex)
  const onFileChangeRef = useRef(onFileChange)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    previewableFilesRef.current = previewableFiles
    currentIndexRef.current = currentIndex
    onFileChangeRef.current = onFileChange
    onCloseRef.current = onClose
  })

  const navigateToFile = useCallback((direction: 'prev' | 'next') => {
    const files = previewableFilesRef.current
    const idx = currentIndexRef.current
    if (files.length === 0 || idx === -1) return

    let newIndex: number
    if (direction === 'prev') {
      newIndex = idx <= 0 ? files.length - 1 : idx - 1
    } else {
      newIndex = idx >= files.length - 1 ? 0 : idx + 1
    }

    onFileChangeRef.current(files[newIndex])
  }, [])

  useEffect(() => {
    if (context?.file) {
      if (context.file.isImage) {
        // Use custom protocol URL - no loading needed, browser handles it
        setContent(`local-file://${encodeURIComponent(context.file.path)}`)
        setLoading(false)
      } else if (context.file.isText) {
        setLoading(true)
        window.electronAPI.readTextFile(context.file.path)
          .then(setContent)
          .finally(() => setLoading(false))
      }
    } else {
      setContent(null)
    }
  }, [context?.file])

  // Apply syntax highlighting after content loads
  useEffect(() => {
    if (content && context?.file.isText && codeRef.current) {
      const extension = context.file.extension
      const language = extensionToLanguage[extension]

      if (language && hljs.getLanguage(language)) {
        const highlighted = hljs.highlight(content, { language })
        codeRef.current.innerHTML = highlighted.value
      } else {
        const result = hljs.highlightAuto(content)
        codeRef.current.innerHTML = result.value
      }
    }
  }, [content, context?.file])

  // Scroll active file into view in sidebar
  useEffect(() => {
    if (fileListRef.current && currentIndex >= 0) {
      const activeItem = fileListRef.current.children[currentIndex] as HTMLElement
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [currentIndex])

  // Auto-focus overlay for keyboard events
  useEffect(() => {
    if (context && overlayRef.current) {
      overlayRef.current.focus()
    }
  }, [context, content])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateToFile('prev')
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        navigateToFile('next')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigateToFile])

  if (!context) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleFileClick = (file: FileInfo) => {
    if (file.isImage || file.isText) {
      onFileChange(file)
    }
  }

  const isTextFile = context.file.isText

  return (
    <div className="file-preview-overlay" ref={overlayRef} tabIndex={-1} onClick={handleBackdropClick}>
      <div className="file-preview-layout">
        {/* Folder sidebar */}
        <div className="file-preview-sidebar">
          <div className="file-preview-sidebar-header">
            <span>📂 {context.folderName}</span>
          </div>
          <ul className="file-preview-sidebar-list" ref={fileListRef}>
            {context.files.map(file => (
              <li
                key={file.path}
                className={`file-preview-sidebar-item ${file.path === context.file.path ? 'active' : ''} ${file.isImage || file.isText ? 'clickable' : ''}`}
                onClick={() => handleFileClick(file)}
              >
                <span className="file-icon">{getFileIcon(file)}</span>
                <span className="file-name">{file.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Preview content */}
        <div className={`file-preview-container ${isTextFile ? 'text-preview' : ''}`}>
          <div className="file-preview-header">
            <span className="file-preview-filename">{context.file.name}</span>
            <button className="file-preview-close" onClick={onClose} />
          </div>
          {loading ? (
            <div className="file-preview-loading">Loading...</div>
          ) : content ? (
            context.file.isImage ? (
              <img src={content} alt={context.file.name} />
            ) : (
              <pre className="file-preview-code">
                <code ref={codeRef}>{content}</code>
              </pre>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
