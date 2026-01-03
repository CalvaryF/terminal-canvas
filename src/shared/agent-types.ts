// Agent API Types
// Shared between main process and renderer

// ============================================================
// Error Codes
// ============================================================

export enum AgentErrorCode {
  NODE_NOT_FOUND = 'NODE_NOT_FOUND',
  INVALID_NODE_TYPE = 'INVALID_NODE_TYPE',
  TERMINAL_NOT_RUNNING = 'TERMINAL_NOT_RUNNING',
  FOLDER_NOT_FOUND = 'FOLDER_NOT_FOUND',
  FOLDER_ACCESS_DENIED = 'FOLDER_ACCESS_DENIED',
  CANVAS_NOT_LOADED = 'CANVAS_NOT_LOADED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUTH_FAILED = 'AUTH_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: AgentErrorCode
    message: string
  }
}

// ============================================================
// Node Types (mirrors renderer types for API)
// ============================================================

export interface Position {
  x: number
  y: number
}

export interface NodeBase {
  id: string
  type: string
  position: Position
}

export interface TerminalNodeData {
  title: string
  command: string
  cwd: string
  cols: number
  rows: number
}

export interface TextNodeData {
  text: string
}

export interface FolderNodeData {
  folderPath: string
  files: FileInfo[]
  isWatching: boolean
}

export interface DrawingNodeData {
  pathData: string
  color: string
  strokeWidth: number
  points: Array<{ x: number; y: number }>
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  isImage: boolean
  isText: boolean
  extension: string
  size: number
  modifiedTime: number
}

export interface TerminalNode extends NodeBase {
  type: 'terminal'
  data: TerminalNodeData
}

export interface TextNode extends NodeBase {
  type: 'text'
  data: TextNodeData
}

export interface FolderNode extends NodeBase {
  type: 'folder'
  data: FolderNodeData
}

export interface DrawingNode extends NodeBase {
  type: 'drawing'
  data: DrawingNodeData
}

// Command Queue
export interface CommandItem {
  id: string
  command: string
  status: 'pending' | 'sent' | 'done' | 'error'
  addedAt: number
  sentAt?: number
}

export interface CommandQueueNodeData {
  commands: CommandItem[]
}

export interface CommandQueueNode extends NodeBase {
  type: 'queue'
  data: CommandQueueNodeData
}

export type CanvasNode = TerminalNode | TextNode | FolderNode | DrawingNode | CommandQueueNode

export interface Edge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

// ============================================================
// Canvas State
// ============================================================

export interface CanvasState {
  nodes: CanvasNode[]
  edges: Edge[]
  viewport: Viewport
  focusedNodeId: string | null
  mode: 'hand' | 'select' | 'draw'
}

// ============================================================
// API Request Types
// ============================================================

export interface CreateTerminalRequest {
  command?: string
  cwd?: string
  position?: Position
  title?: string
  cols?: number
  rows?: number
}

export interface WriteTerminalRequest {
  input: string
}

export interface ResizeTerminalRequest {
  cols: number
  rows: number
}

export interface CreateTextNodeRequest {
  text?: string
  position?: Position
}

export interface UpdateTextNodeRequest {
  text: string
}

export interface CreateFolderNodeRequest {
  path: string
  position?: Position
}

export interface CreateEdgeRequest {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface UpdateNodePositionRequest {
  position: Position
}

export interface SaveCanvasRequest {
  filename: string
}

export interface CreateQueueNodeRequest {
  position?: Position
}

export interface AddQueueCommandRequest {
  command: string
}

// ============================================================
// WebSocket Types
// ============================================================

export type WsClientMessageType = 'subscribe' | 'unsubscribe' | 'ping'

export interface WsClientMessage {
  type: WsClientMessageType
  channel: string
  payload?: unknown
}

export type WsServerMessageType = 'data' | 'event' | 'error' | 'pong' | 'subscribed' | 'unsubscribed'

export interface WsServerMessage {
  type: WsServerMessageType
  channel: string
  payload: unknown
  timestamp: number
}

// Channel patterns:
// - terminal:{id}:output - Terminal stdout/stderr stream
// - terminal:{id}:exit - Terminal process exit
// - canvas:nodes - Node add/update/remove events
// - canvas:edges - Edge add/remove events
// - folder:{id}:files - File changes in folder

export interface TerminalOutputPayload {
  data: string
}

export interface TerminalExitPayload {
  exitCode: number
}

export interface NodeEventPayload {
  action: 'add' | 'update' | 'remove'
  node: CanvasNode
}

export interface EdgeEventPayload {
  action: 'add' | 'remove'
  edge: Edge
}

export interface FileEventPayload {
  action: 'add' | 'remove'
  file: FileInfo
}

// ============================================================
// IPC Request/Response Types (Main <-> Renderer)
// ============================================================

export interface AgentRequest {
  requestId: string
  action: AgentAction
  payload: unknown
}

export type AgentAction =
  | 'getState'
  | 'createNode'
  | 'updateNode'
  | 'deleteNode'
  | 'createEdge'
  | 'deleteEdge'
  | 'setViewport'
  | 'setFocused'

export interface AgentResponse {
  requestId: string
  success: boolean
  data?: unknown
  error?: {
    code: AgentErrorCode
    message: string
  }
}

// ============================================================
// Server Configuration
// ============================================================

export interface AgentServerConfig {
  port: number
  host: string
  authToken?: string
  enabled: boolean
}

export const DEFAULT_AGENT_SERVER_CONFIG: AgentServerConfig = {
  port: 4000,
  host: '127.0.0.1',
  enabled: false // Must be explicitly enabled
}
