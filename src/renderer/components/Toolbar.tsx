interface ToolbarProps {
  onAddTerminal: (command: string) => void
}

function Toolbar({ onAddTerminal }: ToolbarProps) {
  return (
    <div className="toolbar">
      <span className="toolbar-title">Terminal Canvas</span>
      <button onClick={() => onAddTerminal('')}>
        + Shell
      </button>
      <button onClick={() => onAddTerminal('claude')}>
        + Claude
      </button>
    </div>
  )
}

export default Toolbar
