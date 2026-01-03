import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  AgentErrorCode,
  AgentResponse,
  CanvasState,
  CanvasNode,
  Edge,
  Viewport,
  CreateTerminalRequest,
  CreateTextNodeRequest,
  CreateFolderNodeRequest,
  CreateEdgeRequest,
  CreateQueueNodeRequest,
  Position,
  CommandItem
} from '../shared/agent-types'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export class AgentController {
  private window: BrowserWindow | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private requestTimeout = 10000 // 10 seconds

  constructor() {
    // Listen for responses from renderer
    ipcMain.on(IPC_CHANNELS.AGENT_RESPONSE, (_, response: AgentResponse) => {
      this.handleResponse(response)
    })
  }

  setWindow(window: BrowserWindow) {
    this.window = window
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private sendRequest<T>(channel: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.window || this.window.isDestroyed()) {
        reject(new Error('Window not available'))
        return
      }

      const requestId = this.generateRequestId()
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('Request timeout'))
      }, this.requestTimeout)

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout
      })

      this.window.webContents.send(channel, requestId, payload)
    })
  }

  private handleResponse(response: AgentResponse) {
    const pending = this.pendingRequests.get(response.requestId)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(response.requestId)

    if (response.success) {
      pending.resolve(response.data)
    } else {
      const error = new Error(response.error?.message || 'Unknown error')
      ;(error as Error & { code: AgentErrorCode }).code = response.error?.code || AgentErrorCode.INTERNAL_ERROR
      pending.reject(error)
    }
  }

  // ============================================================
  // Canvas State Operations
  // ============================================================

  async getCanvasState(): Promise<CanvasState> {
    return this.sendRequest<CanvasState>(IPC_CHANNELS.AGENT_GET_STATE)
  }

  async getNodes(): Promise<CanvasNode[]> {
    const state = await this.getCanvasState()
    return state.nodes
  }

  async getNode(nodeId: string): Promise<CanvasNode | null> {
    const state = await this.getCanvasState()
    return state.nodes.find(n => n.id === nodeId) || null
  }

  async getEdges(): Promise<Edge[]> {
    const state = await this.getCanvasState()
    return state.edges
  }

  // ============================================================
  // Node Operations
  // ============================================================

  async createTerminal(request: CreateTerminalRequest): Promise<CanvasNode> {
    return this.sendRequest<CanvasNode>(IPC_CHANNELS.AGENT_CREATE_NODE, {
      type: 'terminal',
      ...request
    })
  }

  async createTextNode(request: CreateTextNodeRequest): Promise<CanvasNode> {
    return this.sendRequest<CanvasNode>(IPC_CHANNELS.AGENT_CREATE_NODE, {
      type: 'text',
      ...request
    })
  }

  async createFolderNode(request: CreateFolderNodeRequest): Promise<CanvasNode> {
    return this.sendRequest<CanvasNode>(IPC_CHANNELS.AGENT_CREATE_NODE, {
      type: 'folder',
      ...request
    })
  }

  async createQueueNode(request: CreateQueueNodeRequest): Promise<CanvasNode> {
    return this.sendRequest<CanvasNode>(IPC_CHANNELS.AGENT_CREATE_NODE, {
      type: 'queue',
      ...request
    })
  }

  async addQueueCommand(queueId: string, command: string): Promise<CommandItem> {
    return this.sendRequest<CommandItem>(IPC_CHANNELS.AGENT_ADD_QUEUE_COMMAND, {
      queueId,
      command
    })
  }

  async removeQueueCommand(queueId: string, commandId: string): Promise<void> {
    return this.sendRequest<void>(IPC_CHANNELS.AGENT_REMOVE_QUEUE_COMMAND, {
      queueId,
      commandId
    })
  }

  async updateNode(nodeId: string, updates: Partial<CanvasNode>): Promise<CanvasNode> {
    return this.sendRequest<CanvasNode>(IPC_CHANNELS.AGENT_UPDATE_NODE, {
      nodeId,
      updates
    })
  }

  async updateNodePosition(nodeId: string, position: Position): Promise<CanvasNode> {
    return this.updateNode(nodeId, { position } as Partial<CanvasNode>)
  }

  async deleteNode(nodeId: string): Promise<void> {
    return this.sendRequest<void>(IPC_CHANNELS.AGENT_DELETE_NODE, { nodeId })
  }

  // ============================================================
  // Edge Operations
  // ============================================================

  async createEdge(request: CreateEdgeRequest): Promise<Edge> {
    return this.sendRequest<Edge>(IPC_CHANNELS.AGENT_CREATE_EDGE, request)
  }

  async deleteEdge(edgeId: string): Promise<void> {
    return this.sendRequest<void>(IPC_CHANNELS.AGENT_DELETE_EDGE, { edgeId })
  }

  // ============================================================
  // Viewport Operations
  // ============================================================

  async setViewport(viewport: Viewport): Promise<void> {
    return this.sendRequest<void>(IPC_CHANNELS.AGENT_SET_VIEWPORT, viewport)
  }

  async setFocusedNode(nodeId: string | null): Promise<void> {
    return this.sendRequest<void>(IPC_CHANNELS.AGENT_SET_FOCUSED, { nodeId })
  }

  // ============================================================
  // Cleanup
  // ============================================================

  cleanup() {
    // Clear all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Controller shutting down'))
    }
    this.pendingRequests.clear()
  }
}

export const agentController = new AgentController()
