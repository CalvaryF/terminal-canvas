# FigJam-Style Pencil Tool Implementation Plan

## Overview
Add a freehand drawing tool with smooth strokes, color selection, and ability to select/move/delete strokes.

## Features
- **Draw mode** (P key to activate, like H for hand and V for select)
- **Smooth strokes** using Catmull-Rom splines
- **Preset color dots** in toolbar (black, red, blue, green, orange, purple)
- **Fixed stroke width** (2px)
- **Stroke selection** - click to select, drag to move (in select mode)
- **Delete strokes** - select and press Delete/Backspace
- Single pen type, no eraser

## Architecture

### Stroke Data Structure
```typescript
interface DrawingNodeData {
  pathData: string                          // Computed SVG path
  color: string                             // Hex color
  strokeWidth: number                       // Line width (fixed at 2)
  points: Array<{ x: number; y: number }>   // Raw points for re-smoothing
}
```

### Approach: Strokes as React Flow Nodes
Store each stroke as a `DrawingNode` - this gives us:
- Free selection/dragging via React Flow (in select mode)
- Consistent deletion via existing `onRemoveNode`
- Zoom/pan handled automatically
- No need for separate stroke state management

## Files to Modify/Create

| File | Changes |
|------|---------|
| `src/renderer/types/index.ts` | Add `DrawingNodeData`, `DrawingNode`, update `CanvasNode` |
| `src/renderer/App.tsx` | Add `'draw'` mode, P shortcut, color state |
| `src/renderer/components/Canvas.tsx` | Add drawing event handlers when mode='draw' |
| `src/renderer/components/DrawingNode.tsx` | **NEW** - Render SVG path for a stroke |
| `src/renderer/components/Toolbar.tsx` | Add pencil button, color dots |
| `src/renderer/styles/index.css` | Styles for drawing cursor, color dots |
| `src/renderer/utils/pathSmoothing.ts` | **NEW** - Catmull-Rom spline math |

## Implementation Steps

### Step 1: Types
Add to `types/index.ts`:
```typescript
export interface DrawingNodeData {
  pathData: string
  color: string
  strokeWidth: number
  points: Array<{ x: number; y: number }>
}

export type DrawingNode = Node<DrawingNodeData, 'drawing'>
export type CanvasNode = TerminalNode | TextNode | DrawingNode
```

### Step 2: Path Smoothing Utility
Create `utils/pathSmoothing.ts` with Catmull-Rom spline implementation:
- `smoothPoints(points)` - returns interpolated points
- `pointsToSVGPath(points)` - generates SVG path d attribute

### Step 3: DrawingNode Component
Create simple component that renders an SVG with the stroke path:
```tsx
<svg style={{ overflow: 'visible' }}>
  <path d={data.pathData} stroke={data.color} strokeWidth={data.strokeWidth} fill="none" />
</svg>
```

### Step 4: Drawing Logic in Canvas
When `mode === 'draw'`:
- `onPointerDown` on pane: start collecting points
- `onPointerMove`: add points to current stroke (with RAF throttling)
- `onPointerUp`: smooth points, create DrawingNode, add to nodes

Coordinate conversion (screen → flow):
```typescript
const { x, y, zoom } = getViewport()
const flowX = (clientX - x) / zoom
const flowY = (clientY - y) / zoom
```

### Step 5: Mode & Shortcuts
- Extend `CanvasMode = 'hand' | 'select' | 'draw'`
- Add P shortcut for draw mode (consistent with H and V)
- In draw mode: disable panOnDrag, show crosshair cursor

### Step 6: Toolbar Updates
- Add pencil icon button (toggles draw mode)
- Add preset color dots
- Store selected color in App state, pass to Canvas

### Step 7: Selection & Deletion
- Strokes are nodes, so select mode already handles selection
- Add Delete/Backspace key handler for deleting selected nodes

## UI Details

### Cursor
- Draw mode: `cursor: crosshair`

### Color Picker
Preset color dots in toolbar:
- Black, Red, Blue, Green, Orange, Purple (6 colors)
- Clicking a color sets it for next stroke
- Visual indicator shows currently selected color

### Toolbar Layout
```
[Hand] [Select] [Pencil] | [Color dots...] | [Add Terminal] [Add Claude] [Add Text]
```

## Performance Notes
- Throttle pointermove with RAF to avoid too many points
- Pre-compute pathData on stroke completion (not on every render)
- Strokes render as individual SVG nodes - React Flow handles virtualization
