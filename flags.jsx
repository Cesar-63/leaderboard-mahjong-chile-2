// flags.jsx — Latin American nationality metadata + simplified geometric flags

const COUNTRIES = {
  CL: { code: 'CL', name: 'Chile',     demo: 'Chileno',    accent: '#d52b1e', alt: '#0039a6', ink: '#ffffff' },
  UY: { code: 'UY', name: 'Uruguay',   demo: 'Uruguayo',   accent: '#0038a8', alt: '#fcd116', ink: '#ffffff' },
  AR: { code: 'AR', name: 'Argentina', demo: 'Argentino',  accent: '#4a8fce', alt: '#f6b40e', ink: '#0a2f52' },
  PE: { code: 'PE', name: 'Perú',      demo: 'Peruano',    accent: '#d91023', alt: '#8f0a17', ink: '#ffffff' },
  BR: { code: 'BR', name: 'Brasil',    demo: 'Brasileño',  accent: '#009c3b', alt: '#ffdf00', ink: '#002776' },
  MX: { code: 'MX', name: 'México',    demo: 'Mexicano',   accent: '#006847', alt: '#ce1126', ink: '#ffffff' },
};
const COUNTRY_ORDER = ['CL', 'UY', 'AR', 'PE', 'BR', 'MX'];

// Simplified flags — geometric only, coats of arms reduced to a mark
function Flag({ nat, size = 18, className = '', title }) {
  const w = size, h = size * (2 / 3);
  const c = COUNTRIES[nat];
  const wrap = (kids) => (
    <svg className={`flag ${className}`} width={w} height={h} viewBox="0 0 24 16" role="img"
      aria-label={c ? c.name : nat} title={title || (c && c.name)}>
      {kids}
      <rect x="0.35" y="0.35" width="23.3" height="15.3" fill="none" stroke="rgba(0,0,0,.22)" strokeWidth="0.7" rx="1.2" />
    </svg>
  );
  const sun = (cx, cy, r, fill) => (
    <g fill={fill}>
      <circle cx={cx} cy={cy} r={r} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={i} cx={cx + Math.cos(a) * r * 1.75} cy={cy + Math.sin(a) * r * 1.75} r={r * 0.34} />;
      })}
    </g>
  );

  switch (nat) {
    case 'CL': return wrap(<g><rect width="24" height="8" fill="#fff" /><rect y="8" width="24" height="8" fill="#d52b1e" /><rect width="8" height="8" fill="#0039a6" /><path d="M4 1.9l.8 2.4h2.5l-2 1.5.8 2.4L4 6.7 1.9 8.2l.8-2.4-2-1.5h2.5z" fill="#fff" /></g>);
    case 'UY': return wrap(<g><rect width="24" height="16" fill="#fff" /><rect y="3.55" width="24" height="1.78" fill="#0038a8" /><rect y="7.11" width="24" height="1.78" fill="#0038a8" /><rect y="10.67" width="24" height="1.78" fill="#0038a8" /><rect y="14.22" width="24" height="1.78" fill="#0038a8" /><rect width="10" height="8.89" fill="#fff" />{sun(5, 4.4, 1.5, '#fcd116')}</g>);
    case 'AR': return wrap(<g><rect width="24" height="16" fill="#74acdf" /><rect y="5.33" width="24" height="5.33" fill="#fff" />{sun(12, 8, 1.5, '#f6b40e')}</g>);
    case 'PE': return wrap(<g><rect width="24" height="16" fill="#d91023" /><rect x="8" width="8" height="16" fill="#fff" /><circle cx="12" cy="8" r="2" fill="none" stroke="#c8102e" strokeWidth="0.9" /></g>);
    case 'BR': return wrap(<g><rect width="24" height="16" fill="#009c3b" /><path d="M12 1.8L22.2 8 12 14.2 1.8 8z" fill="#ffdf00" /><circle cx="12" cy="8" r="3.4" fill="#002776" /><path d="M8.9 6.5a6 6 0 016.2 0" fill="none" stroke="#fff" strokeWidth="0.85" /></g>);
    case 'MX': return wrap(<g><rect width="24" height="16" fill="#006847" /><rect x="8" width="8" height="16" fill="#fff" /><rect x="16" width="8" height="16" fill="#ce1126" /><circle cx="12" cy="8" r="1.9" fill="none" stroke="#8c6d2f" strokeWidth="0.9" /><circle cx="12" cy="8" r="0.7" fill="#8c6d2f" /></g>);
    default: return wrap(<rect width="24" height="16" fill="#999" />);
  }
}

function NatTag({ nat, showName = false, size = 16 }) {
  const c = COUNTRIES[nat];
  if (!c) return null;
  return (
    <span className="nat-tag" style={{ '--nat': c.accent, '--nat-alt': c.alt }}>
      <Flag nat={nat} size={size} />
      <span className="nt-code">{showName ? c.name : nat}</span>
    </span>
  );
}

Object.assign(window, { COUNTRIES, COUNTRY_ORDER, Flag, NatTag });
