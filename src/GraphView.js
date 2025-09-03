import React, { useMemo, useState } from 'react';

const GraphView = ({ dailyScores = {}, bestScoreDate }) => {
  // 1) Hooks at the top, always called
  const dates = useMemo(() => Object.keys(dailyScores).sort(), [dailyScores]);

  const data = useMemo(() => {
    return dates.map((d, i) => {
      const y = parseInt(d.slice(0, 4), 10);
      const m = parseInt(d.slice(4, 6), 10) - 1;
      const day = parseInt(d.slice(6, 8), 10);
      return {
        date: d,
        i,
        label: new Date(y, m, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        time: Math.max(0, Number(dailyScores[d]?.time ?? 0)),
      };
    });
  }, [dates, dailyScores]);

  const [hover, setHover] = useState(null);

  // 2) Layout + scales
  const width = 500;
  const height = 220;
  const margin = { top: 12, right: 40, bottom: 28, left: 44 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;

  const times = data.map(d => d.time);

  let min = 0, max = 1; // safe defaults for empty state
  if (times.length) {
    min = Math.min(...times);
    max = Math.max(...times);
  }

  const getScale = (min, max, length) => (val) => {
    const diff = max - min;
    if (diff === 0) return length / 2;
    return (length * (val - min)) / diff;
  };

  const x = getScale(0, data.length - 1, iw);
  const y = getScale(min, max, ih);

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const avgLineY = y(avg);

  const d = data.length < 2 ? '' : `M${data.map(d => `${x(d.i)},${y(d.time)}`).join('L')}`;

  const bestDataPoint = data.find(p => p.date === bestScoreDate);

  return (
    <div className="graph-container" onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = e.clientX - rect.left - margin.left;
          const closestIndex = Math.round(mouseX / x(1));
          if (closestIndex >= 0 && closestIndex < data.length) {
            setHover(closestIndex);
          }
        }}
      >
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          {/* y axis */}
          <line x1={-3} x2={-3} y1={0} y2={ih} className="graph-axis" />
          <text x={-6} y={y(min)} className="graph-tick" dominantBaseline="middle" textAnchor="end">
            {Math.round(min)}s
          </text>
          <text x={-6} y={y(max)} className="graph-tick" dominantBaseline="middle" textAnchor="end">
            {Math.round(max)}s
          </text>

          {/* x axis */}
          <line x1={0} x2={iw} y1={ih + 3} y2={ih + 3} className="graph-axis" />

          {/* avg line */}
          <line x1={0} x2={iw} y1={avgLineY} y2={avgLineY} className="graph-avg-line" />
          <text x={iw + 4} y={avgLineY} className="graph-tick" dominantBaseline="middle">
            Avg: {Math.round(avg)}s
          </text>

          {/* line */}
          <path d={d} className="graph-line" />

          {/* points */}
          {data.map(d => (
            <circle
              key={d.date}
              cx={x(d.i)}
              cy={y(d.time)}
              r={hover === d.i ? 4 : 3}
              className="graph-point"
            />
          ))}

          {/* highlight best point */}
          {bestDataPoint && (
              <circle
                cx={x(bestDataPoint.i)}
                cy={y(bestDataPoint.time)}
                r={6}
                className="graph-best-point"
              />
          )}

          {/* sparse x labels */}
          {[0, Math.floor((dates.length - 1) / 2), dates.length - 1]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map(idx => (
              <text
                key={idx}
                x={x(idx)}
                y={height - 6}
                textAnchor={idx === 0 ? 'start' : idx === dates.length - 1 ? 'end' : 'middle'}
                className="graph-tick"
              >
                {data[idx].label}
              </text>
            ))}

          {/* tooltip */}
          {hover != null && (
            <g className="graph-tooltip" transform={`translate(${x(hover)}, ${y(data[hover].time)})`}>
              <circle r="22" className="graph-tooltip-bg" />
              <text y="-2" textAnchor="middle" className="graph-tooltip-title">
                {data[hover].label}
              </text>
              <text y="12" textAnchor="middle" className="graph-tooltip-value">
                {Math.round(data[hover].time)}s
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};

export default GraphView;
