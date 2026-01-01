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
│   ├── index.ts    # Window creation, IPC handlers
│   └── pty-manager.ts  # PTY lifecycle management
├── preload/
│   └── index.ts    # IPC bridge (contextBridge)
├── renderer/       # React app
│   ├── App.tsx     # Root component with toolbar
│   ├── components/
│   │   ├── Canvas.tsx      # React Flow canvas + zoom handler
│   │   └── TerminalNode.tsx # Terminal node with xterm.js
│   └── styles/
└── shared/
    └── ipc-channels.ts  # IPC channel constants
```

## Running

```bash
npm install
npm run dev
```

## Controls

- **Pan**: Click and drag on canvas background
- **Zoom in**: Hold `z` + click (zooms toward cursor)
- **Zoom out**: Hold `Option+z` + click (zooms toward cursor)
- **Add terminal**: Click "Add Terminal" or "Add Claude" buttons
- **Drag folder/file**: Drop onto terminal to insert path

## Architecture Notes

- PTY processes run in main process, communicate via IPC
- Preload uses Map-based callback system (contextBridge limitation)
- React StrictMode disabled to prevent PTY double-initialization
- Terminal nodes use `nodrag nowheel` classes to allow text selection
