import type { Node } from '@xyflow/react'

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

export type TerminalNode = Node<TerminalNodeData, 'terminal'>
export type TextNode = Node<TextNodeData, 'text'>
export type CanvasNode = TerminalNode | TextNode

declare global {
  interface Window {
    electronAPI: import('../../preload/index').ElectronAPI
  }
}
