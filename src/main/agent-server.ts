import * as http from 'http'
import { BrowserWindow } from 'electron'
import { agentController } from './agent-controller'
import { agentRoutes } from './agent-routes'
import { agentWsManager } from './agent-ws'
import { AgentServerConfig, DEFAULT_AGENT_SERVER_CONFIG } from '../shared/agent-types'

export class AgentServer {
  private server: http.Server | null = null
  private config: AgentServerConfig = { ...DEFAULT_AGENT_SERVER_CONFIG }

  initialize(window: BrowserWindow) {
    // Check if enabled via environment variable
    const enabled = process.env.AGENT_API_ENABLED === 'true' || process.env.AGENT_API_ENABLED === '1'
    if (!enabled) {
      console.log('[Agent API] Server disabled. Set AGENT_API_ENABLED=true to enable.')
      return
    }

    // Configure from environment
    this.config = {
      port: parseInt(process.env.AGENT_API_PORT || '4000', 10),
      host: '127.0.0.1', // Always localhost for security
      authToken: process.env.AGENT_API_TOKEN || undefined,
      enabled: true
    }

    // Set auth token on routes if configured
    if (this.config.authToken) {
      agentRoutes.setAuthToken(this.config.authToken)
      console.log('[Agent API] Authentication enabled')
    }

    // Set window reference on controller
    agentController.setWindow(window)

    // Create HTTP server
    this.server = http.createServer((req, res) => {
      // CORS headers for local development
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      // Try to handle via routes
      agentRoutes.handleRequest(req, res).then((handled) => {
        if (!handled) {
          // 404 for unmatched routes
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Endpoint not found' }
          }))
        }
      }).catch((err) => {
        console.error('[Agent API] Request error:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
        }))
      })
    })

    // Initialize WebSocket on the same server
    agentWsManager.initialize(this.server)

    // Start listening
    this.server.listen(this.config.port, this.config.host, () => {
      console.log(`[Agent API] Server running at http://${this.config.host}:${this.config.port}`)
      console.log(`[Agent API] WebSocket at ws://${this.config.host}:${this.config.port}/ws`)
    })

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Agent API] Port ${this.config.port} is already in use`)
      } else {
        console.error('[Agent API] Server error:', err)
      }
    })
  }

  getConfig(): AgentServerConfig {
    return { ...this.config }
  }

  isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  close() {
    if (this.server) {
      agentWsManager.close()
      this.server.close()
      this.server = null
      console.log('[Agent API] Server stopped')
    }
    agentController.cleanup()
  }
}

export const agentServer = new AgentServer()
