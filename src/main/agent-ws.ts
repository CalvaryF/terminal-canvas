import { WebSocket, WebSocketServer } from 'ws'
import { IncomingMessage } from 'http'
import {
  WsClientMessage,
  WsServerMessage,
  WsServerMessageType,
  TerminalOutputPayload,
  TerminalExitPayload,
  NodeEventPayload,
  EdgeEventPayload,
  FileEventPayload,
  CanvasNode,
  Edge,
  FileInfo
} from '../shared/agent-types'

interface Subscription {
  ws: WebSocket
  channel: string
}

export class AgentWebSocketManager {
  private wss: WebSocketServer | null = null
  private subscriptions = new Map<string, Set<WebSocket>>() // channel -> Set of WebSocket clients
  private clientSubscriptions = new WeakMap<WebSocket, Set<string>>() // ws -> Set of channels

  initialize(server: import('http').Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' })

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('[Agent WS] Client connected')
      this.clientSubscriptions.set(ws, new Set())

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WsClientMessage
          this.handleMessage(ws, message)
        } catch (err) {
          this.sendError(ws, 'system', 'Invalid message format')
        }
      })

      ws.on('close', () => {
        console.log('[Agent WS] Client disconnected')
        this.cleanupClient(ws)
      })

      ws.on('error', (err) => {
        console.error('[Agent WS] WebSocket error:', err)
        this.cleanupClient(ws)
      })
    })

    console.log('[Agent WS] WebSocket server initialized')
  }

  private handleMessage(ws: WebSocket, message: WsClientMessage) {
    switch (message.type) {
      case 'subscribe':
        this.subscribe(ws, message.channel)
        break
      case 'unsubscribe':
        this.unsubscribe(ws, message.channel)
        break
      case 'ping':
        this.send(ws, 'pong', 'system', {})
        break
      default:
        this.sendError(ws, 'system', `Unknown message type: ${(message as WsClientMessage).type}`)
    }
  }

  private subscribe(ws: WebSocket, channel: string) {
    // Add to channel subscriptions
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set())
    }
    this.subscriptions.get(channel)!.add(ws)

    // Track client's subscriptions
    const clientChannels = this.clientSubscriptions.get(ws)
    if (clientChannels) {
      clientChannels.add(channel)
    }

    this.send(ws, 'subscribed', channel, { channel })
    console.log(`[Agent WS] Client subscribed to ${channel}`)
  }

  private unsubscribe(ws: WebSocket, channel: string) {
    const channelSubs = this.subscriptions.get(channel)
    if (channelSubs) {
      channelSubs.delete(ws)
      if (channelSubs.size === 0) {
        this.subscriptions.delete(channel)
      }
    }

    const clientChannels = this.clientSubscriptions.get(ws)
    if (clientChannels) {
      clientChannels.delete(channel)
    }

    this.send(ws, 'unsubscribed', channel, { channel })
    console.log(`[Agent WS] Client unsubscribed from ${channel}`)
  }

  private cleanupClient(ws: WebSocket) {
    const clientChannels = this.clientSubscriptions.get(ws)
    if (clientChannels) {
      for (const channel of clientChannels) {
        const channelSubs = this.subscriptions.get(channel)
        if (channelSubs) {
          channelSubs.delete(ws)
          if (channelSubs.size === 0) {
            this.subscriptions.delete(channel)
          }
        }
      }
    }
    this.clientSubscriptions.delete(ws)
  }

  private send(ws: WebSocket, type: WsServerMessageType, channel: string, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      const message: WsServerMessage = {
        type,
        channel,
        payload,
        timestamp: Date.now()
      }
      ws.send(JSON.stringify(message))
    }
  }

  private sendError(ws: WebSocket, channel: string, message: string) {
    this.send(ws, 'error', channel, { message })
  }

  private broadcast(channel: string, type: WsServerMessageType, payload: unknown) {
    const subscribers = this.subscriptions.get(channel)
    if (!subscribers || subscribers.size === 0) return

    const message: WsServerMessage = {
      type,
      channel,
      payload,
      timestamp: Date.now()
    }
    const data = JSON.stringify(message)

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    }
  }

  // ============================================================
  // Terminal Events
  // ============================================================

  notifyTerminalOutput(nodeId: string, data: string) {
    const channel = `terminal:${nodeId}:output`
    const payload: TerminalOutputPayload = { data }
    this.broadcast(channel, 'data', payload)
  }

  notifyTerminalExit(nodeId: string, exitCode: number) {
    const channel = `terminal:${nodeId}:exit`
    const payload: TerminalExitPayload = { exitCode }
    this.broadcast(channel, 'event', payload)
  }

  // ============================================================
  // Canvas Events
  // ============================================================

  notifyNodeAdded(node: CanvasNode) {
    const payload: NodeEventPayload = { action: 'add', node }
    this.broadcast('canvas:nodes', 'event', payload)
  }

  notifyNodeUpdated(node: CanvasNode) {
    const payload: NodeEventPayload = { action: 'update', node }
    this.broadcast('canvas:nodes', 'event', payload)
  }

  notifyNodeRemoved(node: CanvasNode) {
    const payload: NodeEventPayload = { action: 'remove', node }
    this.broadcast('canvas:nodes', 'event', payload)
  }

  notifyEdgeAdded(edge: Edge) {
    const payload: EdgeEventPayload = { action: 'add', edge }
    this.broadcast('canvas:edges', 'event', payload)
  }

  notifyEdgeRemoved(edge: Edge) {
    const payload: EdgeEventPayload = { action: 'remove', edge }
    this.broadcast('canvas:edges', 'event', payload)
  }

  // ============================================================
  // Folder Events
  // ============================================================

  notifyFileAdded(nodeId: string, file: FileInfo) {
    const channel = `folder:${nodeId}:files`
    const payload: FileEventPayload = { action: 'add', file }
    this.broadcast(channel, 'event', payload)
  }

  notifyFileRemoved(nodeId: string, file: FileInfo) {
    const channel = `folder:${nodeId}:files`
    const payload: FileEventPayload = { action: 'remove', file }
    this.broadcast(channel, 'event', payload)
  }

  // ============================================================
  // Utility
  // ============================================================

  getSubscriberCount(channel: string): number {
    return this.subscriptions.get(channel)?.size || 0
  }

  hasSubscribers(channel: string): boolean {
    return this.getSubscriberCount(channel) > 0
  }

  close() {
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }
    this.subscriptions.clear()
  }
}

export const agentWsManager = new AgentWebSocketManager()
