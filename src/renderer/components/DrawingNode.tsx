import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { DrawingNodeData } from '../types'

type DrawingNodeComponentProps = NodeProps<DrawingNodeData>

const DrawingNodeComponent = memo(function DrawingNodeComponent({
  data
}: DrawingNodeComponentProps) {
  return (
    <svg
      style={{ overflow: 'visible' }}
      width="1"
      height="1"
    >
      {/* Invisible wider hitbox for easier selection */}
      <path
        d={data.pathData}
        stroke="transparent"
        strokeWidth={14}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: 'stroke' }}
      />
      {/* Visible stroke */}
      <path
        d={data.pathData}
        stroke={data.color}
        strokeWidth={data.strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
})

export default DrawingNodeComponent
