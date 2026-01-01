import type { CanvasMode } from '../App'

interface ToolbarProps {
  onAddTerminal: (command: string) => void
  onAddTextbox: () => void
  mode: CanvasMode
  onModeChange: (mode: CanvasMode) => void
}

function Toolbar({ onAddTerminal, onAddTextbox, mode, onModeChange }: ToolbarProps) {
  return (
    <div className="bottom-toolbar">
      <button
        onClick={() => onModeChange('hand')}
        title="Hand tool (H)"
        className={mode === 'hand' ? 'active' : ''}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path>
          <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path>
          <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path>
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
        </svg>
      </button>
      <button
        onClick={() => onModeChange('select')}
        title="Select tool (V)"
        className={mode === 'select' ? 'active' : ''}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path>
          <path d="M13 13l6 6"></path>
        </svg>
      </button>
      <div className="toolbar-divider" />
      <button onClick={() => onAddTerminal('')} title="Add Shell">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </button>
      <button onClick={() => onAddTerminal('claude')} title="Add Claude">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
      </button>
      <div className="toolbar-divider" />
      <button onClick={onAddTextbox} title="Add Textbox">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.375-9.375z"></path>
        </svg>
      </button>
    </div>
  )
}

export default Toolbar
