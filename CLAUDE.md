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
│   ├── file-manager.ts # Folder watching, file operations
│   ├── canvas-storage.ts # YAML-based canvas persistence
│   ├── agent-server.ts   # HTTP/WebSocket API server
│   ├── agent-routes.ts   # REST endpoint handlers
│   ├── agent-controller.ts # IPC bridge to renderer
│   └── agent-ws.ts       # WebSocket subscription manager
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
│   │   ├── CommandQueueNode.tsx # Command queue for terminal guardrails
│   │   ├── ImagePreviewModal.tsx # Image preview overlay
│   │   └── Toolbar.tsx          # Bottom toolbar with mode/color selection
│   ├── utils/
│   │   └── pathSmoothing.ts # Catmull-Rom spline smoothing
│   ├── hooks/
│   │   ├── useCanvasPersistence.ts # Save/load canvas state
│   │   └── useAgentHandler.ts      # Handle agent API requests
│   ├── types/
│   │   └── index.ts         # Node type definitions
│   └── styles/
│       └── index.css        # All styles
└── shared/
    ├── ipc-channels.ts  # IPC channel constants
    └── agent-types.ts   # Agent API type definitions
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
- `Cmd+Q` - Add command queue
- `Delete` / `Backspace` - Delete selected nodes
- Double-click text node - Edit text
- Drag between handles - Create connector
- Click image in folder - Preview image

### Other
- Drag folder/file onto terminal - Insert path

### Folder Pipelines
Connect folder nodes to create file pipelines:
- Drag from source handle (right) to target handle (left)
- New files in source folder auto-copy to connected target folders
- Supports multiple targets per source

### Command Queues
Command queues act as guardrails for terminal commands:
- Create a queue node and connect it to a terminal (drag from queue's right handle to terminal's left handle)
- Commands can be added manually via the + button or via the Agent API
- Each command shows as pending (○) until the user clicks the send button (▶)
- Commands are removed from the queue after execution
- **Security**: The Agent API cannot write directly to terminals - all commands must go through queues and require manual approval

## Architecture Notes

- PTY processes run in main process, communicate via IPC
- Preload uses Map-based callback system (contextBridge limitation)
- React StrictMode disabled to prevent PTY double-initialization
- Terminal nodes use `nodrag nowheel` classes to allow text selection

## Agent API

External LLM agents (like Claude Code) can control the canvas via HTTP REST API and WebSocket.

### Enabling the API

Set environment variable before starting:
```bash
AGENT_API_ENABLED=true npm run dev
```

Optional configuration:
- `AGENT_API_PORT=4000` - Server port (default: 4000)
- `AGENT_API_TOKEN=secret` - Bearer token for authentication

### REST Endpoints

Base URL: `http://127.0.0.1:4000/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/canvas` | Get full canvas state |
| GET | `/canvas/nodes` | List all nodes |
| POST | `/canvas/edges` | Create edge `{ source, target }` |
| DELETE | `/canvas/edges/:id` | Delete edge |
| POST | `/terminals` | Create terminal `{ cwd, command, position?, title? }` |
| GET | `/terminals/:id/output?lines=100` | Get buffered output |
| POST | `/text-nodes` | Create text node `{ text, position? }` |
| POST | `/folders` | Create folder `{ path, position? }` |
| POST | `/queues` | Create command queue `{ position? }` |
| GET | `/queues/:id` | Get queue with commands |
| POST | `/queues/:id/commands` | Add command `{ command: "ls -la" }` |
| DELETE | `/queues/:id/commands/:commandId` | Remove pending command |
| DELETE | `/canvas/nodes/:id` | Delete any node |
| POST | `/batch` | Execute multiple operations in one request |

### Batch Operations

Execute multiple operations in a single request with temporary ID references:

```bash
curl -X POST http://127.0.0.1:4000/api/v1/batch \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      { "op": "createTerminal", "tempId": "$t1", "params": { "cwd": "/tmp" } },
      { "op": "createQueue", "tempId": "$q1", "params": {} },
      { "op": "createEdge", "params": { "source": "$q1", "target": "$t1" } },
      { "op": "addQueueCommand", "params": { "queueId": "$q1", "command": "npm install" } },
      { "op": "addQueueCommand", "params": { "queueId": "$q1", "command": "npm test" } }
    ]
  }'
```

**Temporary IDs**: Use `$name` syntax to reference nodes created earlier in the same batch. The `idMap` in the response shows the mapping from temp IDs to real UUIDs.

**Supported operations**: `createTerminal`, `createQueue`, `createTextNode`, `createFolder`, `createEdge`, `deleteNode`, `deleteEdge`, `updateNode`, `addQueueCommand`, `setViewport`

**Error handling**: Stops on first error, returns partial results with `failedAt` index.

### WebSocket Streaming

Connect to `ws://127.0.0.1:4000/ws` for real-time events:

```javascript
const ws = new WebSocket('ws://127.0.0.1:4000/ws')

// Subscribe to terminal output
ws.send(JSON.stringify({ type: 'subscribe', channel: 'terminal:NODE_ID:output' }))

// Receive output stream
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.channel.includes(':output')) {
    console.log(msg.payload.data)
  }
}
```

Channels: `terminal:{id}:output`, `terminal:{id}:exit`, `canvas:nodes`, `canvas:edges`

### Example: Create terminal with command queue

```bash
# Create a terminal
TERM_ID=$(curl -s -X POST http://127.0.0.1:4000/api/v1/terminals \
  -H "Content-Type: application/json" \
  -d '{"cwd": "/tmp", "title": "My Terminal"}' | jq -r '.node.id')

# Create a command queue
QUEUE_ID=$(curl -s -X POST http://127.0.0.1:4000/api/v1/queues \
  -H "Content-Type: application/json" \
  -d '{"position": {"x": 100, "y": 100}}' | jq -r '.node.id')

# Connect queue to terminal
curl -X POST http://127.0.0.1:4000/api/v1/canvas/edges \
  -H "Content-Type: application/json" \
  -d "{\"source\": \"$QUEUE_ID\", \"target\": \"$TERM_ID\"}"

# Add commands to queue (user must click to execute)
curl -X POST "http://127.0.0.1:4000/api/v1/queues/$QUEUE_ID/commands" \
  -H "Content-Type: application/json" \
  -d '{"command": "pwd"}'
```

### Architecture

```
Agent (Claude Code)
     |
     v
HTTP/WS Server (main process, port 4000)
     |
+----+----+
|         |
v         v
PTY      Renderer (via IPC)
```

Files:
- `src/main/agent-server.ts` - HTTP + WebSocket server
- `src/main/agent-controller.ts` - IPC request/response with renderer
- `src/main/agent-routes.ts` - REST endpoint handlers
- `src/main/agent-ws.ts` - WebSocket subscription manager
- `src/renderer/hooks/useAgentHandler.ts` - Renderer-side command handling
- `src/shared/agent-types.ts` - Shared type definitions for agent API

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
