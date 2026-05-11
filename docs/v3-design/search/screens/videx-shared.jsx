// videx-shared.jsx — tokens, helpers, content data, primitives
// All shared across the 3 directions so each direction file stays focused on layout.

// ─────────────────────────────────────────────────────────────
// Brand tokens (lifted from src/styles/globals.css)
// ─────────────────────────────────────────────────────────────
const VX = {
  // Core dark
  bg: '#0a0a0f',
  bgElev: '#111118',
  card: '#161620',
  cardSoft: '#1e1e2a',
  border: 'rgba(255,255,255,0.08)',
  borderSoft: 'rgba(255,255,255,0.04)',

  // Text
  fg: '#f0f0f5',
  fgMuted: '#8888a0',
  fgDim: 'rgba(240,240,245,0.55)',

  // Brand
  primary: '#e85d25',
  primaryFg: '#ffffff',
  primarySoft: 'rgba(232,93,37,0.16)',
  primaryEdge: 'rgba(232,93,37,0.45)',

  // Atmosphere accents (taste-derived)
  accentPlum: '#a16ed4',
  accentTeal: '#3fb6a1',
  accentGold: '#e3b04b',
  accentRose: '#e16b8c',
  accentBlue: '#5b8def',
  accentSage: '#7fb37b',

  // Service colors (utility tints, not full brand colors)
  netflix: '#e50914',
  prime: '#00a8e1',
  apple: '#ffffff',
  disney: '#1f80e0',
  bbc: '#ff4d3a',
  itvx: '#dcfb46',
  channel4: '#aaff00',
  paramount: '#0064ff',
  now: '#00d6c0',
  skygo: '#0072e2',

  // Type
  fontUI: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  fontDisplay: '"Fraunces", Georgia, "Times New Roman", serif',
  fontMono: '"JetBrains Mono", ui-monospace, monospace',

  // Radii
  rXs: 6, rSm: 10, rMd: 14, rLg: 20, rXl: 28,
};

// Inject a font import once
if (typeof document !== 'undefined' && !document.getElementById('vx-fonts')) {
  const link = document.createElement('link');
  link.id = 'vx-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,800;9..144,900&family=JetBrains+Mono:wght@400;500&display=swap';
  document.head.appendChild(link);

  const css = document.createElement('style');
  css.id = 'vx-css';
  css.textContent = `
    .vx-no-scrollbar::-webkit-scrollbar{display:none}
    .vx-no-scrollbar{scrollbar-width:none;-ms-overflow-style:none}
    .vx-shimmer{background:linear-gradient(90deg,transparent 0,rgba(255,255,255,0.04) 50%,transparent 100%);background-size:200% 100%;animation:vxShimmer 2.4s linear infinite}
    @keyframes vxShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @keyframes vxFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
    @keyframes vxPulse{0%,100%{opacity:.85}50%{opacity:1}}
    .vx-hover-lift{transition:transform .35s cubic-bezier(.2,.7,.3,1),box-shadow .35s}
    .vx-hover-lift:hover{transform:translateY(-3px)}
    .vx-press{transition:transform .15s ease}
    .vx-press:active{transform:scale(.96)}
    .vx-fade-in{animation:vxFade .4s ease both}
    @keyframes vxFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes vxSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  `;
  document.head.appendChild(css);
}

// ─────────────────────────────────────────────────────────────
// Streaming services — use the imported PNGs from /assets
// ─────────────────────────────────────────────────────────────
const SERVICES = {
  netflix:   { name: 'Netflix',     logo: 'assets/netflix.png',   tint: '#e50914' },
  prime:     { name: 'Prime Video', logo: 'assets/prime.png',     tint: '#00a8e1' },
  apple:     { name: 'Apple TV+',   logo: 'assets/apple.png',     tint: '#ffffff' },
  disney:    { name: 'Disney+',     logo: 'assets/disney.png',    tint: '#1f80e0' },
  bbc:       { name: 'iPlayer',     logo: 'assets/bbc.png',       tint: '#ff4d3a', free: true },
  itvx:      { name: 'ITVX',        logo: 'assets/itvx.png',      tint: '#dcfb46', free: true },
  channel4:  { name: 'Channel 4',   logo: 'assets/channel4.png',  tint: '#aaff00', free: true },
  paramount: { name: 'Paramount+',  logo: 'assets/paramount.png', tint: '#0064ff' },
  now:       { name: 'NOW',         logo: 'assets/now.png',       tint: '#00d6c0' },
  skygo:     { name: 'Sky Go',      logo: 'assets/skygo.png',     tint: '#0072e2' },
};

// ─────────────────────────────────────────────────────────────
// Sample content — TMDB-style posters via picsum-fallback URLs
// We use stable Unsplash topic urls so previews look real.
// ─────────────────────────────────────────────────────────────
const POSTER = (seed, w = 400, h = 600) =>
  `https://picsum.photos/seed/vx-${seed}/${w}/${h}`;
const BACKDROP = (seed, w = 1200, h = 700) =>
  `https://picsum.photos/seed/vxb-${seed}/${w}/${h}`;

// Hand-picked content list with believable metadata.
const CONTENT = [
  // Cinematic / prestige
  { id:'1', t:'The Hollow Crown',          y:2025, r:8.7, type:'tv',    g:'Period drama',    svc:['bbc','itvx'],            cost:'free', runtime:58, lang:'en' },
  { id:'2', t:'Atlas of the Stars',        y:2025, r:8.4, type:'movie', g:'Sci-fi',          svc:['netflix','apple'],       cost:'sub',  runtime:142, lang:'en' },
  { id:'3', t:'Slow Light',                y:2024, r:8.9, type:'movie', g:'Drama',           svc:['apple'],                 cost:'sub',  runtime:118, lang:'en' },
  { id:'4', t:'Midnight Lagoon',           y:2025, r:7.9, type:'tv',    g:'Crime',           svc:['disney','prime'],        cost:'sub',  runtime:46, lang:'en' },
  { id:'5', t:'Eastbound & Down',          y:2024, r:8.2, type:'tv',    g:'Comedy',          svc:['now','prime'],           cost:'sub',  runtime:30, lang:'en' },
  { id:'6', t:'A Quiet Heresy',            y:2025, r:9.1, type:'movie', g:'Thriller',        svc:['mubi','apple'],          cost:'rent', runtime:128, lang:'en' },
  { id:'7', t:'The Salt Garden',           y:2025, r:8.0, type:'movie', g:'Romance',         svc:['netflix'],               cost:'sub',  runtime:104, lang:'en' },
  { id:'8', t:'Concrete Sky',              y:2024, r:7.6, type:'tv',    g:'Documentary',     svc:['bbc'],                   cost:'free', runtime:54, lang:'en' },
  { id:'9', t:'Helium',                    y:2025, r:8.5, type:'movie', g:'Sci-fi',          svc:['prime','apple'],         cost:'sub',  runtime:117, lang:'en' },
  { id:'10', t:'Northing & Easting',       y:2025, r:8.3, type:'tv',    g:'Mystery',         svc:['itvx'],                  cost:'free', runtime:44, lang:'en' },
  { id:'11', t:'Velvet Republic',          y:2025, r:8.8, type:'tv',    g:'Political',       svc:['skygo','now'],           cost:'sub',  runtime:55, lang:'en' },
  { id:'12', t:'Tomorrow, Mostly',         y:2024, r:7.4, type:'movie', g:'Comedy',          svc:['netflix'],               cost:'sub',  runtime:96, lang:'en' },
  { id:'13', t:'Ferris House',             y:2025, r:8.6, type:'tv',    g:'Drama',           svc:['channel4'],              cost:'free', runtime:48, lang:'en' },
  { id:'14', t:'Past Lives, Future Selves',y:2025, r:9.0, type:'movie', g:'Drama',           svc:['apple'],                 cost:'sub',  runtime:122, lang:'en' },
  { id:'15', t:'Nightingale',              y:2025, r:7.8, type:'tv',    g:'Crime',           svc:['paramount'],             cost:'sub',  runtime:49, lang:'en' },
  { id:'16', t:'Lighthouse Keeper',        y:2024, r:8.1, type:'movie', g:'Horror',          svc:['prime'],                 cost:'sub',  runtime:107, lang:'en' },
  { id:'17', t:'The Quiet Hour',           y:2025, r:8.4, type:'doc',   g:'Documentary',     svc:['bbc','channel4'],        cost:'free', runtime:78, lang:'en' },
  { id:'18', t:'Long Way Down',            y:2025, r:7.7, type:'movie', g:'Adventure',       svc:['apple','disney'],        cost:'sub',  runtime:110, lang:'en' },
  { id:'19', t:'Caracal',                  y:2024, r:8.3, type:'movie', g:'Thriller',        svc:['netflix'],               cost:'sub',  runtime:99, lang:'en' },
  { id:'20', t:'Tea & Treason',            y:2025, r:8.0, type:'tv',    g:'Period',          svc:['itvx','bbc'],            cost:'free', runtime:47, lang:'en' },
];

// Add a poster URL using id as the picsum seed (stable across reloads)
CONTENT.forEach(c => { c.poster = POSTER(c.id); c.backdrop = BACKDROP(c.id); });

const byId = (id) => CONTENT.find(c => c.id === id);

// Mood rooms — the emotional centre of For You
const MOOD_ROOMS = [
  { id:'mr1', name:'Slow-burn character dramas',   count:42, hue:'#a16ed4', imgs:['3','14','13'] },
  { id:'mr2', name:'Surreal dark comedies',        count:28, hue:'#e3b04b', imgs:['12','5','7']  },
  { id:'mr3', name:'Post-9/11 political thrillers',count:31, hue:'#e16b8c', imgs:['11','19','15']},
  { id:'mr4', name:'Cinema of stillness',          count:19, hue:'#3fb6a1', imgs:['6','3','14']  },
  { id:'mr5', name:'British kitchen-sink',         count:23, hue:'#5b8def', imgs:['13','1','8']  },
  { id:'mr6', name:'Late-night sci-fi reverie',    count:17, hue:'#7fb37b', imgs:['9','2','16']  },
];

// ─────────────────────────────────────────────────────────────
// Tiny icon set (line, currentColor)
// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 20, stroke = 1.8, style = {} }) {
  const props = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:stroke, strokeLinecap:'round', strokeLinejoin:'round', style };
  const paths = {
    home:       <><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></>,
    sparkles:   <><path d="M12 3l1.6 4.2L18 9l-4.4 1.8L12 15l-1.6-4.2L6 9l4.4-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></>,
    search:     <><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
    bookmark:   <><path d="M6 3h12v18l-6-4-6 4z"/></>,
    bookmarkF:  <><path d="M6 3h12v18l-6-4-6 4z" fill="currentColor"/></>,
    user:       <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></>,
    play:       <><path d="M7 5l12 7-12 7z" fill="currentColor"/></>,
    info:       <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></>,
    chev:       <><path d="M9 6l6 6-6 6"/></>,
    chevDown:   <><path d="M6 9l6 6 6-6"/></>,
    arrow:      <><path d="M5 12h14M13 5l7 7-7 7"/></>,
    sliders:    <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></>,
    star:       <><path d="M12 2l3 6.5 7 1-5 5 1.2 7-6.2-3.5L5.8 21.5 7 14.5l-5-5 7-1z" fill="currentColor"/></>,
    moon:       <><path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z"/></>,
    clock:      <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    leaf:       <><path d="M5 19c8 0 14-6 14-14C9 5 5 11 5 19z"/><path d="M5 19l9-9"/></>,
    flame:      <><path d="M12 22a6 6 0 0 0 6-6c0-3-2-4.5-3-7 0 2-1.5 3-3 3 0-3-2-5-2-9-3 3-5 6-5 12a7 7 0 0 0 7 7z"/></>,
    bolt:       <><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/></>,
    sun:        <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/></>,
    eye:        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    plus:       <><path d="M12 5v14M5 12h14"/></>,
    check:      <><path d="M5 12l5 5L20 6"/></>,
    heart:      <><path d="M12 21s-8-5.5-8-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5.5-8 11-8 11z" fill="currentColor"/></>,
    headph:     <><path d="M3 14a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-2v-7h4M3 19v-5h4v7H5a2 2 0 0 1-2-2z"/></>,
    couple:     <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 21c.5-3 3-5 6-5s5.5 2 6 5M14 21c.5-2 2.5-3.5 5-3.5"/></>,
    family:     <><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="7" r="2.5"/><circle cx="12" cy="14" r="2"/><path d="M3 21c0-3 2-5 5-5s5 2 5 5M11 21c0-3 2-5 5-5s5 2 5 5"/></>,
    solo:       <><circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/></>,
    download:   <><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></>,
    wand:       <><path d="M3 21l12-12M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM18 12l.7 1.5L20 14l-1.3.5L18 16l-.7-1.5L16 14l1.3-.5z"/></>,
    fingerprint:<><path d="M6 12a6 6 0 0 1 12 0v3M9 12a3 3 0 0 1 6 0v4a3 3 0 0 1-3 3M12 14v3M6 16v1M18 17v1"/></>,
    free:       <><path d="M5 9h14M5 15h14"/><path d="M9 4l-2 16M17 4l-2 16"/></>,
    ext:        <><path d="M14 4h6v6M10 14L20 4M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></>,
    filter:     <><path d="M3 5h18M6 12h12M10 19h4"/></>,
    close:      <><path d="M6 6l12 12M18 6l-12 12"/></>,
    grid:       <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  };
  return <svg {...props}>{paths[name] || null}</svg>;
}

// ─────────────────────────────────────────────────────────────
// Service badge — small rounded square logo
// ─────────────────────────────────────────────────────────────
function ServiceBadge({ id, size = 22, ring = false }) {
  const s = SERVICES[id];
  if (!s) return null;
  return (
    <div title={s.name} style={{
      width: size, height: size, borderRadius: Math.round(size*0.27),
      overflow: 'hidden', flexShrink: 0,
      boxShadow: ring ? '0 0 0 1.5px rgba(255,255,255,0.18)' : '0 0 0 1px rgba(0,0,0,0.25)',
      background: '#000',
    }}>
      <img src={s.logo} alt={s.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
    </div>
  );
}

// Stack of overlapping service badges
function ServiceStack({ ids, size = 22, max = 4 }) {
  const list = (ids || []).filter(id => SERVICES[id]).slice(0, max);
  return (
    <div style={{ display:'flex', alignItems:'center' }}>
      {list.map((id, i) => (
        <div key={id} style={{ marginLeft: i === 0 ? 0 : -size*0.32 }}>
          <ServiceBadge id={id} size={size} ring />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cost pill — Free / Sub / Rent
// ─────────────────────────────────────────────────────────────
function CostPill({ cost, dark = true, size = 'sm' }) {
  const map = {
    free: { label:'Free',  bg:'rgba(170,255,0,0.16)',  fg:'#cdfb46', edge:'rgba(170,255,0,0.35)' },
    sub:  { label:'In your plan', bg:'rgba(232,93,37,0.14)', fg:'#ff8d5a', edge:'rgba(232,93,37,0.4)' },
    rent: { label:'£3.49 rent', bg:'rgba(255,255,255,0.08)', fg:'rgba(255,255,255,0.7)', edge:'rgba(255,255,255,0.18)' },
  };
  const m = map[cost] || map.sub;
  const fs = size === 'xs' ? 9 : size === 'sm' ? 10 : 11;
  const py = size === 'xs' ? 2 : size === 'sm' ? 3 : 4;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize: fs, fontWeight: 600, letterSpacing: 0.2,
      padding: `${py}px ${py+4}px`, borderRadius: 999,
      background: m.bg, color: m.fg, border: `0.5px solid ${m.edge}`,
      textTransform:'uppercase', whiteSpace:'nowrap',
    }}>{m.label}</span>
  );
}

// ─────────────────────────────────────────────────────────────
// Image with skeleton (real <img>, no broken state visible)
// ─────────────────────────────────────────────────────────────
function Img({ src, alt = '', radius = 0, style = {} }) {
  const [loaded, setLoaded] = React.useState(false);
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', borderRadius: radius, overflow:'hidden', background:'#1a1a25', ...style }}>
      {!loaded && <div className="vx-shimmer" style={{ position:'absolute', inset:0, background:'#1a1a25' }} />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        style={{
          position:'absolute', inset:0, width:'100%', height:'100%',
          objectFit:'cover', display:'block',
          opacity: loaded ? 1 : 0, transition: 'opacity .5s ease',
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom nav (used by all 3 directions, theming via prop)
// ─────────────────────────────────────────────────────────────
function VxBottomNav({ active = 'home', onTab, accent = VX.primary, theme = 'dark' }) {
  const isDark = theme !== 'light';
  const muted = isDark ? VX.fgMuted : 'rgba(0,0,0,0.45)';
  const items = [
    { id:'home', icon:'home', label:'Home' },
    { id:'foryou', icon:'sparkles', label:'For You' },
    { id:'browse', icon:'search', label:'Browse' },
    { id:'watchlist', icon:'bookmark', label:'Watchlist', badge: 14 },
    { id:'profile', icon:'user', label:'Profile' },
  ];
  return (
    <div style={{
      position:'absolute', bottom:0, left:0, right:0, zIndex:40,
      paddingBottom: 18, paddingTop: 8,
      background: isDark ? 'rgba(13,13,20,0.85)' : 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderTop: `0.5px solid ${isDark ? VX.border : 'rgba(0,0,0,0.08)'}`,
    }}>
      <div style={{ display:'flex', justifyContent:'space-around', alignItems:'flex-start', padding:'0 8px' }}>
        {items.map(it => {
          const isActive = it.id === active;
          return (
            <button key={it.id} onClick={() => onTab && onTab(it.id)}
              className="vx-press"
              style={{
                background:'none', border:'none', padding:'4px 10px',
                display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                color: isActive ? accent : muted, cursor:'pointer',
                position: 'relative',
              }}>
              <div style={{ position:'relative' }}>
                <Icon name={isActive && it.icon === 'bookmark' ? 'bookmarkF' : it.icon} size={22} stroke={isActive ? 2.4 : 1.8} />
                {it.badge && !isActive && (
                  <span style={{
                    position:'absolute', top:-3, right:-7,
                    minWidth:15, height:15, padding:'0 4px',
                    borderRadius:99, background: accent, color:'#fff',
                    fontSize:9, fontWeight:700, display:'flex',
                    alignItems:'center', justifyContent:'center',
                  }}>{it.badge}</span>
                )}
              </div>
              <span style={{
                fontSize:9.5, fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.15, fontFamily: VX.fontUI,
              }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Status row — the line under the nav title showing services etc
// ─────────────────────────────────────────────────────────────
function VxAppHeader({ title, subtitle, icon = null, right = null, accent = VX.primary }) {
  return (
    <div style={{
      display:'flex', alignItems:'flex-end', justifyContent:'space-between',
      padding: '8px 18px 14px', gap: 12,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap: 10, flex:1, minWidth:0 }}>
        {icon}
        <div style={{ minWidth:0 }}>
          <div style={{ color: VX.fg, fontFamily: VX.fontUI, fontSize: 22, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.05 }}>{title}</div>
          {subtitle && <div style={{ color: VX.fgMuted, fontFamily: VX.fontUI, fontSize: 12, marginTop: 3, fontWeight: 500 }}>{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

// Export
Object.assign(window, {
  VX, SERVICES, CONTENT, MOOD_ROOMS, byId,
  Icon, ServiceBadge, ServiceStack, CostPill, Img,
  VxBottomNav, VxAppHeader,
});
