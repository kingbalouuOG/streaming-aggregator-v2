// videx-search-v2.jsx — Phase Search V2 design surfaces
// Five surfaces from the brief, each rendered at 390×844 as a design-canvas
// artboard. Built on tokens & primitives from videx-shared.jsx and the
// editorial language established in videx-direction-a*.jsx.
//
// Token map (from docs/v3-design/design-system.md, mirrored to VX tokens):
//   --surface        → VX.bg                     #0a0a0f
//   --surface-elev   → SV.surfaceElev            #161620
//   --fg             → SV.cream                  #f5f1e8 (matches AL.cream)
//   --fg-soft (62%)  → SV.fgSoft
//   --fg-faint (40%) → SV.fgFaint
//   --primary        → VX.primary                #e85d25
//   --t-display-2    → 32 / Fraunces 600
//   --t-headline     → 22 / Fraunces 600
//   --t-title        → 18 / Fraunces 600
//   --t-section      → 16 / Fraunces 600
//   --t-body         → 13 / DM Sans 400
//   --t-meta         → 13 / DM Sans 500
//   --t-kicker       → 11 / DM Sans 700 tracked uppercase
//   --r-card         → 12
//   --r-pill         → 9999
//   --scrim-glass-action / --scrim-glass-edge → SV.scrimAction* (action-weight button)

const SV = {
  surface: '#0a0a0f',
  surfaceElev: '#161620',
  surfaceElev2: '#1c1c26',
  cream: '#f5f1e8',
  fgSoft: 'rgba(245,241,232,0.62)',
  fgFaint: 'rgba(245,241,232,0.40)',
  line: 'rgba(245,241,232,0.10)',
  lineSoft: 'rgba(245,241,232,0.06)',
  primary: '#e85d25',
  primarySoft: 'rgba(232,93,37,0.14)',
  primaryEdge: 'rgba(232,93,37,0.42)',
  scrimAction: 'rgba(232,93,37,0.18)',
  scrimActionEdge: 'rgba(232,93,37,0.55)',
};

// ─────────────────────────────────────────────────────────────
// Type primitives — every text node maps to a documented size
// ─────────────────────────────────────────────────────────────
function SvKicker({ children, color = SV.fgSoft, style = {} }) {
  return (
    <div style={{
      fontFamily: VX.fontUI, fontSize: 11, fontWeight: 700,
      letterSpacing: 1.4, textTransform:'uppercase', color, ...style,
    }}>{children}</div>
  );
}

function SvSectionHead({ kicker, title, action, color = SV.fgSoft }) {
  return (
    <div style={{
      padding:'0 20px 12px',
      display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <SvKicker color={color}>{kicker}</SvKicker>
        {title && (
          <h2 style={{
            margin:'6px 0 0', fontFamily: VX.fontDisplay,
            fontSize: 22, lineHeight: 1.1, fontWeight: 600,
            color: SV.cream, letterSpacing: -0.4,
            fontVariationSettings:'"opsz" 36',
          }}>{title}</h2>
        )}
      </div>
      {action && (
        <button style={{
          background:'none', border:'none', color: SV.fgSoft,
          fontFamily: VX.fontUI, fontSize: 11, fontWeight: 600,
          letterSpacing: 0.4, textTransform:'uppercase',
          display:'flex', alignItems:'center', gap: 3, cursor:'pointer',
        }}>
          {action} <Icon name="chev" size={11} stroke={2.4}/>
        </button>
      )}
    </div>
  );
}

// Shared screen shell — 390 wide, fixed height, dark ink, no scroll
function SvScreen({ children, height = 844, label }) {
  return (
    <div style={{
      width: 390, height, background: SV.surface, color: SV.cream,
      position:'relative', overflow:'hidden',
      fontFamily: VX.fontUI,
    }} data-screen-label={label}>
      {children}
    </div>
  );
}

// iOS-style status bar (visual chrome only; reproduces what the live app shows)
function SvStatusBar({ tint = SV.cream }) {
  return (
    <div style={{
      height: 47, padding:'0 22px',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      color: tint, fontFamily: VX.fontUI, fontSize: 14, fontWeight: 600,
      letterSpacing: -0.1,
    }}>
      <span>9:41</span>
      <div style={{ display:'flex', alignItems:'center', gap: 6, opacity: 0.95 }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><path d="M.7 6.1a.4.4 0 0 0 .4.4h.7a.4.4 0 0 0 .4-.4V4.9a.4.4 0 0 0-.4-.4H1.1a.4.4 0 0 0-.4.4v1.2zm3 .5a.4.4 0 0 0 .4.4h.7a.4.4 0 0 0 .4-.4V4.4a.4.4 0 0 0-.4-.4h-.7a.4.4 0 0 0-.4.4v2.2zm3 .4a.4.4 0 0 0 .4.4h.7a.4.4 0 0 0 .4-.4V3.6a.4.4 0 0 0-.4-.4H7a.4.4 0 0 0-.4.4v3.4zm3 .4a.4.4 0 0 0 .4.4h.7a.4.4 0 0 0 .4-.4V2.7a.4.4 0 0 0-.4-.4H10a.4.4 0 0 0-.4.4v4.7z"/></svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M7.5 3.5C9.6 3.5 11.5 4.3 13 5.5"/><path d="M5 6c1.3-1 3-1.5 2.5-1.5C9 4.5 10.7 5 12 6"/><circle cx="7.5" cy="8.3" r=".8" fill="currentColor"/></svg>
        <div style={{ display:'flex', alignItems:'center', gap: 3 }}>
          <div style={{ width: 22, height: 11, borderRadius: 3, border: '1px solid currentColor', opacity: 0.4, position:'relative', padding: 1 }}>
            <div style={{ width:'80%', height:'100%', background:'currentColor', borderRadius: 1.5 }}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SearchInput — pinned top of every search surface
// Token: --surface-elev fill, --fg cream, --r-pill 9999
// Component: NEW (built from existing input pattern)
// ─────────────────────────────────────────────────────────────
function SvSearchInput({ value = '', placeholder = 'Search titles, moods, descriptions', autofocus = false, showClear = false, theme = 'dark' }) {
  return (
    <div style={{
      padding: '6px 20px 12px', position:'relative',
    }}>
      <div style={{
        display:'flex', alignItems:'center', gap: 10,
        height: 44, padding: '0 14px',
        background: SV.surfaceElev, borderRadius: 9999,
        border: `0.5px solid ${SV.line}`,
        boxShadow: autofocus ? `0 0 0 3px ${SV.scrimAction}` : 'none',
      }}>
        <Icon name="search" size={16} stroke={2}
              style={{ color: value ? SV.cream : SV.fgFaint, flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0,
          fontFamily: VX.fontUI, fontSize: 15, fontWeight: 500,
          color: value ? SV.cream : SV.fgFaint, letterSpacing: -0.1,
          display:'flex', alignItems:'center',
        }}>
          {value || placeholder}
          {autofocus && !value && (
            <span style={{
              display:'inline-block', width: 1.5, height: 16, marginLeft: 2,
              background: SV.primary, animation: 'svBlink 1.1s steps(2) infinite',
            }}/>
          )}
        </div>
        {showClear && (
          <button style={{
            width: 22, height: 22, borderRadius: 99,
            background:'rgba(245,241,232,0.10)', border:'none',
            color: SV.cream, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            flexShrink: 0,
          }}>
            <Icon name="close" size={12} stroke={2.4}/>
          </button>
        )}
      </div>
      <style>{`@keyframes svBlink { to { opacity: 0; } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SvMoodChip — reuses the AL chip language, exposed for Search
// Component: <MoodChip> (existing primitive)
// ─────────────────────────────────────────────────────────────
function SvMoodChip({ label, sub, icon, hue, active = false }) {
  const c = hue || SV.primary;
  return (
    <div style={{
      flex: '0 0 auto', padding: '10px 14px', borderRadius: 14,
      background: active ? `${c}1f` : 'rgba(245,241,232,0.03)',
      border: `0.5px solid ${active ? c + '70' : SV.line}`,
      display:'flex', alignItems:'center', gap: 10,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: active ? `${c}30` : 'rgba(245,241,232,0.05)',
        color: active ? c : SV.fgSoft,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <Icon name={icon} size={14} stroke={2}/>
      </div>
      <div>
        <div style={{
          fontFamily: VX.fontUI, fontSize: 13, fontWeight: 700,
          color: active ? SV.cream : 'rgba(245,241,232,0.85)',
          lineHeight: 1.1, letterSpacing: -0.1,
        }}>{label}</div>
        {sub && (
          <div style={{
            marginTop: 2, fontFamily: VX.fontUI, fontSize: 10,
            color: active ? c : SV.fgSoft, fontWeight: 500,
          }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

// Smaller chip variant — used for grouped categories (decades, services)
function SvSmallChip({ label, active = false, icon }) {
  return (
    <div style={{
      flex:'0 0 auto', height: 32, padding: '0 14px',
      display:'flex', alignItems:'center', gap: 6,
      borderRadius: 9999,
      background: active ? SV.primarySoft : 'rgba(245,241,232,0.04)',
      border: `0.5px solid ${active ? SV.primaryEdge : SV.line}`,
      color: active ? '#ff8d5a' : 'rgba(245,241,232,0.78)',
      fontFamily: VX.fontUI, fontSize: 12.5, fontWeight: 600,
      whiteSpace:'nowrap', letterSpacing: -0.1,
    }}>
      {icon}
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SvContentCard — 2-col grid card, default 160w variant
// Component: <ContentCard> (existing primitive)
// ─────────────────────────────────────────────────────────────
function SvContentCard({ item, offServices = false }) {
  return (
    <div style={{
      display:'flex', flexDirection:'column', gap: 8,
      opacity: offServices ? 0.75 : 1,
    }}>
      <div style={{
        position:'relative', aspectRatio: '2/3', borderRadius: 12, overflow:'hidden',
        background: SV.surfaceElev,
      }}>
        <Img src={item.poster}/>

        {/* Top-left: service stack overlay — matches app-wide card pattern */}
        <div style={{
          position:'absolute', top: 6, left: 6,
          padding: 3, borderRadius: 9999,
          background:'rgba(10,10,15,0.55)', backdropFilter:'blur(6px)',
        }}>
          <ServiceStack ids={item.svc} size={18} max={3}/>
        </div>

        {/* Top-right: bookmark button — matches app-wide card pattern */}
        <button style={{
          position:'absolute', top: 6, right: 6,
          width: 28, height: 28, borderRadius: 9999, border:'none',
          background:'rgba(10,10,15,0.55)', backdropFilter:'blur(6px)',
          color: SV.cream, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <Icon name="bookmark" size={14} stroke={1.8}/>
        </button>

        {/* Bottom-right: single signal pill — rating OR "not on services" (never both) */}
        {offServices ? (
          <div style={{
            position:'absolute', right: 6, bottom: 6,
            padding:'3px 8px', borderRadius: 9999,
            background:'rgba(10,10,15,0.78)', backdropFilter:'blur(8px)',
            border:`0.5px solid ${SV.line}`,
            color: SV.fgSoft, fontFamily: VX.fontUI, fontSize: 9.5,
            fontWeight: 600, letterSpacing: 0.3, textTransform:'uppercase',
            display:'flex', alignItems:'center', gap: 4,
          }}>
            <Icon name="ext" size={9} stroke={2.4}/> Not on yours
          </div>
        ) : (
          <div style={{
            position:'absolute', right: 6, bottom: 6,
            padding:'3px 7px', borderRadius: 9999,
            background:'rgba(10,10,15,0.78)', backdropFilter:'blur(8px)',
            color: SV.cream, fontFamily: VX.fontUI, fontSize: 10,
            fontWeight: 700, letterSpacing: 0.1,
            display:'flex', alignItems:'center', gap: 3,
          }}>
            <span style={{ color: SV.primary, fontSize: 9 }}>★</span>{item.r.toFixed(1)}
          </div>
        )}
      </div>
      <div>
        <div style={{
          fontFamily: VX.fontDisplay, fontSize: 14.5, fontWeight: 600,
          color: SV.cream, letterSpacing: -0.2, lineHeight: 1.2,
          fontVariationSettings:'"opsz" 18',
          display:'-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient:'vertical',
          overflow:'hidden',
        }}>{item.t}</div>
        <div style={{
          marginTop: 3,
          fontFamily: VX.fontUI, fontSize: 11, fontWeight: 500,
          color: SV.fgSoft, letterSpacing: 0.1,
        }}>{item.y}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SvBottomNav — same as VxBottomNav but with Browse active
// ─────────────────────────────────────────────────────────────
function SvBottomNav() {
  return (
    <div style={{
      position:'absolute', bottom: 0, left: 0, right: 0,
    }}>
      <VxBottomNav active="browse" accent={SV.primary} theme="dark"/>
    </div>
  );
}

// Annotation tag for the canvas — small floating label
function SvAnno({ children, x, y, side = 'right' }) {
  return (
    <div style={{
      position:'absolute', left: x, top: y, zIndex: 10,
      display:'flex', alignItems:'center', gap: 6,
      fontFamily: VX.fontMono, fontSize: 10, color: SV.fgSoft,
      pointerEvents:'none',
    }}>
      <div style={{ width: 18, height: 1, background: SV.primary, opacity: 0.6 }}/>
      <div style={{
        padding: '3px 7px', borderRadius: 4,
        background: 'rgba(232,93,37,0.10)',
        border: `0.5px solid ${SV.primaryEdge}`,
        color: '#ff8d5a', whiteSpace:'nowrap',
      }}>{children}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 1 — Search · empty state
// ═════════════════════════════════════════════════════════════
function SearchEmpty() {
  const recents = ['slow burn psychological thrillers', 'past lives', 'documentaries about food', 'helium', '70s political'];

  return (
    <SvScreen label="01 Search · empty">
      <SvStatusBar/>
      <SvSearchInput placeholder="Search titles, moods, descriptions"/>

      <div style={{ overflowY:'hidden', height: 'calc(100% - 47px - 62px - 84px)' }}>

        {/* RECENT */}
        <div style={{ padding:'12px 0 0' }}>
          <div style={{
            padding:'0 20px 10px', display:'flex',
            alignItems:'flex-end', justifyContent:'space-between',
          }}>
            <SvKicker>Recent</SvKicker>
            <button style={{
              background:'none', border:'none', color: SV.fgSoft,
              fontFamily: VX.fontUI, fontSize: 11, fontWeight: 600,
              letterSpacing: 0.4, textTransform:'uppercase', cursor:'pointer',
            }}>Clear</button>
          </div>
          <div>
            {recents.map((q, i) => (
              <div key={q} style={{
                display:'flex', alignItems:'center', gap: 12,
                padding:'10px 20px',
                borderTop: i === 0 ? `0.5px solid ${SV.lineSoft}` : 'none',
                borderBottom: `0.5px solid ${SV.lineSoft}`,
              }}>
                <Icon name="clock" size={15} stroke={1.8} style={{ color: SV.fgFaint, flexShrink: 0 }}/>
                <div style={{
                  flex: 1, fontFamily: VX.fontUI, fontSize: 14, fontWeight: 500,
                  color: SV.cream, letterSpacing: -0.1,
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                }}>{q}</div>
                <button style={{
                  width: 24, height: 24, borderRadius: 99, border:'none',
                  background:'transparent', color: SV.fgFaint, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  flexShrink: 0,
                }}>
                  <Icon name="close" size={12} stroke={2}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* TWO PARALLEL JOURNEYS — search by mood / feeling vs filter-driven discovery */}
        <div style={{ padding:'22px 20px 0' }}>
          <button style={{
            width:'100%', minHeight: 76, borderRadius: 16,
            background: SV.primary, border:'none',
            color:'#fff', fontFamily: VX.fontUI,
            display:'flex', alignItems:'center', gap: 14,
            padding:'14px 16px', cursor:'pointer', textAlign:'left',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background:'rgba(255,255,255,0.18)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Icon name="sliders" size={20} stroke={2}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: VX.fontDisplay, fontSize: 19, fontWeight: 600,
                letterSpacing: -0.3, lineHeight: 1.1,
                fontVariationSettings:'"opsz" 22',
              }}>Browse by filter</div>
              <div style={{
                marginTop: 3, fontSize: 12, fontWeight: 500,
                color:'rgba(255,255,255,0.85)', letterSpacing: -0.05,
              }}>Don't know what you want? Build a search.</div>
            </div>
            <Icon name="arrow" size={16} stroke={2.2} style={{ flexShrink: 0, opacity: 0.85 }}/>
          </button>
        </div>

        {/* MOODS — parallel path: semantic search shortcut */}
        <div style={{ paddingTop: 22 }}>
          <SvSectionHead
            kicker="Or start with a feeling"
            sub="Tap to search for the mood."
          />
          <div className="vx-no-scrollbar" style={{
            display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8,
            padding:'0 20px',
          }}>
            <SvMoodChip icon="leaf"  label="Slow burn"   sub="Patient & quiet"     hue={VX.accentTeal}/>
            <SvMoodChip icon="bolt"  label="Quick hit"   sub="Under 90 min"         hue={VX.accentGold}/>
            <SvMoodChip icon="moon"  label="Late-night"  sub="Strange & dark"       hue={VX.accentPlum}/>
            <SvMoodChip icon="heart" label="Comfort"     sub="A favourite kind"     hue={VX.accentRose}/>
          </div>
        </div>

      </div>

      <SvBottomNav/>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 2 — As-you-type · inline suggestions
// ═════════════════════════════════════════════════════════════
function SearchTyping() {
  const suggestions = ['3', '14', '6', '11', '15'].map(byId);

  return (
    <SvScreen label="02 Search · as-you-type">
      <SvStatusBar/>
      <SvSearchInput value="slow b" autofocus showClear/>

      <div style={{ height: 'calc(100% - 47px - 62px - 84px)', overflowY:'hidden' }}>

        {/* Inline suggestions list — appears immediately under the input */}
        <div style={{ padding: '0 0 8px' }}>
          <div style={{ padding:'4px 20px 8px' }}>
            <SvKicker>Titles</SvKicker>
          </div>
          {suggestions.map((it, i) => (
            <div key={it.id} style={{
              display:'flex', alignItems:'center', gap: 12,
              padding:'8px 20px',
              borderBottom: `0.5px solid ${SV.lineSoft}`,
              background: i === 0 ? 'rgba(245,241,232,0.025)' : 'transparent',
            }}>
              <div style={{ width: 40, height: 60, borderRadius: 6, overflow:'hidden', flexShrink: 0 }}>
                <Img src={it.poster}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: VX.fontDisplay, fontSize: 15, fontWeight: 600,
                  color: SV.cream, letterSpacing: -0.2, lineHeight: 1.2,
                  fontVariationSettings:'"opsz" 18',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                }}>{it.t}</div>
                <div style={{
                  marginTop: 3, display:'flex', alignItems:'center', gap: 6,
                  fontFamily: VX.fontUI, fontSize: 11, fontWeight: 500,
                  color: SV.fgSoft, letterSpacing: 0.1,
                }}>
                  <span>{it.y}</span>
                  <span>·</span>
                  <span style={{ textTransform:'capitalize' }}>{it.type === 'tv' ? 'TV' : it.type}</span>
                  <span>·</span>
                  <ServiceStack ids={it.svc} size={13} max={3}/>
                </div>
              </div>
              <Icon name="arrow" size={14} stroke={2} style={{ color: SV.fgFaint, flexShrink: 0 }}/>
            </div>
          ))}
        </div>

        {/* Kept-frame transition — recent moods still visible below, faded */}
        <div style={{ opacity: 0.32, transition:'opacity 220ms cubic-bezier(0.16,1,0.30,1)' }}>
          <div style={{ paddingTop: 18 }}>
            <SvSectionHead kicker="Or a feeling"/>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8,
              padding:'0 20px',
            }}>
              <SvMoodChip icon="leaf"  label="Slow burn"  sub="Patient & quiet" hue={VX.accentTeal}/>
              <SvMoodChip icon="bolt"  label="Quick hit"  sub="Under 90 min"     hue={VX.accentGold}/>
            </div>
          </div>
        </div>
      </div>

      <SvBottomNav/>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 2b — As-you-type · tooShort + loading micro-states
// (paired with surface 2 on canvas)
// ═════════════════════════════════════════════════════════════
function SearchTypingStates() {
  return (
    <SvScreen label="02b Search · typing micro-states" height={544}>
      <SvStatusBar/>

      {/* tooShort */}
      <div>
        <SvSearchInput value="s" autofocus showClear/>
        <div style={{ padding: '6px 20px 4px' }}>
          <SvKicker>Suggestions</SvKicker>
        </div>
        <div style={{
          padding:'18px 20px', fontFamily: VX.fontDisplay, fontSize: 15,
          fontStyle:'italic', color: SV.fgSoft, lineHeight: 1.4,
          fontVariationSettings:'"opsz" 18',
        }}>
          Keep typing…
        </div>
      </div>

      <div style={{ height: 1, background: SV.line, margin:'8px 0' }}/>

      {/* loading */}
      <div>
        <SvSearchInput value="slow burn psy" autofocus showClear/>
        <div style={{ padding: '6px 20px 4px' }}>
          <SvKicker>Titles</SvKicker>
        </div>
        {[0,1,2].map(i => (
          <div key={i} style={{
            display:'flex', alignItems:'center', gap: 12,
            padding:'8px 20px',
            borderBottom: `0.5px solid ${SV.lineSoft}`,
          }}>
            <div className="vx-shimmer" style={{ width: 40, height: 60, borderRadius: 6, background: SV.surfaceElev }}/>
            <div style={{ flex: 1 }}>
              <div className="vx-shimmer" style={{ height: 14, borderRadius: 4, background: SV.surfaceElev, width: '70%' }}/>
              <div className="vx-shimmer" style={{ height: 11, borderRadius: 4, background: SV.surfaceElev, width: '45%', marginTop: 6 }}/>
            </div>
          </div>
        ))}
      </div>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 3 — Results · Mode A (lookup)
// ═════════════════════════════════════════════════════════════
function SearchResultsA() {
  const results = ['3', '14', '6', '11', '15', '7'].map(byId);
  // Mark item 6 (A Quiet Heresy) as not-on-services to demo the pill
  const offIdxs = new Set(['6']);

  return (
    <SvScreen label="03 Results · Mode A (lookup)">
      <SvStatusBar/>
      <SvSearchInput value="slow burn" showClear/>

      <div style={{ height: 'calc(100% - 47px - 62px - 84px)', overflowY:'hidden' }}>

        {/* Category pills + filter button */}
        <div style={{
          display:'flex', alignItems:'center', gap: 8,
          padding:'0 20px 14px',
        }}>
          <div className="vx-no-scrollbar" style={{
            display:'flex', gap: 6, overflowX:'auto', flex: 1,
          }}>
            <SvSmallChip label="All" active/>
            <SvSmallChip label="Movies"/>
            <SvSmallChip label="TV"/>
            <SvSmallChip label="Docs"/>
          </div>
          {/* Filter button — count badge when active */}
          <button style={{
            flexShrink: 0, height: 32, padding:'0 12px',
            display:'flex', alignItems:'center', gap: 6, borderRadius: 9999,
            background: SV.primarySoft, border: `0.5px solid ${SV.primaryEdge}`,
            color: '#ff8d5a', fontFamily: VX.fontUI, fontSize: 12.5, fontWeight: 700,
            cursor:'pointer', letterSpacing: -0.1,
          }}>
            <Icon name="filter" size={13} stroke={2.2}/>
            Filters
            <span style={{
              minWidth: 16, height: 16, padding: '0 5px', borderRadius: 99,
              background: SV.primary, color:'#fff', fontSize: 10, fontWeight: 800,
              display:'flex', alignItems:'center', justifyContent:'center',
              letterSpacing: 0,
            }}>3</span>
          </button>
        </div>

        {/* Mode indicator strip */}
        <div style={{
          padding: '0 20px 14px',
        }}>
          <div style={{
            fontFamily: VX.fontUI, fontSize: 13, fontWeight: 500,
            color: SV.fgSoft, letterSpacing: -0.05,
          }}>
            Results for <span style={{ color: SV.cream, fontWeight: 600 }}>&lsquo;slow burn&rsquo;</span>
            <span style={{ color: SV.fgFaint, marginLeft: 8 }}>· 6 in your stack</span>
          </div>
        </div>

        {/* Results grid */}
        <div style={{
          padding: '0 20px',
          display:'grid', gridTemplateColumns:'1fr 1fr',
          rowGap: 18, columnGap: 12,
        }}>
          {results.map(it => (
            <SvContentCard key={it.id} item={it} offServices={offIdxs.has(it.id)}/>
          ))}
        </div>
      </div>

      <SvBottomNav/>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 4 — Results · Mode C (semantic)
// ═════════════════════════════════════════════════════════════
function SearchResultsC() {
  const results = ['3', '14', '6', '11', '15', '7'].map(byId);

  return (
    <SvScreen label="04 Results · Mode C (semantic)">
      <SvStatusBar/>
      <SvSearchInput value="slow burn psychological thrillers" showClear/>

      <div style={{ height: 'calc(100% - 47px - 62px - 84px)', overflowY:'hidden' }}>

        {/* Category pills + filter button (same primitive) */}
        <div style={{
          display:'flex', alignItems:'center', gap: 8,
          padding:'0 20px 14px',
        }}>
          <div className="vx-no-scrollbar" style={{
            display:'flex', gap: 6, overflowX:'auto', flex: 1,
          }}>
            <SvSmallChip label="All" active/>
            <SvSmallChip label="Movies"/>
            <SvSmallChip label="TV"/>
          </div>
          <button style={{
            flexShrink: 0, height: 32, padding:'0 12px',
            display:'flex', alignItems:'center', gap: 6, borderRadius: 9999,
            background:'rgba(245,241,232,0.04)', border:`0.5px solid ${SV.line}`,
            color: 'rgba(245,241,232,0.85)', fontFamily: VX.fontUI,
            fontSize: 12.5, fontWeight: 700, cursor:'pointer', letterSpacing: -0.1,
          }}>
            <Icon name="filter" size={13} stroke={2.2}/>
            Filters
          </button>
        </div>

        {/* Mode indicator — italic Fraunces 13 — distinguishable from Mode A */}
        <div style={{ padding:'0 20px 4px' }}>
          <div style={{
            fontFamily: VX.fontDisplay, fontStyle:'italic',
            fontSize: 13, fontWeight: 500, color: SV.fgSoft,
            lineHeight: 1.35, letterSpacing: -0.05,
            fontVariationSettings:'"opsz" 14',
          }}>
            Showing titles like <span style={{ color: SV.cream }}>&lsquo;slow burn psychological thrillers&rsquo;</span>
          </div>
          <button style={{
            marginTop: 4, padding: 0, background:'none', border:'none',
            color: SV.primary, fontFamily: VX.fontUI, fontSize: 12, fontWeight: 600,
            letterSpacing: -0.05, cursor:'pointer',
            display:'inline-flex', alignItems:'center', gap: 4,
          }}>
            Search keywords instead <Icon name="arrow" size={11} stroke={2.4}/>
          </button>
        </div>

        {/* Results grid */}
        <div style={{
          padding: '14px 20px 0',
          display:'grid', gridTemplateColumns:'1fr 1fr',
          rowGap: 18, columnGap: 12,
        }}>
          {results.map(it => (
            <SvContentCard key={it.id} item={it}/>
          ))}
        </div>
      </div>

      <SvBottomNav/>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 4b — Mode C opt-in moment
// (Mode A returned nothing useful — offer the semantic opt-in)
// ═════════════════════════════════════════════════════════════
function SearchModeCOptIn() {
  return (
    <SvScreen label="04b Mode C · opt-in moment" height={620}>
      <SvStatusBar/>
      <SvSearchInput value="quiet films about grief" showClear/>

      <div style={{
        display:'flex', alignItems:'center', gap: 8,
        padding:'0 20px 14px',
      }}>
        <div className="vx-no-scrollbar" style={{
          display:'flex', gap: 6, overflowX:'auto', flex: 1,
        }}>
          <SvSmallChip label="All" active/>
          <SvSmallChip label="Movies"/>
          <SvSmallChip label="TV"/>
        </div>
        <button style={{
          flexShrink: 0, height: 32, padding:'0 12px',
          display:'flex', alignItems:'center', gap: 6, borderRadius: 9999,
          background:'rgba(245,241,232,0.04)', border:`0.5px solid ${SV.line}`,
          color: 'rgba(245,241,232,0.85)', fontFamily: VX.fontUI,
          fontSize: 12.5, fontWeight: 700, cursor:'pointer',
        }}>
          <Icon name="filter" size={13} stroke={2.2}/> Filters
        </button>
      </div>

      <div style={{ padding:'0 20px 14px' }}>
        <div style={{
          fontFamily: VX.fontUI, fontSize: 13, fontWeight: 500,
          color: SV.fgSoft, letterSpacing: -0.05,
        }}>
          Results for <span style={{ color: SV.cream, fontWeight: 600 }}>&lsquo;quiet films about grief&rsquo;</span>
          <span style={{ color: SV.fgFaint, marginLeft: 8 }}>· no title matches</span>
        </div>
      </div>

      {/* The opt-in button — action-weight scrim, full-width */}
      <div style={{ padding:'0 20px' }}>
        <button style={{
          width:'100%', padding: '14px 18px', borderRadius: 12,
          background: SV.scrimAction, border: `0.5px solid ${SV.scrimActionEdge}`,
          color: SV.cream, textAlign:'left', cursor:'pointer',
          display:'flex', alignItems:'center', gap: 14,
          backdropFilter:'blur(8px)',
        }}>
          <div style={{
            width: 36, height: 36, flexShrink: 0, borderRadius: 9999,
            background: SV.primary, color: '#fff',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <Icon name="sparkles" size={16} stroke={2.2}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: VX.fontDisplay, fontSize: 15, fontWeight: 600,
              color: SV.cream, letterSpacing: -0.2, lineHeight: 1.2,
              fontVariationSettings:'"opsz" 18',
            }}>Search as a description</div>
            <div style={{
              marginTop: 2, fontFamily: VX.fontUI, fontSize: 12, fontWeight: 500,
              color: SV.fgSoft, lineHeight: 1.35,
            }}>Find titles that feel like &lsquo;quiet films about grief&rsquo;</div>
          </div>
          <Icon name="arrow" size={14} stroke={2.2} style={{ color: SV.cream, flexShrink: 0 }}/>
        </button>
      </div>

      {/* No-results editorial copy */}
      <div style={{ padding:'24px 20px 0' }}>
        <p style={{
          margin: 0, fontFamily: VX.fontDisplay, fontStyle:'italic',
          fontSize: 14, lineHeight: 1.5, color: SV.fgSoft,
          fontVariationSettings:'"opsz" 18', textWrap:'balance',
        }}>
          Nothing matches that phrase as a title. Try searching by description instead, or loosen a filter.
        </p>
      </div>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// FilterSheet — shared sub-components
// ═════════════════════════════════════════════════════════════
function SvSheetHeader({ title, count = 3 }) {
  return (
    <>
      <div style={{
        width: 36, height: 4, borderRadius: 9999,
        background:'rgba(245,241,232,0.20)',
        margin:'10px auto 14px',
      }}/>
      <div style={{
        padding:'0 20px 14px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        borderBottom: `0.5px solid ${SV.line}`,
      }}>
        <div style={{
          fontFamily: VX.fontDisplay, fontSize: 18, fontWeight: 600,
          color: SV.cream, letterSpacing: -0.3,
          fontVariationSettings:'"opsz" 24',
        }}>{title}</div>
        <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
          <button style={{
            background:'none', border:'none', color: SV.fgSoft,
            fontFamily: VX.fontUI, fontSize: 12.5, fontWeight: 600, cursor:'pointer',
            letterSpacing: -0.1,
          }}>Clear {count > 0 ? `· ${count}` : 'all'}</button>
        </div>
      </div>
    </>
  );
}

function SvSheetFooter() {
  return (
    <div style={{
      padding: '12px 20px 24px',
      borderTop: `0.5px solid ${SV.line}`,
      background: SV.surfaceElev,
    }}>
      <button style={{
        width:'100%', height: 48, borderRadius: 9999,
        background: SV.primary, color: '#fff', border:'none',
        fontFamily: VX.fontUI, fontSize: 14.5, fontWeight: 700,
        letterSpacing: -0.1, cursor:'pointer',
      }}>Show 124 results</button>
    </div>
  );
}

function SvToggleRow({ label, sub, on = true }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      gap: 12, padding: '14px 20px',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: VX.fontUI, fontSize: 14, fontWeight: 600,
          color: SV.cream, letterSpacing: -0.1,
        }}>{label}</div>
        {sub && (
          <div style={{
            marginTop: 3, fontFamily: VX.fontUI, fontSize: 12, fontWeight: 500,
            color: SV.fgSoft, lineHeight: 1.35,
          }}>{sub}</div>
        )}
      </div>
      <div style={{
        width: 44, height: 26, borderRadius: 9999, position:'relative',
        background: on ? SV.primary : 'rgba(245,241,232,0.12)',
        transition: 'background 220ms cubic-bezier(0.16,1,0.30,1)',
        flexShrink: 0,
      }}>
        <div style={{
          position:'absolute', top: 2, left: on ? 20 : 2,
          width: 22, height: 22, borderRadius: 99, background: '#fff',
          transition: 'left 220ms cubic-bezier(0.16,1,0.30,1)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
        }}/>
      </div>
    </div>
  );
}

function SvSegmented({ options, active = 0 }) {
  return (
    <div style={{
      display:'flex', padding: 3, borderRadius: 9999,
      background: 'rgba(245,241,232,0.05)',
      border: `0.5px solid ${SV.line}`,
    }}>
      {options.map((o, i) => (
        <button key={o} style={{
          flex: 1, height: 32, padding: '0 8px',
          borderRadius: 9999, border:'none',
          background: i === active ? SV.surfaceElev2 : 'transparent',
          boxShadow: i === active ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
          color: i === active ? SV.cream : SV.fgSoft,
          fontFamily: VX.fontUI, fontSize: 12.5, fontWeight: i === active ? 700 : 500,
          letterSpacing: -0.1, cursor:'pointer',
        }}>{o}</button>
      ))}
    </div>
  );
}

function SvFilterSection({ kicker, title, sub, children, dense = false }) {
  return (
    <div style={{
      padding: dense ? '14px 20px' : '18px 20px',
      borderTop: `0.5px solid ${SV.line}`,
    }}>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom: sub ? 12 : 10,
      }}>
        <div>
          <SvKicker style={{ marginBottom: 3 }}>{kicker}</SvKicker>
          <div style={{
            fontFamily: VX.fontUI, fontSize: 14, fontWeight: 600,
            color: SV.cream, letterSpacing: -0.1,
          }}>{title}</div>
          {sub && (
            <div style={{
              marginTop: 4, fontFamily: VX.fontUI, fontSize: 11.5, fontWeight: 500,
              color: SV.fgSoft, letterSpacing: -0.05, lineHeight: 1.35,
            }}>{sub}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function SvChipWrap({ items, active = [], small = true }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap: 6 }}>
      {items.map(label => (
        <SvSmallChip key={label} label={label} active={active.includes(label)}/>
      ))}
    </div>
  );
}

// Service logo tile — bigger, tappable, multi-select. Matches the screenshot pattern.
function SvServiceTile({ id, active = false, free }) {
  const svc = SERVICES[id];
  if (!svc) return null;
  return (
    <div style={{
      width: 64, flexShrink: 0,
      display:'flex', flexDirection:'column', alignItems:'center', gap: 7,
    }}>
      <div style={{
        position:'relative', width: 56, height: 56,
        borderRadius: 14, padding: 2,
        background: active ? SV.primary : 'transparent',
        transition:'background 180ms ease',
      }}>
        <div style={{
          width:'100%', height:'100%', borderRadius: 12, overflow:'hidden',
          background:'#000',
          boxShadow: active ? 'none' : `inset 0 0 0 0.5px ${SV.line}`,
          opacity: active ? 1 : 0.40,
          filter: active ? 'none' : 'grayscale(0.5)',
          transition:'all 180ms ease',
        }}>
          <img src={svc.logo} alt={svc.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
        </div>
        {active && (
          <div style={{
            position:'absolute', bottom: -2, right: -2,
            width: 18, height: 18, borderRadius: 99,
            background: SV.primary, color:'#fff',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 0 2px ${SV.surfaceElev}`,
          }}>
            <Icon name="check" size={10} stroke={3}/>
          </div>
        )}
      </div>
      <div style={{
        fontFamily: VX.fontUI, fontSize: 10.5, fontWeight: 600,
        color: active ? SV.cream : SV.fgFaint, letterSpacing: -0.1,
        textAlign:'center', whiteSpace:'nowrap', lineHeight: 1,
      }}>{svc.name}</div>
    </div>
  );
}

// Slider — used for minimum rating
function SvSlider({ value = 6.8, min = 0, max = 10, valueLabel }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{
        display:'flex', alignItems:'baseline', justifyContent:'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontFamily: VX.fontDisplay, fontSize: 28, fontWeight: 600,
          color: value > min ? SV.primary : SV.fgSoft, lineHeight: 1,
          letterSpacing: -0.4, fontVariationSettings:'"opsz" 36',
        }}>{valueLabel || (value > min ? value.toFixed(1) + '+' : 'Any')}</div>
        <div style={{
          fontFamily: VX.fontUI, fontSize: 11, fontWeight: 500,
          color: SV.fgFaint, letterSpacing: 0.2,
        }}>{min} — {max}</div>
      </div>
      <div style={{ position:'relative', height: 22, display:'flex', alignItems:'center' }}>
        <div style={{
          position:'absolute', left: 0, right: 0, height: 3, borderRadius: 99,
          background:'rgba(245,241,232,0.10)',
        }}/>
        <div style={{
          position:'absolute', left: 0, width: `${pct}%`, height: 3, borderRadius: 99,
          background: SV.primary,
        }}/>
        <div style={{
          position:'absolute', left: `calc(${pct}% - 11px)`,
          width: 22, height: 22, borderRadius: 99,
          background: '#fff', boxShadow:'0 2px 6px rgba(0,0,0,0.4)',
          border:`2px solid ${SV.primary}`,
        }}/>
      </div>
    </div>
  );
}

// Active filter pill — used in results page chip strip
function SvActiveFilterPill({ label, onRemove }) {
  return (
    <div style={{
      flex:'0 0 auto', height: 28, padding:'0 6px 0 10px',
      display:'flex', alignItems:'center', gap: 4, borderRadius: 9999,
      background: SV.primarySoft, border:`0.5px solid ${SV.primaryEdge}`,
      color: '#ff8d5a', fontFamily: VX.fontUI, fontSize: 11.5, fontWeight: 600,
      letterSpacing: -0.05, whiteSpace:'nowrap',
    }}>
      {label}
      <button style={{
        width: 18, height: 18, borderRadius: 99, border:'none',
        background:'rgba(232,93,37,0.20)', color:'#ff8d5a',
        display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
      }}>
        <Icon name="close" size={9} stroke={2.6}/>
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 5a — FilterSheet · scroll variant
// ═════════════════════════════════════════════════════════════
function FilterSheetScroll() {
  return (
    <SvScreen label="05a FilterSheet · scroll · full multi-param">
      <SvStatusBar/>

      <div style={{
        position:'absolute', inset: '47px 0 84px', overflow:'hidden',
        filter:'blur(2px)', opacity: 0.4,
      }}>
        <SvSearchInput value="slow burn" showClear/>
        <div style={{
          padding: '14px 20px',
          display:'grid', gridTemplateColumns:'1fr 1fr', rowGap: 18, columnGap: 12,
        }}>
          {['3','14','6','11'].map(byId).map(it => <SvContentCard key={it.id} item={it}/>)}
        </div>
      </div>
      <div style={{ position:'absolute', inset:'47px 0 84px', background:'rgba(0,0,0,0.55)' }}/>

      <div style={{
        position:'absolute', left: 0, right: 0, bottom: 0,
        height: 740,
        background: SV.surfaceElev, color: SV.cream,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: `0.5px solid ${SV.line}`, borderBottom:'none',
        display:'flex', flexDirection:'column',
      }}>
        <SvSheetHeader title="Filters" count={7}/>

        <div className="vx-no-scrollbar" style={{ flex: 1, overflowY:'auto' }}>

          {/* Pinned: On my services */}
          <SvToggleRow
            label="Only on my services"
            sub="Hide titles not in your stack"
            on
          />

          {/* Streaming services — logo multi-select, all-on by default */}
          <SvFilterSection kicker="Streaming services" title="Your services" sub="All on by default — tap to exclude.">
            <div className="vx-no-scrollbar" style={{
              display:'flex', gap: 12, overflowX:'auto', paddingBottom: 6, paddingTop: 2,
            }}>
              {['netflix','apple','prime','disney','bbc','channel4','itvx','now'].map(id => (
                <SvServiceTile key={id} id={id} active/>
              ))}
            </div>
          </SvFilterSection>

          {/* Content Type */}
          <SvFilterSection kicker="Content type" title="Movies, TV or docs?" dense>
            <SvSegmented options={['All','Movies','TV','Docs']} active={0}/>
          </SvFilterSection>

          {/* Cost */}
          <SvFilterSection kicker="Cost" title="Free, in-plan or rent OK?" dense>
            <SvSegmented options={['All','Free','In plan','Rent OK']} active={2}/>
          </SvFilterSection>

          {/* Runtime — NEW axis */}
          <SvFilterSection kicker="Runtime" title="How much time tonight?" dense>
            <SvSegmented options={['Any','Under 60','60–120','120+']} active={2}/>
          </SvFilterSection>

          {/* Genre */}
          <SvFilterSection kicker="Genre" title="Pick one or more">
            <SvChipWrap
              items={['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Family','Fantasy','History','Horror','Music','Mystery','Romance','Sci-fi','Thriller','War','Western']}
              active={['Drama','Thriller','Mystery']}/>
          </SvFilterSection>

          {/* Decade — NEW axis */}
          <SvFilterSection kicker="Decade" title="When was it made?" dense>
            <SvChipWrap items={['1960s','70s','80s','90s','00s','10s','20s']} active={['70s','80s']}/>
          </SvFilterSection>

          {/* Content rating — NEW axis */}
          <SvFilterSection kicker="UK rating" title="Content rating" dense>
            <SvChipWrap items={['U','PG','12','12A','15','18','TV-14','TV-MA']} active={['15','18']}/>
          </SvFilterSection>

          {/* Minimum rating */}
          <SvFilterSection kicker="Minimum rating" title="Critic + audience">
            <SvSlider value={6.8} min={0} max={10}/>
          </SvFilterSection>

          {/* Show watched */}
          <SvFilterSection kicker="Show watched" title="Already-watched titles" dense>
            <div style={{
              display:'flex', alignItems:'center', gap: 10,
              padding:'10px 14px', borderRadius: 12,
              background:'rgba(245,241,232,0.04)', border:`0.5px solid ${SV.line}`,
            }}>
              <Icon name="eye" size={16} stroke={1.8} style={{ color: SV.fgSoft }}/>
              <div style={{
                flex:1, fontFamily: VX.fontUI, fontSize: 13, fontWeight: 600,
                color: SV.cream, letterSpacing: -0.1,
              }}>Hidden</div>
              <Icon name="chev" size={13} stroke={2.2} style={{ color: SV.fgFaint }}/>
            </div>
          </SvFilterSection>

          {/* Language */}
          <SvFilterSection kicker="Language" title="Original language">
            <div style={{
              marginTop: -6, marginBottom: 10,
              fontFamily: VX.fontUI, fontSize: 12, fontWeight: 500, color: SV.fgSoft,
              letterSpacing: -0.05, lineHeight: 1.4,
            }}>None selected = show all</div>
            <SvChipWrap
              items={['English','Japanese','Korean','Spanish','French','German','Hindi','Italian','Turkish','Danish']}
              active={['English','Korean']}/>
          </SvFilterSection>

          <div style={{ height: 12 }}/>
        </div>

        <SvSheetFooter/>
      </div>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 5b — FilterSheet · Quick / Advanced tabs variant
// ═════════════════════════════════════════════════════════════
function FilterSheetTabs() {
  return (
    <SvScreen label="05b FilterSheet · Quick / Advanced">
      <SvStatusBar/>

      <div style={{
        position:'absolute', inset: '47px 0 84px', overflow:'hidden',
        filter:'blur(2px)', opacity: 0.4,
      }}>
        <SvSearchInput value="slow burn" showClear/>
        <div style={{
          padding: '14px 20px',
          display:'grid', gridTemplateColumns:'1fr 1fr', rowGap: 18, columnGap: 12,
        }}>
          {['3','14','6','11'].map(byId).map(it => <SvContentCard key={it.id} item={it}/>)}
        </div>
      </div>
      <div style={{ position:'absolute', inset:'47px 0 84px', background:'rgba(0,0,0,0.55)' }}/>

      <div style={{
        position:'absolute', left: 0, right: 0, bottom: 0,
        height: 740,
        background: SV.surfaceElev, color: SV.cream,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        border: `0.5px solid ${SV.line}`, borderBottom:'none',
        display:'flex', flexDirection:'column',
      }}>
        <SvSheetHeader title="Filters" count={7}/>

        <div style={{
          display:'flex', gap: 0, padding:'10px 20px 0',
          borderBottom: `0.5px solid ${SV.line}`,
        }}>
          {[['Quick filters', 4],['Advanced', 3]].map(([t, n], i) => (
            <button key={t} style={{
              padding: '10px 0', marginRight: 22,
              background:'none', border:'none',
              borderBottom: i === 0 ? `2px solid ${SV.primary}` : '2px solid transparent',
              color: i === 0 ? SV.cream : SV.fgSoft,
              fontFamily: VX.fontUI, fontSize: 13.5,
              fontWeight: i === 0 ? 700 : 500, cursor:'pointer',
              letterSpacing: -0.1, marginBottom: -1,
              display:'inline-flex', alignItems:'center', gap: 6,
            }}>
              {t}
              <span style={{
                padding:'1px 6px', borderRadius: 99,
                background: i === 0 ? SV.primary : 'rgba(245,241,232,0.10)',
                color: i === 0 ? '#fff' : SV.fgSoft,
                fontSize: 10, fontWeight: 800,
              }}>{n}</span>
            </button>
          ))}
        </div>

        <div className="vx-no-scrollbar" style={{ flex: 1, overflowY:'auto' }}>

          {/* QUICK TAB — most-used axes, no scroll needed */}
          <SvToggleRow
            label="Only on my services"
            sub="Hide titles not in your stack"
            on
          />

          <SvFilterSection kicker="Streaming services" title="Your services" sub="All on by default — tap to exclude.">
            <div className="vx-no-scrollbar" style={{
              display:'flex', gap: 12, overflowX:'auto', paddingBottom: 6, paddingTop: 2,
            }}>
              {['netflix','apple','prime','disney','bbc','channel4','itvx','now'].map(id => (
                <SvServiceTile key={id} id={id} active={id !== 'now'}/>
              ))}
            </div>
          </SvFilterSection>

          <SvFilterSection kicker="Content type" title="Movies, TV or docs?" dense>
            <SvSegmented options={['All','Movies','TV','Docs']} active={0}/>
          </SvFilterSection>

          <SvFilterSection kicker="Cost" title="Free, in-plan or rent?" dense>
            <SvSegmented options={['All','Free','In plan','Rent OK']} active={2}/>
          </SvFilterSection>

          <SvFilterSection kicker="Runtime" title="How much time tonight?" dense>
            <SvSegmented options={['Any','Under 60','60–120','120+']} active={2}/>
          </SvFilterSection>

          {/* Advanced tab preview link */}
          <div style={{
            padding:'14px 20px', borderTop: `0.5px solid ${SV.line}`,
            display:'flex', alignItems:'center', justifyContent:'space-between',
            gap: 12, cursor:'pointer',
          }}>
            <div style={{ minWidth: 0 }}>
              <SvKicker style={{ marginBottom: 4 }}>Advanced</SvKicker>
              <div style={{
                fontFamily: VX.fontUI, fontSize: 13, fontWeight: 500, color: SV.fgSoft,
                letterSpacing: -0.05, lineHeight: 1.4,
              }}>
                Genre · <span style={{ color: SV.cream }}>Drama, Thriller, Mystery</span> · Decade · <span style={{ color: SV.cream }}>70s, 80s</span> · Rating · <span style={{ color: SV.cream }}>15, 18</span> · Min score 6.8+ · Language · <span style={{ color: SV.cream }}>English, Korean</span>
              </div>
            </div>
            <Icon name="chev" size={14} stroke={2.2} style={{ color: SV.fgFaint, flexShrink: 0 }}/>
          </div>

          <div style={{ height: 12 }}/>
        </div>

        <SvSheetFooter/>
      </div>
    </SvScreen>
  );
}

// ═════════════════════════════════════════════════════════════
// SURFACE 6 — Results with active multi-param search
// Shows the affordance for users who've crafted their own search
// ═════════════════════════════════════════════════════════════
function SearchResultsAdvanced() {
  const results = ['3','14','6','11','15','7'].map(byId);
  return (
    <SvScreen label="06 Results · advanced multi-param search">
      <SvStatusBar/>
      <SvSearchInput value="" placeholder="All titles matching your filters" showClear/>

      {/* Active filters chip strip — horizontally scrollable */}
      <div style={{
        padding:'2px 20px 12px',
        display:'flex', alignItems:'center', gap: 8,
      }}>
        <SvKicker style={{ flexShrink: 0 }}>7 filters</SvKicker>
        <button style={{
          flexShrink: 0, background:'none', border:'none',
          color: SV.fgSoft, fontFamily: VX.fontUI, fontSize: 11, fontWeight: 600,
          letterSpacing: 0.4, textTransform:'uppercase', cursor:'pointer',
        }}>Clear</button>
      </div>

      <div className="vx-no-scrollbar" style={{
        display:'flex', gap: 6, padding:'0 20px 12px', overflowX:'auto',
      }}>
        <SvActiveFilterPill label="4 services"/>
        <SvActiveFilterPill label="Movies"/>
        <SvActiveFilterPill label="60–120 min"/>
        <SvActiveFilterPill label="Drama +2"/>
        <SvActiveFilterPill label="70s, 80s"/>
        <SvActiveFilterPill label="15, 18"/>
        <SvActiveFilterPill label="6.8+"/>
      </div>

      <div style={{ height: 1, background: SV.line, margin:'0 20px 12px' }}/>

      <div style={{
        padding: '0 20px 12px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{
          fontFamily: VX.fontUI, fontSize: 13, fontWeight: 500, color: SV.fgSoft,
          letterSpacing: -0.05,
        }}>
          <span style={{ color: SV.cream, fontWeight: 600 }}>34 titles</span>
          <span style={{ color: SV.fgFaint, marginLeft: 6 }}>match all 7 filters</span>
        </div>
        <button style={{
          height: 30, padding:'0 10px', borderRadius: 9999,
          background: SV.primarySoft, border:`0.5px solid ${SV.primaryEdge}`,
          color: '#ff8d5a', fontFamily: VX.fontUI, fontSize: 11.5, fontWeight: 700,
          display:'flex', alignItems:'center', gap: 4, cursor:'pointer',
        }}>
          <Icon name="sliders" size={11} stroke={2.2}/> Edit filters
        </button>
      </div>

      <div style={{
        padding: '0 20px',
        display:'grid', gridTemplateColumns:'1fr 1fr',
        rowGap: 18, columnGap: 12,
      }}>
        {results.map(it => <SvContentCard key={it.id} item={it}/>)}
      </div>

      <SvBottomNav/>
    </SvScreen>
  );
}

// Export
Object.assign(window, {
  SearchEmpty, SearchTyping, SearchTypingStates,
  SearchResultsA, SearchResultsC, SearchModeCOptIn,
  SearchResultsAdvanced,
  FilterSheetScroll, FilterSheetTabs,
});
