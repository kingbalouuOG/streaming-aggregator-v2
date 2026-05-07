import React from "react";
import { motion } from "motion/react";
import {
  HomeIcon,
  HomeFilledIcon,
  SparkleIcon,
  SearchIcon,
  BookmarkIcon,
  BookmarkFilledIcon,
  UserIcon,
  UserFilledIcon,
} from "./icons";

interface NavItem {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  ActiveIcon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: "home",      label: "Home",      Icon: HomeIcon,     ActiveIcon: HomeFilledIcon },
  { id: "foryou",    label: "For You",   Icon: SparkleIcon,  ActiveIcon: SparkleIcon },
  { id: "browse",    label: "Browse",    Icon: SearchIcon,   ActiveIcon: SearchIcon },
  { id: "watchlist", label: "Watchlist", Icon: BookmarkIcon, ActiveIcon: BookmarkFilledIcon },
  { id: "profile",   label: "Profile",   Icon: UserIcon,     ActiveIcon: UserFilledIcon },
];

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  /**
   * When > 0, the Watchlist tab carries a small primary dot indicating
   * unread / new releases. Per design-system §4 — it's a presence
   * indicator, not a count, so the actual number is intentionally not
   * surfaced here.
   */
  watchlistCount?: number;
}

/**
 * BottomNav — fixed-to-viewport blurred surface per design-system §4.
 *
 * Surface:    var(--surface-tint) with backdrop-filter blur(12px) saturate(180%)
 * Active:     var(--primary)
 * Inactive:   var(--fg-faint)
 * Unread dot: var(--primary)
 */
export function BottomNav({ activeTab, onTabChange, watchlistCount = 0 }: BottomNavProps) {
  return (
    <nav
      className="shrink-0 safe-bottom"
      style={{
        background: "var(--surface-tint)",
        backdropFilter: "blur(12px) saturate(180%)",
        WebkitBackdropFilter: "blur(12px) saturate(180%)",
        borderTop: "0.5px solid var(--hairline)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-2 py-2">
        {navItems.map(({ id, label, Icon, ActiveIcon }) => {
          const isActive = id === activeTab;
          const Glyph = isActive ? ActiveIcon : Icon;
          const showDot = id === "watchlist" && watchlistCount > 0 && !isActive;

          return (
            <motion.button
              key={id}
              onClick={() => onTabChange(id)}
              whileTap={{ scale: 0.88 }}
              className="flex flex-col items-center gap-1 py-1.5 px-4 rounded-xl"
              style={{
                color: isActive ? "var(--primary)" : "var(--fg-faint)",
                transition: "color var(--d-fast) var(--ease-out)",
              }}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <motion.div
                  animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Glyph className="w-6 h-6" />
                </motion.div>
                {showDot && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-1 block"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--primary)",
                      // Subtle ring against the blurred surface so the dot
                      // reads at a glance regardless of what's behind.
                      boxShadow: "0 0 0 1.5px var(--surface)",
                    }}
                    aria-label="New releases"
                  />
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: "0.02em",
                }}
              >
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
