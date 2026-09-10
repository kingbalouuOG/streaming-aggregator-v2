import { useSyncExternalStore } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

// TOUCH PROBE — IN-UX-001 diagnostic. Debug branch only; never merged.
//
// The question this answers is which layer loses the first tap:
//
//   root:down absent            the touch never reached JS at all — native
//                               side (react-native-screens / Fabric / an
//                               extra UIWindow taking the first tap)
//   root:down but no target     the touch reached JS and the responder
//                               negotiation lost it — a re-render between
//                               touch-down and press-in
//   target:in but no target:go  the press started and was cancelled — a
//                               remount, or movement past the slop
//
// The four controls below are the discriminator. They sit ABOVE the Stack
// navigator in the root layout, so a control that behaves while the same
// widget inside a screen does not is the navigator's doing. Within each
// pair, one is styled with `style` and one with `className`, which is the
// NativeWind interop with everything else held equal.

type Entry = { at: number; tag: string };

let entries: Entry[] = [];
const listeners = new Set<() => void>();

/** Record one touch-lifecycle event. Call from any instrumented call site. */
export function probe(tag: string): void {
  entries = [{ at: Date.now(), tag }, ...entries].slice(0, 14);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function useEntries() {
  return useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
}

const PANEL = "rgba(0,0,0,0.86)";
const WIRE = "rgba(245,241,232,0.22)";

/**
 * Wraps the whole app. `onTouchStart` sees every touch that reaches
 * the RN responder system; `onStartShouldSetResponderCapture` returns false
 * so nothing is stolen. If a tap Joe makes produces no `root:down` line,
 * the touch was consumed before JS ever heard about it.
 */
export function TouchProbeRoot({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={() => probe("root:down")}
      onStartShouldSetResponderCapture={() => {
        probe("root:ask");
        return false;
      }}
    >
      {children}
    </View>
  );
}

function Row({ entry, prev }: { entry: Entry; prev?: Entry }) {
  const gap = prev ? entry.at - prev.at : 0;
  return (
    <Text
      style={{ color: "#f5f1e8", fontSize: 10, fontVariant: ["tabular-nums"] }}
    >
      {entry.tag}
      <Text style={{ color: "rgba(245,241,232,0.45)" }}>
        {gap ? `  +${gap}ms` : ""}
      </Text>
    </Text>
  );
}

/** The visible panel: four controls, then the rolling event log. */
export function TouchProbePanel() {
  const log = useEntries();

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // Clear of the tab bar — switching tabs is one of the things being
        // characterised, so the panel must not sit on top of it.
        bottom: 88,
        backgroundColor: PANEL,
        borderTopWidth: 1,
        borderTopColor: WIRE,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 10,
      }}
    >
      <Text
        style={{
          color: "#e85d25",
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1,
        }}
      >
        IN-UX-001 TOUCH PROBE
      </Text>

      {/* Buttons: plain style vs NativeWind className, side by side. */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
        <Pressable
          onPressIn={() => probe("A btn/style:in")}
          onPress={() => probe("A btn/style:GO")}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: WIRE,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#f5f1e8", fontSize: 11 }}>A style</Text>
        </Pressable>
        <Pressable
          onPressIn={() => probe("B btn/class:in")}
          onPress={() => probe("B btn/class:GO")}
          className="flex-1 items-center rounded-md border border-border py-2 active:opacity-70"
        >
          <Text className="text-foreground" style={{ fontSize: 11 }}>
            B className
          </Text>
        </Pressable>
      </View>

      {/* Text fields: same pair, same question. */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
        <TextInput
          placeholder="C style"
          placeholderTextColor="rgba(245,241,232,0.4)"
          onFocus={() => probe("C txt/style:FOCUS")}
          style={{
            flex: 1,
            paddingVertical: 7,
            paddingHorizontal: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: WIRE,
            color: "#f5f1e8",
            fontSize: 11,
          }}
        />
        <TextInput
          placeholder="D className"
          placeholderTextColor="rgba(245,241,232,0.4)"
          onFocus={() => probe("D txt/class:FOCUS")}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-foreground"
          style={{ fontSize: 11 }}
        />
      </View>

      <View style={{ height: 1, backgroundColor: WIRE, marginVertical: 7 }} />

      <View style={{ minHeight: 96 }}>
        {log.length === 0 ? (
          <Text style={{ color: "rgba(245,241,232,0.45)", fontSize: 10 }}>
            tap something…
          </Text>
        ) : (
          log.map((e, i) => (
            <Row key={`${e.at}-${i}`} entry={e} prev={log[i + 1]} />
          ))
        )}
      </View>
    </View>
  );
}
