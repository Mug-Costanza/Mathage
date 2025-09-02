import React, { useMemo, useState } from 'react';

const GraphView = ({ dailyScores = {} }) => {
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
    if (min === max) {
      const pad = Math.max(1, max * 0.1);
      min = Math.max(0, min - pad);
      max = max + pad;
    } else {
      const pad = (max - min) * 0.1;
      min = Math.max(0, min - pad);
      max = max + pad;
    }
  }

  const x = (idx) => {
    if (dates.length <= 1) return margin.left + iw / 2;
    return margin.left + (idx / (dates.length - 1)) * iw;
  };
  const y = (val) => margin.top + ((val - min) / (max - min)) * ih;

  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  // 3) Path builder (no hooks; always computed)
  const buildPath = () => {
    if (data.length === 0) return '';
    if (data.length === 1) return `M ${x(0)} ${y(data[0].time)}`;
    const pts = data.map(d => [x(d.i), y(d.time)]);
    const seg = (p0, p1, p2, p3) => {
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      return [c1x, c1y, c2x, c2y, p2[0], p2[1]];
    };
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const [c1x, c1y, c2x, c2y, x2, y2] = seg(p0, p1, p2, p3);
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
    }
    return d;
  };

  const pathD = buildPath();

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - margin.left;
    const clamped = Math.max(0, Math.min(iw, mx));
    const ratio = dates.length <= 1 ? 0 : clamped / iw;
    const idx = dates.length <= 1 ? 0 : Math.round(ratio * (dates.length - 1));
    setHover(idx);
  };

  const ticksY = 4;
  const tickVals = Array.from({ length: ticksY + 1 }, (_, i) => min + (i * (max - min) / ticksY));

  // 4) Render
  return (
    <div className="graph-container" role="figure" aria-label="Daily solve time chart">
      <h3>Daily Times (Seconds)</h3>

      {data.length === 0 ? (
        <p className="graph-empty">No runs yet.</p>
      ) : (
        <div className="line-graph-container">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* grid + y ticks */}
            {tickVals.map((tv, i) => (
              <g key={i}>
                <line
                  x1={margin.left}
                  x2={margin.left + iw}
                  y1={y(tv)}
                  y2={y(tv)}
                  className="graph-gridline"
                />
                <text x={margin.left - 8} y={y(tv)} dy="0.32em" className="graph-tick">
                  {Math.round(tv)}
                </text>
              </g>
            ))}

            {/* average line */}
            <line
              x1={margin.left}
              x2={margin.left + iw}
              y1={y(avg)}
              y2={y(avg)}
              className="graph-avg-line"
            />

            {/* area under curve */}
            <path
              d={`${pathD} L ${margin.left + iw} ${margin.top + ih} L ${margin.left} ${margin.top + ih} Z`}
              fill="url(#areaFill)"
            />

            {/* main line */}
            <path
              d={pathD}
              fill="none"
              stroke="var(--accent-color)"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

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
          </svg>
        </div>
      )}
    </div>
  );
};

export default GraphView;
