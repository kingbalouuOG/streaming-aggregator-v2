import React from "react";
import { Home, Search, Bookmark, User } from "lucide-react";
import { motion } from "motion/react";

interface NavItem {
  icon: React.ElementType;
  label: string;
  id: string;
}

const navItems: NavItem[] = [
  { icon: Home, label: "Home", id: "home" },
  { icon: Search, label: "Browse", id: "browse" },
  { icon: Bookmark, label: "Watchlist", id: "watchlist" },
  { icon: User, label: "Profile", id: "profile" },
];

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  watchlistCount?: number;
}

export function BottomNav({ activeTab, onTabChange, watchlistCount = 0 }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-nav-bg backdrop-blur-xl border-t"
      style={{
        borderColor: "var(--border-subtle)",
        /* Capacitor: backdrop-blur fallback for older Android */
        backgroundColor: "var(--nav-bg)",
      }}
    >
      <div className="max-w-md mx-auto flex items-center justify-around px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const isActive = item.id === activeTab;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              whileTap={{ scale: 0.88 }}
              className={`flex flex-col items-center gap-0.5 py-1 px-4 rounded-xl transition-colors duration-200 ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <motion.div
                  animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "fill-current" : ""}`} strokeWidth={isActive ? 2.5 : 1.8} />
                </motion.div>
                {item.id === "watchlist" && watchlistCount > 0 && !isActive && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center px-1"
                    style={{ fontWeight: 700 }}
                  >
                    {watchlistCount}
                  </motion.span>
                )}
              </div>
              <span className="text-[10px]" style={{ fontWeight: isActive ? 600 : 400 }}>
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}