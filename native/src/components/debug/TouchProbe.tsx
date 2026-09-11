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
const listeners = new Set<() => void>();

const DEAD_AFTER_MS = 350;

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

/** A touch landed on this control. Starts the dead-tap clock. */
export function touched(name: string) {
  bump(name, 'touched');
  log(`${name} ·touch`);
  const t = pending.get(name);
  if (t) clearTimeout(t);
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

const snap = () => ({ entries, counts, deadTotal });
let cached = snap();
function getSnapshot() {
  if (cached.entries !== entries || cached.counts !== counts || cached.deadTotal !== deadTotal) {
    cached = snap();
  }
  return cached;
}

const PANEL = 'rgba(0,0,0,0.9)';
const WIRE = 'rgba(245,241,232,0.22)';
const DIM = 'rgba(245,241,232,0.5)';

export function TouchProbePanel() {
  const { entries: log10, counts: c, deadTotal: dead } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      log(`APP → ${s}`);
      emit();
    });
    return () => sub.remove();
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
          IN-UX-001 PROBE v2
        </Text>
        <Text style={{ color: dead > 0 ? '#ef4444' : '#10b981', fontSize: 13, fontWeight: '700' }}>
          DEAD TAPS: {dead}
        </Text>
      </View>

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
