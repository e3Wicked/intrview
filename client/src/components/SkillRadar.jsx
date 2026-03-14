import './SkillRadar.css'

function SkillRadar({ topics = [], size = 280 }) {
  if (!topics || topics.length < 3) {
    return (
      <div className="skill-radar">
        <p className="skill-radar-empty">Practice more topics to see your radar chart</p>
      </div>
    )
  }

  const capped = topics.slice(0, 10)
  const n = capped.length
  const center = size / 2
  const radius = size * 0.35
  const labelOffset = 18

  const getPoint = (index, value) => {
    const angle = (2 * Math.PI * index) / n - Math.PI / 2
    const dist = (value / 100) * radius
    return {
      x: center + dist * Math.cos(angle),
      y: center + dist * Math.sin(angle),
    }
  }

  const getVertex = (index) => {
    const angle = (2 * Math.PI * index) / n - Math.PI / 2
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
      angle,
    }
  }

  const rings = [0.25, 0.5, 0.75, 1.0]

  const dataPoints = capped.map((t, i) => getPoint(i, t.score))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'

  const truncateLabel = (text, maxLen = 14) => {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen - 1) + '\u2026'
  }

  const getLabelAnchor = (angle) => {
    const cos = Math.cos(angle)
    if (cos > 0.3) return 'start'
    if (cos < -0.3) return 'end'
    return 'middle'
  }

  return (
    <div className="skill-radar">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="skill-radar-svg"
      >
        {/* Concentric rings */}
        {rings.map((scale) => {
          const ringPoints = Array.from({ length: n }, (_, i) => {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2
            const dist = scale * radius
            return `${center + dist * Math.cos(angle)},${center + dist * Math.sin(angle)}`
          }).join(' ')
          return (
            <polygon
              key={scale}
              points={ringPoints}
              className="skill-radar-ring"
            />
          )
        })}

        {/* Axis lines */}
        {Array.from({ length: n }, (_, i) => {
          const v = getVertex(i)
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={v.x}
              y2={v.y}
              className="skill-radar-axis"
            />
          )
        })}

        {/* Data polygon */}
        <polygon
          points={dataPoints.map(p => `${p.x},${p.y}`).join(' ')}
          className="skill-radar-data"
        />

        {/* Score dots */}
        {dataPoints.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r={4}
            className="skill-radar-dot"
          />
        ))}

        {/* Vertex labels */}
        {capped.map((t, i) => {
          const v = getVertex(i)
          const angle = v.angle
          const lx = center + (radius + labelOffset) * Math.cos(angle)
          const ly = center + (radius + labelOffset) * Math.sin(angle)
          return (
            <text
              key={`label-${i}`}
              x={lx}
              y={ly}
              textAnchor={getLabelAnchor(angle)}
              dominantBaseline="central"
              className="skill-radar-label"
            >
              {truncateLabel(t.name)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

export default SkillRadar
