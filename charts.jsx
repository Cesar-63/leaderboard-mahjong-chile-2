// charts.jsx — small chart helpers for the dashboard

function Sparkline({ values, color, width = 80, height = 22 }) {
  const useColor = color || 'var(--accent)';
  if (!values || values.length === 0) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const last = pts[pts.length - 1];

  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const len = ref.current.getTotalLength();
    ref.current.style.setProperty('--len', len);
    ref.current.style.strokeDasharray = len;
    ref.current.style.strokeDashoffset = len;
    ref.current.getBoundingClientRect();
    ref.current.style.transition = 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)';
    ref.current.style.strokeDashoffset = 0;
  }, []);

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path ref={ref} d={d} fill="none" stroke={useColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={useColor} />
    </svg>
  );
}

function RadarChart({ stats, color = 'var(--accent)', size = 280 }) {
  // stats: [{label, value: 0..1, jp}]
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.38;
  const N = stats.length;
  const angleAt = (i) => -Math.PI / 2 + (i / N) * Math.PI * 2;

  const ring = (rFrac) => {
    return stats.map((_, i) => {
      const a = angleAt(i);
      return `${cx + Math.cos(a) * radius * rFrac},${cy + Math.sin(a) * radius * rFrac}`;
    }).join(' ');
  };

  const dataPoints = stats.map((s, i) => {
    const a = angleAt(i);
    const r = radius * s.value;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  const dataPolygon = dataPoints.map(p => `${p[0]},${p[1]}`).join(' ');

  const labelPoints = stats.map((_, i) => {
    const a = angleAt(i);
    return [cx + Math.cos(a) * (radius + 24), cy + Math.sin(a) * (radius + 24)];
  });

  const ref = React.useRef(null);
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setShow(true), 60);
    return () => clearTimeout(t);
  }, []);

  const padV = 28;
  return (
    <svg ref={ref} className="radar-svg" viewBox={`-12 ${-padV} ${size + 24} ${size + padV * 2}`}>
      {/* rings */}
      {[0.25, 0.5, 0.75, 1].map((r, i) => (
        <polygon key={i} points={ring(r)} fill="none" stroke="var(--line)" strokeWidth="1" />
      ))}
      {/* spokes */}
      {stats.map((s, i) => {
        const a = angleAt(i);
        return (
          <line key={i}
            x1={cx} y1={cy}
            x2={cx + Math.cos(a) * radius} y2={cy + Math.sin(a) * radius}
            stroke="var(--line)" strokeWidth="1"
          />
        );
      })}
      {/* data */}
      <polygon
        points={dataPolygon}
        fill={color} fillOpacity="0.18"
        stroke={color} strokeWidth="2"
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          transform: show ? 'scale(1)' : 'scale(0)',
          transition: 'transform .8s cubic-bezier(.4,0,.2,1)',
        }}
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color}
          style={{
            opacity: show ? 1 : 0,
            transition: `opacity .3s ${0.3 + i * 0.06}s`,
          }}
        />
      ))}
      {/* labels */}
      {stats.map((s, i) => {
        const [x, y] = labelPoints[i];
        return (
          <g key={i}>
            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontFamily="var(--font-mono)" fontSize="10"
              letterSpacing="0.06em" fill="var(--ink-soft)"
              style={{ textTransform: 'uppercase' }}
            >
              {s.label}
            </text>
            <text x={x} y={y + 12} textAnchor="middle" dominantBaseline="middle"
              fontFamily="var(--font-mono)" fontSize="11" fontWeight="700"
              fill="var(--ink)"
            >
              {s.display}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ values, height = 220, color = 'var(--accent)' }) {
  const width = 600;
  const padL = 36, padR = 16, padT = 16, padB = 26;
  if (!values || values.length === 0) return null;
  const min = Math.min(...values, 0), max = Math.max(...values, 0);
  const range = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = padL + (i / (values.length - 1)) * (width - padL - padR);
    const y = padT + (1 - (v - min) / range) * (height - padT - padB);
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${d} L${pts[pts.length - 1][0]},${height - padB} L${pts[0][0]},${height - padB} Z`;
  const zeroY = padT + (1 - (0 - min) / range) * (height - padT - padB);

  const strokeRef = React.useRef(null);
  React.useEffect(() => {
    if (!strokeRef.current) return;
    const len = strokeRef.current.getTotalLength();
    strokeRef.current.style.strokeDasharray = len;
    strokeRef.current.style.strokeDashoffset = len;
    strokeRef.current.getBoundingClientRect();
    strokeRef.current.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)';
    strokeRef.current.style.strokeDashoffset = 0;
  }, [values]);

  const yTicks = [min, (min + max) / 2, max].map(t => Math.round(t));

  return (
    <svg className="line-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {/* grid */}
      {yTicks.map((t, i) => {
        const y = padT + (1 - (t - min) / range) * (height - padT - padB);
        return (
          <g key={i}>
            <line className="grid" x1={padL} y1={y} x2={width - padR} y2={y} />
            <text className="axis-label" x={padL - 8} y={y + 4} textAnchor="end">{t}</text>
          </g>
        );
      })}
      <line className="axis" x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} strokeWidth="1.5" />
      {/* area */}
      <path className="area" d={area} fill={color} />
      <path ref={strokeRef} className="stroke" d={d} stroke={color} />
      {/* points */}
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={color} opacity={i === pts.length - 1 ? 1 : 0.45} />
      ))}
      <circle className="point" cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={color} />
      {/* x label */}
      <text className="axis-label" x={padL} y={height - 6}>H1</text>
      <text className="axis-label" x={width - padR} y={height - 6} textAnchor="end">H{values.length}</text>
    </svg>
  );
}

Object.assign(window, { Sparkline, RadarChart, LineChart });
