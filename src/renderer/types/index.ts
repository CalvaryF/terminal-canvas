import type { Node } from '@xyflow/react'

export interface TerminalNodeData {
  title: string
  command: string
  cwd: string
  cols: number
  rows: number
}

export type TerminalNode = Node<TerminalNodeData, 'terminal'>

declare global {
  interface Window {
    electronAPI: import('../../preload/index').ElectronAPI
  }
}
