import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasNodeData {
  id: string
  type: 'terminal' | 'text' | 'drawing' | 'folder'
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface CanvasEdgeData {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface CanvasData {
  viewport: CanvasViewport
  nodes: CanvasNodeData[]
  edges: CanvasEdgeData[]
}

export interface SaveFileMetadata {
  name: string
  filename: string
  savedAt: string
  nodeCount: number
}

interface SaveFile {
  version: number
  name: string
  savedAt: string
  viewport: CanvasViewport
  nodes: CanvasNodeData[]
  edges: CanvasEdgeData[]
}

class CanvasStorage {
  private storagePath: string

  constructor() {
    this.storagePath = path.join(process.env.HOME || '/', '.terminal-canvas')
    this.ensureStorageDirectory()
  }

  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true })
    }
  }

  async save(filename: string, data: CanvasData): Promise<void> {
    const sanitizedName = this.sanitizeFilename(filename)
    const filePath = path.join(this.storagePath, `${sanitizedName}.yaml`)

    const saveFile: SaveFile = {
      version: 1,
      name: filename,
      savedAt: new Date().toISOString(),
      viewport: data.viewport,
      nodes: data.nodes,
      edges: data.edges
    }

    const yamlContent = yaml.stringify(saveFile)
    await fs.promises.writeFile(filePath, yamlContent, 'utf-8')
  }

  async load(filename: string): Promise<CanvasData | null> {
    const sanitizedName = this.sanitizeFilename(filename)
    const filePath = path.join(this.storagePath, `${sanitizedName}.yaml`)

    if (!fs.existsSync(filePath)) {
      return null
    }

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      const parsed = yaml.parse(content) as SaveFile

      return {
        viewport: parsed.viewport,
        nodes: parsed.nodes,
        edges: parsed.edges
      }
    } catch (err) {
      console.error('[CanvasStorage] Failed to load:', err)
      return null
    }
  }

  async list(): Promise<SaveFileMetadata[]> {
    try {
      const files = await fs.promises.readdir(this.storagePath)
      const yamlFiles = files.filter(f => f.endsWith('.yaml'))

      const metadata: SaveFileMetadata[] = []

      for (const file of yamlFiles) {
        try {
          const filePath = path.join(this.storagePath, file)
          const content = await fs.promises.readFile(filePath, 'utf-8')
          const parsed = yaml.parse(content) as SaveFile

          metadata.push({
            name: parsed.name,
            filename: file.replace('.yaml', ''),
            savedAt: parsed.savedAt,
            nodeCount: parsed.nodes?.length || 0
          })
        } catch {
          // Skip corrupted files
        }
      }

      // Sort by savedAt descending (most recent first)
      metadata.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())

      return metadata
    } catch {
      return []
    }
  }

  async delete(filename: string): Promise<void> {
    const sanitizedName = this.sanitizeFilename(filename)
    const filePath = path.join(this.storagePath, `${sanitizedName}.yaml`)

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
    }
  }

  getStoragePath(): string {
    return this.storagePath
  }

  private sanitizeFilename(name: string): string {
    // Remove or replace characters that aren't safe for filenames
    return name
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 100)
  }
}

export const canvasStorage = new CanvasStorage()
