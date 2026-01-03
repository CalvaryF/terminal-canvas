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

export interface FolderNodeData {
  folderPath: string
  files: FileInfo[]
  isWatching: boolean
}

export type TerminalNode = Node<TerminalNodeData, 'terminal'>
export type TextNode = Node<TextNodeData, 'text'>
export type DrawingNode = Node<DrawingNodeData, 'drawing'>
export type FolderNode = Node<FolderNodeData, 'folder'>
export type CanvasNode = TerminalNode | TextNode | DrawingNode | FolderNode

declare global {
  interface Window {
    electronAPI: import('../../preload/index').ElectronAPI
  }
}
