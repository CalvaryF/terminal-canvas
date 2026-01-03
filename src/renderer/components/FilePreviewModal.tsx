import { useEffect, useState, useRef } from 'react'
import hljs from 'highlight.js'

export type PreviewFile = {
  path: string
  type: 'image' | 'text'
}

interface FilePreviewModalProps {
  file: PreviewFile | null
  onClose: () => void
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

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (file) {
      setLoading(true)
      if (file.type === 'image') {
        window.electronAPI.readImageAsBase64(file.path)
          .then(setContent)
          .finally(() => setLoading(false))
      } else {
        window.electronAPI.readTextFile(file.path)
          .then(setContent)
          .finally(() => setLoading(false))
      }
    } else {
      setContent(null)
    }
  }, [file])

  // Apply syntax highlighting after content loads
  useEffect(() => {
    if (content && file?.type === 'text' && codeRef.current) {
      const extension = file.path.split('.').pop()?.toLowerCase() || ''
      const language = extensionToLanguage[extension]

      if (language && hljs.getLanguage(language)) {
        const highlighted = hljs.highlight(content, { language })
        codeRef.current.innerHTML = highlighted.value
      } else {
        // Try auto-detection for unknown extensions
        const result = hljs.highlightAuto(content)
        codeRef.current.innerHTML = result.value
      }
    }
  }, [content, file])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!file) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const fileName = file.path.split('/').pop() || 'File'
  const extension = fileName.split('.').pop()?.toLowerCase() || ''

  return (
    <div className="file-preview-overlay" onClick={handleBackdropClick}>
      <div className={`file-preview-container ${file.type === 'text' ? 'text-preview' : ''}`}>
        <div className="file-preview-header">
          <span className="file-preview-filename">{fileName}</span>
          <button className="file-preview-close" onClick={onClose} />
        </div>
        {loading ? (
          <div className="file-preview-loading">Loading...</div>
        ) : content ? (
          file.type === 'image' ? (
            <img src={content} alt={fileName} />
          ) : (
            <pre className="file-preview-code">
              <code ref={codeRef}>{content}</code>
            </pre>
          )
        ) : null}
      </div>
    </div>
  )
}
