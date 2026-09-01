// app.jsx — root component for Liga Mahjong Chile dashboard

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "washi",
  "dark": false,
  "density": "regular",
  "layout": "classic",
  "lang": "es"
}/*EDITMODE-END*/;

const TABS = [
  { id: 'standings', jp: '順位表', es: 'Tabla', en: 'Standings', pt: 'Tabela' },
  { id: 'detail',    jp: '選手',   es: 'Jugador', en: 'Player', pt: 'Jogador' },
  { id: 'compare',   jp: '比較',   es: 'Comparador', en: 'Compare', pt: 'Comparar' },
  { id: 'log',       jp: '半荘',   es: 'Historial', en: 'Log', pt: 'Histórico' },
  { id: 'iormc',     jp: '代表',   es: 'IORMC', en: 'IORMC', pt: 'IORMC' },
  { id: 'calendar',  jp: '予定',   es: 'Calendario', en: 'Calendar', pt: 'Calendário' },
  { id: 'hof',       jp: '殿堂',   es: 'Records', en: 'Records', pt: 'Recordes' },
];

// tabs that are scoped to a single division
const DIV_SCOPED = ['standings', 'log'];

// ── Rutas por hash: #/<tab>/<div|jugador> ──
// Cada pestaña x división tiene su propia URL (funciona en estático, sin server).
const ROUTE_TABS = TABS.map(t => t.id);
const ROUTE_RE = /^#\/([a-z]+)(?:\/([A-Za-z0-9_!.\-]+))?/;

function parseRoute() {
  const m = window.location.hash.match(ROUTE_RE);
  let tab = m && ROUTE_TABS.includes(m[1]) ? m[1] : 'standings';
  let div = 'A';
  let playerId = null;
  if (m && m[2]) {
    const second = m[2];
    if (tab === 'detail') {
      playerId = second;
      div = second[0] === 'B' ? 'B' : 'A';
    } else if (second === 'A' || second === 'B') {
      div = second;
    } else {
      playerId = second;
    }
  }
  return { tab, div, playerId };
}

function routeToHash(tab, div, playerId) {
  const pid = playerId || (div === 'B' ? 'B01' : 'A01');
  return '#/' + (tab === 'detail' ? `detail/${pid}` : `${tab}/${div}`);
}

function TabBar({ active, onChange, lang }) {
  const refs = React.useRef({});
  const [ind, setInd] = React.useState({ left: 0, width: 0 });
  React.useLayoutEffect(() => {
    const node = refs.current[active];
    if (!node) return;
    const r = node.getBoundingClientRect();
    const p = node.parentElement.getBoundingClientRect();
    setInd({ left: r.left - p.left + node.parentElement.scrollLeft, width: r.width });
  }, [active, lang]);

  return (
    <div className="tabs">
      {TABS.map(t => (
        <button key={t.id} ref={el => (refs.current[t.id] = el)}
          className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          <span className="ji">{t.jp}</span>
          <span>{lang === 'jp' ? t.jp : lang === 'en' ? t.en : lang === 'pt' ? t.pt : t.es}</span>
        </button>
      ))}
      <div className="tab-indicator" style={{ left: ind.left, width: ind.width }} />
    </div>
  );
}

function DivisionSwitch({ div, onChange, data, disabled }) {
  const refs = React.useRef({});
  const [ind, setInd] = React.useState({ left: 0, width: 0 });
  React.useLayoutEffect(() => {
    const node = refs.current[div];
    if (!node) return;
    const r = node.getBoundingClientRect();
    const p = node.parentElement.getBoundingClientRect();
    setInd({ left: r.left - p.left, width: r.width });
  }, [div]);

  return (
    <div className={`div-switch ${disabled ? 'disabled' : ''} sel-${div}`} title={disabled ? 'Esta vista muestra ambas divisiones' : ''}>
      <div className={`ds-thumb div-${div}`} style={{ left: ind.left, width: ind.width }} />
      {['A', 'B'].map(d => {
        const leader = data.divisions[d].players[0];
        return (
          <button key={d} ref={el => (refs.current[d] = el)}
            className={`ds-btn ${div === d ? 'active' : ''}`} onClick={() => onChange(d)}>
            <span className="ds-label">{tr('division', { d })}</span>
            <span className="ds-meta">{tr('leader', { name: leader.handle })} · {fmtPts(leader.points)}</span>
          </button>
        );
      })}
    </div>
  );
}

function LangSwitch({ value, onChange }) {
  const langs = [
    { v: 'es', l: 'ES' }, { v: 'en', l: 'EN' }, { v: 'pt', l: 'PT' },
  ];
  return (
    <div className="lang-switch" role="group" aria-label={tr('idioma')}>
      {langs.map(x => (
        <button key={x.v} className={`lang-btn ${value === x.v ? 'active' : ''}`}
          onClick={() => onChange(x.v)}>{x.l}</button>
      ))}
    </div>
  );
}

function TzSwitch({ value, onChange }) {
  const sel = window.TZ_OPTIONS.find(o => o.tz === (value || 'America/Santiago')) || window.TZ_OPTIONS[0];
  return (
    <label className="lang-switch tz-switch" title={tr('timezone')}>
      <span className="tz-label">{sel.flag}</span>
      <select value={sel.tz} onChange={(e) => onChange(e.target.value)}>
        {window.TZ_OPTIONS.map(o => (
          <option key={o.tz} value={o.tz}>{o.flag} {o.city}</option>
        ))}
      </select>
    </label>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setTick(x => x + 1);
    window.addEventListener('langchange', bump);
    window.addEventListener('tzchange', bump);
    return () => { window.removeEventListener('langchange', bump); window.removeEventListener('tzchange', bump); };
  }, []);
  const [route, setRoute] = React.useState(parseRoute);
  const data = window.MJC_DATA;
  const L = data.league;
  const { tab, div, playerId } = route;

  React.useEffect(() => {
    if (!window.location.hash) window.location.hash = routeToHash(tab, div, playerId);
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next) => {
    const hash = routeToHash(next.tab ?? tab, next.div ?? div, next.playerId ?? playerId);
    if (window.location.hash !== hash) window.location.hash = hash;
    else setRoute(parseRoute());
  };

  React.useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-theme', t.theme);
    el.setAttribute('data-dark', String(!!t.dark));
    el.setAttribute('data-density', t.density);
    el.setAttribute('data-lang', window.LANG);
    el.setAttribute('data-div', div);
  }, [t.theme, t.dark, t.density, div]);

  const selectPlayer = (p) => navigate({ tab: 'detail', playerId: p.id });
  const currentPlayerId = playerId || data.divisions[div].players[0].id;
  const scoped = DIV_SCOPED.includes(tab);

  return (
    <div className="app">
      <div className="bg-canvas"></div>

      <header className="topbar">
        <div className="brand">
          <div className="crest"></div>
          <div className="wordmark">
            <div className="l1">{tr('app_title')}</div>
            <div className="l2">{tr('app_tagline')} · 麻雀リーグ</div>
          </div>
        </div>
        <div className="meta">
          <span><b>2</b> {tr('divisiones')}</span>
          <span><b>{L.playersPerDiv * 2}</b> {tr('jugadores')}</span>
          <span><b>{L.sessionsPlayed}</b>/{L.sessionsTotal} {tr('sesiones_noun')}</span>
          <span><b>{L.hanchanTotal}</b> {tr('hanchan')}</span>
        </div>
        <div className="live-pill">
          <span className="dot"></span>
          <span>{tr('official_data')}</span>
        </div>
        <LangSwitch value={window.LANG} onChange={(v) => setLang(v)} />
        <TzSwitch value={window.TZ} onChange={(v) => setTZ(v)} />
      </header>

      <div className="control-bar">
        <DivisionSwitch div={div} onChange={(d) => navigate({ div: d })} data={data} disabled={!scoped} />
        <TabBar active={tab} onChange={(id) => navigate({ tab: id })} lang={window.LANG} />
      </div>

      <main className="main">
        {tab === 'standings' && (
          <React.Fragment>
            <div className="section-head">
              <div className="h-left">
                <span className="num">01 / Liga</span>
                <h1>{tr('standings_title', { div })}</h1>
                <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>順位表</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>
                <div>{tr('session_summary', { played: L.sessionsPlayed, total: L.sessionsTotal, per: L.hanchanPerSession })}</div>
                <div style={{ color: 'var(--ink-faint)' }}>
                  uma {L.rules[div].uma.map(v => v >= 0 ? `+${v}` : `−${Math.abs(v)}`).join(' / ')}
                </div>
              </div>
            </div>
            <StandingsView data={data} div={div} layout={t.layout} onSelectPlayer={selectPlayer} />
          </React.Fragment>
        )}
        {tab === 'detail' && <PlayerDetail playerId={currentPlayerId} data={data} onPick={(id) => navigate({ playerId: id })} />}
        {tab === 'compare' && <Comparator data={data} />}
        {tab === 'log' && <HanchanLog data={data} div={div} />}
        {tab === 'iormc' && <IORMCView data={data} onPick={selectPlayer} />}
        {tab === 'calendar' && <CalendarView data={data} />}
        {tab === 'hof' && <HallOfFame data={data} />}
      </main>

      <TweaksPanel title={tr('tweaks_title')}>
        <TweakSection label={tr('tema')} />
        <TweakRadio label={tr('estilo')} value={t.theme}
          options={[{ value: 'washi', label: 'Washi' }, { value: 'neon', label: 'Neon' }]}
          onChange={(v) => setTweak('theme', v)} />
        <TweakToggle label={tr('oscuro')} value={t.dark} onChange={(v) => setTweak('dark', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label={tr('disposicion_str')} value={t.layout}
          options={[{ value: 'classic', label: tr('clasico') }, { value: 'stacked', label: tr('apilado') }, { value: 'split', label: tr('doble') }]}
          onChange={(v) => setTweak('layout', v)} />
        <TweakRadio label={tr('densidad')} value={t.density}
          options={[{ value: 'compact', label: tr('compacta') }, { value: 'regular', label: tr('normal') }, { value: 'comfy', label: tr('amplia') }]}
          onChange={(v) => setTweak('density', v)} />
        <TweakSection label={tr('idioma')} />
        <TweakRadio label={tr('display')} value={window.LANG}
          options={[
            { value: 'es', label: 'ES · Español' },
            { value: 'en', label: 'EN · English' },
            { value: 'pt', label: 'PT · Português (BR)' },
          ]}
          onChange={(v) => setLang(v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
