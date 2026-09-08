// tiles.jsx — fichas de mahjong para el detalle de manos ganadas.
//
// La notación es la del paipu: "3m" (man), "7p" (pin), "2s" (sou) y "1z".."7z"
// para los honores (東南西北白發中, en ese orden). El cinco rojo llega como
// "0m"/"0p"/"0s" y se dibuja como un 5 en rojo.
//
// La cara sale de `tile-art.js` (set FluffyStuff, dominio público): sólo el
// dibujo, sobre fondo transparente. El cuerpo de la ficha —marfil, borde,
// sombra— lo pone el CSS de .mj-tile. Si una cara falta, TileFace cae a una
// ficha tipográfica (número + palo) para no dejar el hueco en blanco.

const TILE_SUIT = { m: '萬', p: '筒', s: '索' };
const TILE_HONOR = { '1z': '東', '2z': '南', '3z': '西', '4z': '北', '5z': '白', '6z': '發', '7z': '中' };
// Nombre legible para el tooltip y para los lectores de pantalla.
const TILE_SUIT_NAME = { m: 'man', p: 'pin', s: 'sou' };
const TILE_HONOR_NAME = { '1z': 'Este', '2z': 'Sur', '3z': 'Oeste', '4z': 'Norte', '5z': 'Haku', '6z': 'Hatsu', '7z': 'Chun' };

function parseTile(code) {
  const raw = String(code || '');
  const num = raw[0], suit = raw[1];
  return { num: num === '0' ? '5' : num, suit, red: num === '0', honor: suit === 'z', code: raw };
}

function tileLabel(code) {
  const t = parseTile(code);
  if (t.honor) return TILE_HONOR_NAME[t.code] || t.code;
  return `${t.num} ${TILE_SUIT_NAME[t.suit] || t.suit}${t.red ? ' rojo' : ''}`;
}

// El SVG se convierte a data URI una sola vez por ficha: son 37 y se repiten
// en cada mano, así que no vale la pena rehacerlo en cada render.
const TILE_ART_URI = {};
function tileArt(code) {
  if (!(code in TILE_ART_URI)) {
    const svg = (window.TILE_ART || {})[code];
    TILE_ART_URI[code] = svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null;
  }
  return TILE_ART_URI[code];
}

function TileFace({ code }) {
  const art = tileArt(code);
  if (art) return <img className="mj-face" src={art} alt="" draggable="false" />;
  // Sin arte para esta ficha: número y palo, que igual se lee.
  const t = parseTile(code);
  if (t.honor) return <span className={`mj-honor h-${t.code}`}>{TILE_HONOR[t.code] || t.code}</span>;
  return (
    <React.Fragment>
      <span className="mj-num">{t.num}</span>
      <span className="mj-suit">{TILE_SUIT[t.suit] || t.suit}</span>
    </React.Fragment>
  );
}

// `size` es opcional a propósito: sin él manda el CSS, que es quien sabe si
// estamos en un teléfono. Fijarlo inline acá pisaría la media query.
function Tile({ code, size, state = '', title }) {
  const t = parseTile(code);
  const clases = ['mj-tile', `suit-${t.suit}`, `tile-${t.code}`, t.red ? 'red' : '', state].filter(Boolean).join(' ');
  return (
    <span className={clases} style={size ? { '--tile-w': `${size}px` } : undefined}
      title={title || tileLabel(code)} role="img" aria-label={tileLabel(code)}>
      <TileFace code={code} />
    </span>
  );
}

// Un meld llega codificado por el parser: letra + fichas ("k6z6z6z").
// k = pon, s = chi, g = kan abierto, a = kan cerrado (ver MELD_PREFIX en
// scripts/majsoul.py). El kan cerrado se muestra con las dos de los extremos
// dadas vuelta, que es como se declara en la mesa.
const MELD_KIND = { k: 'pon', s: 'chi', g: 'kan', a: 'ankan' };

const TILE_ORDER = { m: 0, p: 1, s: 2, z: 3 };

function parseMeld(raw) {
  const texto = String(raw || '');
  const kind = MELD_KIND[texto[0]] || 'meld';
  let tiles = texto.slice(1).match(/.{2}/g) || [];
  // El paipu pone primero la ficha llamada ("shunzi(2m,4m,3m)"): para mostrar
  // la escalera se ordena, que es como se ve en la mesa.
  if (kind === 'chi') {
    // El 0 es el cinco rojo: ordena como 5, no como 0.
    const orden = (t) => TILE_ORDER[t[1]] * 10 + (t[0] === '0' ? 5 : Number(t[0]));
    tiles = [...tiles].sort((a, b) => orden(a) - orden(b));
  }
  return { kind, tiles };
}

function Meld({ meld, size }) {
  const { kind, tiles } = parseMeld(meld);
  return (
    <span className={`mj-meld ${kind}`}>
      {tiles.map((code, i) => (
        <Tile key={i} code={code} size={size}
          state={kind === 'ankan' && (i === 0 || i === tiles.length - 1) ? 'back' : ''} />
      ))}
    </span>
  );
}

// Mano completa: parte oculta, ficha ganadora separada, y los melds al final.
function HandTiles({ hand, win, melds = [], size }) {
  const ocultas = String(hand || '').match(/.{2}/g) || [];
  return (
    <div className="mj-hand">
      <span className="mj-group">
        {ocultas.map((code, i) => <Tile key={i} code={code} size={size} />)}
      </span>
      {win && (
        <span className="mj-group win">
          <Tile code={win} size={size} state="win" title={`${tileLabel(win)} · ${tr('hand_winning_tile')}`} />
        </span>
      )}
      {melds.map((meld, i) => <Meld key={i} meld={meld} size={size} />)}
    </div>
  );
}

Object.assign(window, { Tile, Meld, HandTiles, parseTile, parseMeld, tileLabel });
