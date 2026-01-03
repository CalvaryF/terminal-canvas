import { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import { agentController } from './agent-controller'
import { ptyManager } from './pty-manager'
import { canvasStorage } from './canvas-storage'
import {
  ApiResponse,
  AgentErrorCode,
  CreateTerminalRequest,
  CreateTextNodeRequest,
  CreateFolderNodeRequest,
  CreateEdgeRequest,
  SaveCanvasRequest,
  CreateQueueNodeRequest,
  AddQueueCommandRequest
} from '../shared/agent-types'

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  body: unknown
) => Promise<void>

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: RouteHandler
}

export class AgentRoutes {
  private routes: Route[] = []
  private authToken: string | null = null

  constructor() {
    this.setupRoutes()
  }

  setAuthToken(token: string | null) {
    this.authToken = token
  }

  private addRoute(method: string, path: string, handler: RouteHandler) {
    // Convert path like /terminals/:id to regex
    const paramNames: string[] = []
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name)
      return '([^/]+)'
    })
    this.routes.push({
      method,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler
    })
  }

  private setupRoutes() {
    // Canvas state
    this.addRoute('GET', '/api/v1/canvas', this.getCanvas.bind(this))
    this.addRoute('GET', '/api/v1/canvas/nodes', this.getNodes.bind(this))
    this.addRoute('GET', '/api/v1/canvas/nodes/:id', this.getNode.bind(this))
    this.addRoute('POST', '/api/v1/canvas/nodes', this.createNode.bind(this))
    this.addRoute('PATCH', '/api/v1/canvas/nodes/:id', this.updateNode.bind(this))
    this.addRoute('DELETE', '/api/v1/canvas/nodes/:id', this.deleteNode.bind(this))
    this.addRoute('GET', '/api/v1/canvas/edges', this.getEdges.bind(this))
    this.addRoute('POST', '/api/v1/canvas/edges', this.createEdge.bind(this))
    this.addRoute('DELETE', '/api/v1/canvas/edges/:id', this.deleteEdge.bind(this))

    // Terminals (read-only - commands must go through queues)
    this.addRoute('POST', '/api/v1/terminals', this.createTerminal.bind(this))
    this.addRoute('GET', '/api/v1/terminals/:id', this.getTerminal.bind(this))
    this.addRoute('GET', '/api/v1/terminals/:id/output', this.getTerminalOutput.bind(this))
    this.addRoute('DELETE', '/api/v1/terminals/:id', this.deleteTerminal.bind(this))

    // Command Queues
    this.addRoute('POST', '/api/v1/queues', this.createQueue.bind(this))
    this.addRoute('GET', '/api/v1/queues/:id', this.getQueue.bind(this))
    this.addRoute('POST', '/api/v1/queues/:id/commands', this.addQueueCommand.bind(this))
    this.addRoute('DELETE', '/api/v1/queues/:id/commands/:commandId', this.removeQueueCommand.bind(this))
    this.addRoute('DELETE', '/api/v1/queues/:id', this.deleteQueue.bind(this))

    // Text nodes
    this.addRoute('POST', '/api/v1/text-nodes', this.createTextNode.bind(this))
    this.addRoute('GET', '/api/v1/text-nodes/:id', this.getTextNode.bind(this))
    this.addRoute('PATCH', '/api/v1/text-nodes/:id', this.updateTextNode.bind(this))
    this.addRoute('DELETE', '/api/v1/text-nodes/:id', this.deleteTextNode.bind(this))

    // Folders
    this.addRoute('POST', '/api/v1/folders', this.createFolder.bind(this))
    this.addRoute('GET', '/api/v1/folders/:id', this.getFolder.bind(this))
    this.addRoute('GET', '/api/v1/folders/:id/files', this.getFolderFiles.bind(this))
    this.addRoute('DELETE', '/api/v1/folders/:id', this.deleteFolder.bind(this))

    // Saves
    this.addRoute('GET', '/api/v1/saves', this.listSaves.bind(this))
    this.addRoute('POST', '/api/v1/saves', this.saveCanvas.bind(this))
    this.addRoute('POST', '/api/v1/saves/:filename/load', this.loadCanvas.bind(this))
    this.addRoute('DELETE', '/api/v1/saves/:filename', this.deleteSave.bind(this))
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const method = req.method || 'GET'

    // Check auth if token is set
    if (this.authToken) {
      const authHeader = req.headers.authorization
      if (!authHeader || authHeader !== `Bearer ${this.authToken}`) {
        this.sendError(res, 401, AgentErrorCode.AUTH_FAILED, 'Invalid or missing auth token')
        return true
      }
    }

    // Find matching route
    for (const route of this.routes) {
      if (route.method !== method) continue

      const match = url.pathname.match(route.pattern)
      if (!match) continue

      // Extract params
      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1])
      })

      // Parse body for POST/PATCH
      let body: unknown = null
      if (method === 'POST' || method === 'PATCH') {
        try {
          body = await this.parseBody(req)
        } catch {
          this.sendError(res, 400, AgentErrorCode.INVALID_REQUEST, 'Invalid JSON body')
          return true
        }
      }

      try {
        await route.handler(req, res, params, body)
      } catch (err) {
        const error = err as Error & { code?: AgentErrorCode }
        this.sendError(
          res,
          500,
          error.code || AgentErrorCode.INTERNAL_ERROR,
          error.message || 'Internal error'
        )
      }
      return true
    }

    return false // No route matched
  }

  private parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        if (!body) {
          resolve(null)
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('Invalid JSON'))
        }
      })
      req.on('error', reject)
    })
  }

  private sendJson<T>(res: ServerResponse, data: T) {
    const response: ApiResponse<T> = { success: true, data }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(response))
  }

  private sendError(res: ServerResponse, status: number, code: AgentErrorCode, message: string) {
    const response: ApiResponse = {
      success: false,
      error: { code, message }
    }
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(response))
  }

  // ============================================================
  // Canvas Handlers
  // ============================================================

  private async getCanvas(_req: IncomingMessage, res: ServerResponse) {
    const state = await agentController.getCanvasState()
    this.sendJson(res, state)
  }

  private async getNodes(_req: IncomingMessage, res: ServerResponse) {
    const nodes = await agentController.getNodes()
    this.sendJson(res, nodes)
  }

  private async getNode(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const node = await agentController.getNode(params.id)
    if (!node) {
      this.sendError(res, 404, AgentErrorCode.NODE_NOT_FOUND, `Node ${params.id} not found`)
      return
    }
    this.sendJson(res, node)
  }

  private async createNode(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown) {
    const { type, ...data } = body as { type: string } & Record<string, unknown>
    let node
    switch (type) {
      case 'terminal':
        node = await agentController.createTerminal(data as CreateTerminalRequest)
        break
      case 'text':
        node = await agentController.createTextNode(data as CreateTextNodeRequest)
        break
      case 'folder':
        node = await agentController.createFolderNode(data as CreateFolderNodeRequest)
        break
      case 'queue':
        node = await agentController.createQueueNode(data as CreateQueueNodeRequest)
        break
      default:
        this.sendError(res, 400, AgentErrorCode.INVALID_NODE_TYPE, `Invalid node type: ${type}`)
        return
    }
    this.sendJson(res, node)
  }

  private async updateNode(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown) {
    const node = await agentController.updateNode(params.id, body as Record<string, unknown>)
    this.sendJson(res, node)
  }

  private async deleteNode(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await agentController.deleteNode(params.id)
    this.sendJson(res, { deleted: params.id })
  }

  private async getEdges(_req: IncomingMessage, res: ServerResponse) {
    const edges = await agentController.getEdges()
    this.sendJson(res, edges)
  }

  private async createEdge(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown) {
    const edge = await agentController.createEdge(body as CreateEdgeRequest)
    this.sendJson(res, edge)
  }

  private async deleteEdge(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await agentController.deleteEdge(params.id)
    this.sendJson(res, { deleted: params.id })
  }

  // ============================================================
  // Terminal Handlers
  // ============================================================

  private async createTerminal(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown) {
    const node = await agentController.createTerminal(body as CreateTerminalRequest)
    this.sendJson(res, node)
  }

  private async getTerminal(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const node = await agentController.getNode(params.id)
    if (!node || node.type !== 'terminal') {
      this.sendError(res, 404, AgentErrorCode.NODE_NOT_FOUND, `Terminal ${params.id} not found`)
      return
    }
    // Get current working directory
    const cwd = await ptyManager.getCwd(params.id)
    this.sendJson(res, { ...node, currentCwd: cwd })
  }

  private async getTerminalOutput(req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const lines = parseInt(url.searchParams.get('lines') || '100', 10)
    const output = ptyManager.getOutput(params.id, lines)
    this.sendJson(res, { lines: output })
  }

  private async deleteTerminal(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await agentController.deleteNode(params.id)
    this.sendJson(res, { deleted: params.id })
  }

  // ============================================================
  // Command Queue Handlers
  // ============================================================

  private async createQueue(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown) {
    const node = await agentController.createQueueNode(body as CreateQueueNodeRequest)
    this.sendJson(res, node)
  }

  private async getQueue(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const node = await agentController.getNode(params.id)
    if (!node || node.type !== 'queue') {
      this.sendError(res, 404, AgentErrorCode.NODE_NOT_FOUND, `Queue ${params.id} not found`)
      return
    }
    this.sendJson(res, node)
  }

  private async addQueueCommand(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown) {
    const { command } = body as AddQueueCommandRequest
    if (!command) {
      this.sendError(res, 400, AgentErrorCode.INVALID_REQUEST, 'Missing command field')
      return
    }
    const result = await agentController.addQueueCommand(params.id, command)
    this.sendJson(res, result)
  }

  private async removeQueueCommand(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await agentController.removeQueueCommand(params.id, params.commandId)
    this.sendJson(res, { removed: params.commandId })
  }

  private async deleteQueue(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await agentController.deleteNode(params.id)
    this.sendJson(res, { deleted: params.id })
  }

  // ============================================================
  // Text Node Handlers
  // ============================================================

  private async createTextNode(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown) {
    const node = await agentController.createTextNode(body as CreateTextNodeRequest)
    this.sendJson(res, node)
  }

  private async getTextNode(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const node = await agentController.getNode(params.id)
    if (!node || node.type !== 'text') {
      this.sendError(res, 404, AgentErrorCode.NODE_NOT_FOUND, `Text node ${params.id} not found`)
      return
    }
    this.sendJson(res, node)
  }

  private async updateTextNode(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown) {
    const { text } = body as { text: string }
    const node = await agentController.updateNode(params.id, { data: { text } })
    this.sendJson(res, node)
  }

  private async deleteTextNode(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await agentController.deleteNode(params.id)
    this.sendJson(res, { deleted: params.id })
  }

  // ============================================================
  // Folder Handlers
  // ============================================================

  private async createFolder(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown) {
    const node = await agentController.createFolderNode(body as CreateFolderNodeRequest)
    this.sendJson(res, node)
  }

  private async getFolder(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const node = await agentController.getNode(params.id)
    if (!node || node.type !== 'folder') {
      this.sendError(res, 404, AgentErrorCode.NODE_NOT_FOUND, `Folder ${params.id} not found`)
      return
    }
    this.sendJson(res, node)
  }

  private async getFolderFiles(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const node = await agentController.getNode(params.id)
    if (!node || node.type !== 'folder') {
      this.sendError(res, 404, AgentErrorCode.NODE_NOT_FOUND, `Folder ${params.id} not found`)
      return
    }
    this.sendJson(res, (node as { data: { files: unknown[] } }).data.files)
  }

  private async deleteFolder(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await agentController.deleteNode(params.id)
    this.sendJson(res, { deleted: params.id })
  }

  // ============================================================
  // Save/Load Handlers
  // ============================================================

  private async listSaves(_req: IncomingMessage, res: ServerResponse) {
    const saves = await canvasStorage.list()
    this.sendJson(res, saves)
  }

  private async saveCanvas(_req: IncomingMessage, res: ServerResponse, _params: Record<string, string>, body: unknown) {
    const { filename } = body as SaveCanvasRequest
    if (!filename) {
      this.sendError(res, 400, AgentErrorCode.INVALID_REQUEST, 'Missing filename')
      return
    }
    const state = await agentController.getCanvasState()
    await canvasStorage.save(filename, {
      nodes: state.nodes,
      edges: state.edges,
      viewport: state.viewport
    })
    this.sendJson(res, { saved: filename })
  }

  private async loadCanvas(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    const data = await canvasStorage.load(params.filename)
    if (!data) {
      this.sendError(res, 404, AgentErrorCode.CANVAS_NOT_LOADED, `Canvas ${params.filename} not found`)
      return
    }
    this.sendJson(res, { loaded: params.filename, data })
  }

  private async deleteSave(_req: IncomingMessage, res: ServerResponse, params: Record<string, string>) {
    await canvasStorage.delete(params.filename)
    this.sendJson(res, { deleted: params.filename })
  }
}

export const agentRoutes = new AgentRoutes()
