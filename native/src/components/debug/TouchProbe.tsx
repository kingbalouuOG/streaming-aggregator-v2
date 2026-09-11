import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Pressable, Text, TextInput, View } from 'react-native';

// TOUCH PROBE v2 — IN-UX-001 detector. Debug branch only; never merged.
//
// v1 asked Joe to follow a script and could not reproduce the bug. That is
// weak evidence: a two-minute scripted run is the wrong shape of net for an
// intermittent fault, and v1's 14-line log overflowed before it could be
// screenshotted. v2 is a DETECTOR instead — leave it running, use the app
// normally, and screenshot it once something misbehaves.
//
// Two changes make the answer unambiguous.
//
// 1. DEAD-TAP DETECTION. Every instrumented control reports two separate
//    facts: a touch landed on it (`onTouchStart`, which fires from the touch
//    dispatch regardless of who wins the responder) and it actually reacted
//    (`onPressIn` / `onFocus`). A touch with no reaction inside 350ms is a
//    dead tap, counted per control. "First tap does nothing" becomes a
//    number on screen rather than a judgement call.
//
// 2. NO GLOBAL WRAPPER. v1 wrapped the whole app in a View carrying
//    `onStartShouldSetResponderCapture`, which is itself a participant in
//    responder negotiation — so v1 could have masked the very bug it was
//    looking for. v2 attaches handlers directly to the controls and adds no
//    node to the tree, which removes that confound.
//
// AppState transitions are logged too. If dead taps cluster immediately
// after `APP → active`, the lost tap is the one that refocuses the app
// after a switch away, which is ordinary iOS behaviour and not a Videx bug
// at all — and that would explain a report of "throughout the app" from
// someone reviewing with notes open alongside.

type Entry = { at: number; tag: string };
type Count = { touched: number; dead: number };

let entries: Entry[] = [];
let counts: Record<string, Count> = {};
let deadTotal = 0;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
// v2 assumed onTouchStart always precedes the reaction. On Pressable it does
// NOT — onPressIn arrives from the responder grant about a millisecond
// BEFORE the bubbled touch event, so every button press armed a timer that
// its own reaction had already passed, and scored itself dead. Both red
// counts in the 12:56 run were this, not the bug. Reactions are therefore
// timestamped and a touch that lands within RECENT_MS of one is already
// satisfied.
const lastReact = new Map<string, number>();
const RECENT_MS = 120;
const listeners = new Set<() => void>();

const DEAD_AFTER_MS = 350;

// JS-THREAD STALL DETECTION (v4).
//
// Nothing measured so far could see the one mechanism that fits every
// observation: a tap that lands while JS is blocked is processed after the
// finger has already lifted, and a late press is a cancelled press. It would
// hit fields and buttons alike, app-wide, and only when something happens to
// be blocking — which is why three quiet six-tap runs on a static screen all
// came back clean.
//
// The prime suspect is the query persister. It is the SYNC one: it
// JSON.stringify's the whole query cache and writes it to MMKV on the JS
// thread, up to once a second, whenever any query changes. The cost scales
// with how much has been browsed, which matches "worst on Browse".
//
// A 100ms interval that reports its own lateness catches any such block
// whatever its source; `persistSize` names the suspect when it is this one.
let stalls = 0;
let maxStall = 0;
let lastPersistKB = 0;

function emit() {
  listeners.forEach((l) => l());
}

function log(tag: string) {
  entries = [{ at: Date.now(), tag }, ...entries].slice(0, 10);
}

function bump(name: string, field: keyof Count) {
  const c = counts[name] ?? { touched: 0, dead: 0 };
  counts = { ...counts, [name]: { ...c, [field]: c[field] + 1 } };
}

/** A free-text line in the probe log, for non-touch events. */
export function note(tag: string) {
  log(tag);
  emit();
}

/** Called by the instrumented query persister with the serialized size. */
export function notePersist(bytes: number) {
  lastPersistKB = Math.round(bytes / 1024);
  log(`persist ${lastPersistKB}KB`);
  emit();
}

/** A touch landed on this control. Starts the dead-tap clock. */
export function touched(name: string) {
  bump(name, 'touched');
  log(`${name} ·touch`);
  const t = pending.get(name);
  if (t) clearTimeout(t);
  if (Date.now() - (lastReact.get(name) ?? 0) < RECENT_MS) {
    pending.delete(name);
    emit();
    return; // already reacted, a hair before the touch bubbled
  }
  pending.set(
    name,
    setTimeout(() => {
      pending.delete(name);
      bump(name, 'dead');
      deadTotal += 1;
      log(`${name} ·DEAD`);
      emit();
    }, DEAD_AFTER_MS),
  );
  emit();
}

/** The control actually reacted. Cancels the dead-tap clock. */
export function reacted(name: string) {
  lastReact.set(name, Date.now());
  const t = pending.get(name);
  if (t) clearTimeout(t);
  pending.delete(name);
  log(`${name} ·ok`);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const snap = () => ({ entries, counts, deadTotal, stalls, maxStall, lastPersistKB });
let cached = snap();
function getSnapshot() {
  if (
    cached.entries !== entries ||
    cached.counts !== counts ||
    cached.deadTotal !== deadTotal ||
    cached.stalls !== stalls ||
    cached.lastPersistKB !== lastPersistKB
  ) {
    cached = snap();
  }
  return cached;
}

const PANEL = 'rgba(0,0,0,0.9)';
const WIRE = 'rgba(245,241,232,0.22)';
const DIM = 'rgba(245,241,232,0.5)';

export function TouchProbePanel() {
  const {
    entries: log10,
    counts: c,
    deadTotal: dead,
    stalls: stallCount,
    maxStall: worstStall,
    lastPersistKB: persistKB,
  } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      log(`APP → ${s}`);
      emit();
    });

    // Report the timer's own lateness. Anything that blocks the JS thread —
    // the persister, a big render, an image decode on the wrong queue —
    // shows up here as drift, whatever its source.
    let expected = Date.now() + 100;
    const tick = setInterval(() => {
      const now = Date.now();
      const late = now - expected;
      expected = now + 100;
      if (late > 120) {
        stalls += 1;
        if (late > maxStall) maxStall = late;
        log(`STALL ${late}ms`);
        emit();
      }
    }, 100);

    return () => {
      sub.remove();
      clearInterval(tick);
    };
  }, []);

  const names = Object.keys(c);

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 88,
        backgroundColor: PANEL,
        borderTopWidth: 1,
        borderTopColor: WIRE,
        paddingHorizontal: 10,
        paddingTop: 7,
        paddingBottom: 9,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#e85d25', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>
          IN-UX-001 PROBE v4
        </Text>
        <Text style={{ color: dead > 0 ? '#ef4444' : '#10b981', fontSize: 13, fontWeight: '700' }}>
          DEAD TAPS: {dead}
        </Text>
      </View>
      <Text style={{ color: stallCount > 0 ? '#e3b04b' : DIM, fontSize: 10, marginTop: 2 }}>
        JS STALLS: {stallCount} · worst {worstStall}ms · cache {persistKB}KB
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <Pressable
          onTouchStart={() => touched('A btn/style')}
          onPressIn={() => reacted('A btn/style')}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: WIRE, alignItems: 'center' }}>
          <Text style={{ color: '#f5f1e8', fontSize: 11 }}>A style</Text>
        </Pressable>
        <Pressable
          onTouchStart={() => touched('B btn/class')}
          onPressIn={() => reacted('B btn/class')}
          className="flex-1 items-center rounded-md border border-border py-2 active:opacity-70">
          <Text className="text-foreground" style={{ fontSize: 11 }}>
            B className
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <TextInput
          placeholder="C style"
          placeholderTextColor={DIM}
          onTouchStart={() => touched('C txt/style')}
          onFocus={() => reacted('C txt/style')}
          style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: WIRE, color: '#f5f1e8', fontSize: 11 }}
        />
        <TextInput
          placeholder="D className"
          placeholderTextColor={DIM}
          onTouchStart={() => touched('D txt/class')}
          onFocus={() => reacted('D txt/class')}
          className="flex-1 rounded-md border border-border px-2 py-1 text-foreground"
          style={{ fontSize: 11 }}
        />
      </View>

      <View style={{ height: 1, backgroundColor: WIRE, marginVertical: 6 }} />

      {names.length === 0 ? (
        <Text style={{ color: DIM, fontSize: 10 }}>use the app normally · screenshot when a tap misses</Text>
      ) : (
        names.map((n) => {
          const row = c[n];
          return (
            <Text key={n} style={{ color: row.dead ? '#ef4444' : '#f5f1e8', fontSize: 10, fontVariant: ['tabular-nums'] }}>
              {n}
              <Text style={{ color: DIM }}>
                {'  '}
                {row.touched} taps · {row.dead} dead
              </Text>
            </Text>
          );
        })
      )}

      <View style={{ height: 1, backgroundColor: WIRE, marginVertical: 6 }} />

      {log10.map((e, i) => (
        <Text key={`${e.at}-${i}`} style={{ color: DIM, fontSize: 9, fontVariant: ['tabular-nums'] }}>
          {e.tag}
          {log10[i + 1] ? `  +${e.at - log10[i + 1].at}ms` : ''}
        </Text>
      ))}
    </View>
  );
}

/**
 * A TextInput + Pressable pair that can be dropped anywhere to ask "does a
 * control need two taps HERE?". The point is the placement, not the widget:
 * the same pair inside a screen's ScrollView, inside the screen but outside
 * the ScrollView, and outside the navigator entirely, separates
 * react-native-screens from the ScrollView from neither.
 */
export function ProbePair({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
      <TextInput
        placeholder={`${label} txt`}
        placeholderTextColor={DIM}
        onTouchStart={() => touched(`${label} txt`)}
        onFocus={() => reacted(`${label} txt`)}
        style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e85d25', color: '#f5f1e8', fontSize: 12 }}
      />
      <Pressable
        onTouchStart={() => touched(`${label} btn`)}
        onPressIn={() => reacted(`${label} btn`)}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e85d25' }}>
        <Text style={{ color: '#f5f1e8', fontSize: 12 }}>{label} btn</Text>
      </Pressable>
    </View>
  );
}
