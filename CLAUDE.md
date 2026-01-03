# Terminal Canvas

An Electron desktop app that displays multiple terminal instances on an infinite, draggable canvas.

## Tech Stack

- **Electron** - Desktop app shell with Node.js for PTY access
- **React** - UI framework
- **React Flow** - Canvas with pan/zoom/drag
- **xterm.js** - Terminal rendering
- **node-pty** - Native PTY bindings

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── index.ts        # Window creation, IPC handlers
│   ├── pty-manager.ts  # PTY lifecycle management
│   └── file-manager.ts # Folder watching, file operations
├── preload/
│   └── index.ts    # IPC bridge (contextBridge)
├── renderer/       # React app
│   ├── App.tsx     # Root component with state management
│   ├── components/
│   │   ├── Canvas.tsx           # React Flow canvas + handlers
│   │   ├── TerminalNode.tsx     # Terminal node with xterm.js
│   │   ├── TextNode.tsx         # Editable text node with connectors
│   │   ├── DrawingNode.tsx      # Freehand drawing strokes
│   │   ├── FolderNode.tsx       # Folder watcher with file list
│   │   ├── ImagePreviewModal.tsx # Image preview overlay
│   │   └── Toolbar.tsx          # Bottom toolbar with mode/color selection
│   ├── utils/
│   │   └── pathSmoothing.ts # Catmull-Rom spline smoothing
│   ├── types/
│   │   └── index.ts         # Node type definitions
│   └── styles/
│       └── index.css        # All styles
└── shared/
    └── ipc-channels.ts  # IPC channel constants
```

## Running

```bash
npm install
npm run dev
```

## Controls

### Mode Switching
- `H` - Hand mode (pan canvas)
- `V` - Select mode (click/drag to select, move nodes)
- `P` - Pencil mode (freehand drawing)

### Zoom
- Hold `Z` + click - Zoom in toward cursor
- Hold `Z` + drag - Marquee zoom (fit selection to screen)
- Hold `Option+Z` + click - Zoom out from cursor

### Node Actions
- `Cmd+T` - Add terminal
- `Cmd+Shift+T` - Add Claude terminal
- `Cmd+N` - Add text node
- `Cmd+Shift+F` - Add folder (opens folder picker)
- `Delete` / `Backspace` - Delete selected nodes
- Double-click text node - Edit text
- Drag between handles - Create connector
- Click image in folder - Preview image

### Other
- Drag folder/file onto terminal - Insert path

### Folder Pipelines
Connect folder nodes to create file pipelines:
- Drag from blue handle (source) to green handle (target)
- New files in source folder auto-copy to connected target folders
- Supports multiple targets per source

## Architecture Notes

- PTY processes run in main process, communicate via IPC
- Preload uses Map-based callback system (contextBridge limitation)
- React StrictMode disabled to prevent PTY double-initialization
- Terminal nodes use `nodrag nowheel` classes to allow text selection

## React Flow Coordinate Gotchas

When working with React Flow coordinates (e.g., for the drawing tool), be aware of these issues:

### 1. CSS Transform breaks `position: fixed`
React Flow applies CSS transforms to `.react-flow__viewport` for pan/zoom. This creates a new containing block for any `position: fixed` descendants, making them position relative to the transformed container instead of the browser viewport.

**Solution**: Use `createPortal(element, document.body)` to render fixed-position elements outside React Flow's DOM tree.

### 2. Mysterious 14px Y offset in node rendering
When creating nodes at flow coordinates calculated via `screenToFlowPosition` or manual calculation, nodes render ~14px lower than expected. The root cause is unknown (likely React Flow internals).

**Solution**: Apply a `-14` Y offset when setting node positions:
```typescript
const REACT_FLOW_Y_OFFSET = 14
position: { x: bbox.minX, y: bbox.minY - REACT_FLOW_Y_OFFSET }
```

### 3. Catmull-Rom spline overshoot
The smoothing algorithm (`smoothPoints`) can produce interpolated points outside the bounding box of the original control points.

**Solution**: Calculate bounding box from the smoothed points, not the raw input points:
```typescript
const smoothedPoints = smoothPoints(rawPoints)
const bbox = getBoundingBox(smoothedPoints)  // Use smoothed, not raw
const normalized = normalizePoints(smoothedPoints, bbox.minX, bbox.minY)
```
