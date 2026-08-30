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
            <span className="ds-label">División {d}</span>
            <span className="ds-meta">Líder {leader.handle} · {fmtPts(leader.points)}</span>
          </button>
        );
      })}
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = React.useState('standings');
  const [div, setDiv] = React.useState('A');
  const [playerId, setPlayerId] = React.useState(null);
  const data = window.MJC_DATA;
  const L = data.league;

  React.useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-theme', t.theme);
    el.setAttribute('data-dark', String(!!t.dark));
    el.setAttribute('data-density', t.density);
    el.setAttribute('data-lang', t.lang);
    el.setAttribute('data-div', div);
  }, [t.theme, t.dark, t.density, t.lang, div]);

  const selectPlayer = (p) => { setPlayerId(p.id); setTab('detail'); };
  const currentPlayerId = playerId || data.divisions[div].players[0].id;
  const scoped = DIV_SCOPED.includes(tab);

  return (
    <div className="app">
      <div className="bg-canvas"></div>

      <header className="topbar">
        <div className="brand">
          <div className="crest"></div>
          <div className="wordmark">
            <div className="l1">Liga Mahjong Chile</div>
            <div className="l2">Riichi · Temporada 2026 · 麻雀リーグ</div>
          </div>
        </div>
        <div className="meta">
          <span><b>2</b> divisiones</span>
          <span><b>{L.playersPerDiv * 2}</b> jugadores</span>
          <span><b>{L.sessionsPlayed}</b>/{L.sessionsTotal} sesiones</span>
          <span><b>{L.hanchanTotal}</b> hanchan</span>
        </div>
        <div className="live-pill">
          <span className="dot"></span>
          <span>DATOS OFICIALES</span>
        </div>
      </header>

      <div className="control-bar">
        <DivisionSwitch div={div} onChange={setDiv} data={data} disabled={!scoped} />
        <TabBar active={tab} onChange={setTab} lang={t.lang} />
      </div>

      <main className="main">
        {tab === 'standings' && (
          <React.Fragment>
            <div className="section-head">
              <div className="h-left">
                <span className="num">01 / Liga</span>
                <h1>Clasificación División {div}</h1>
                <span className="jp" style={{ fontFamily: 'var(--font-jp)' }}>順位表</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'right' }}>
                <div>Sesión {L.sessionsPlayed} de {L.sessionsTotal} · {L.hanchanPerSession} hanchan por sesión</div>
                <div style={{ color: 'var(--ink-faint)' }}>
                  uma {L.rules[div].uma.map(v => v >= 0 ? `+${v}` : `−${Math.abs(v)}`).join(' / ')}
                </div>
              </div>
            </div>
            <StandingsView data={data} div={div} layout={t.layout} onSelectPlayer={selectPlayer} />
          </React.Fragment>
        )}
        {tab === 'detail' && <PlayerDetail playerId={currentPlayerId} data={data} onPick={setPlayerId} />}
        {tab === 'compare' && <Comparator data={data} />}
        {tab === 'log' && <HanchanLog data={data} div={div} />}
        {tab === 'iormc' && <IORMCView data={data} onPick={selectPlayer} />}
        {tab === 'calendar' && <CalendarView data={data} />}
        {tab === 'hof' && <HallOfFame data={data} />}
      </main>

      <TweaksPanel>
        <TweakSection label="Tema" />
        <TweakRadio label="Estilo" value={t.theme}
          options={[{ value: 'washi', label: 'Washi' }, { value: 'neon', label: 'Neon' }]}
          onChange={(v) => setTweak('theme', v)} />
        <TweakToggle label="Modo oscuro" value={t.dark} onChange={(v) => setTweak('dark', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Disposición" value={t.layout}
          options={[{ value: 'classic', label: 'Clásico' }, { value: 'stacked', label: 'Apilado' }, { value: 'split', label: 'Doble' }]}
          onChange={(v) => setTweak('layout', v)} />
        <TweakRadio label="Densidad" value={t.density}
          options={[{ value: 'compact', label: 'Compacta' }, { value: 'regular', label: 'Normal' }, { value: 'comfy', label: 'Amplia' }]}
          onChange={(v) => setTweak('density', v)} />
        <TweakSection label="Idioma" />
        <TweakRadio label="Display" value={t.lang}
          options={[
            { value: 'es', label: 'ES · Español' },
            { value: 'en', label: 'EN · English' },
            { value: 'pt', label: 'PT · Português (BR)' },
            { value: 'jp', label: 'JP · 日本語' },
          ]}
          onChange={(v) => setTweak('lang', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
