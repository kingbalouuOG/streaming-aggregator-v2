
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";
  import { clearCache } from "./lib/api/cache";

  // One-time: flush stale SA cache from before the cache-write fix.
  // Safe to remove after all users have updated past this version.
  const SA_CACHE_FLUSHED_KEY = 'sa_cache_flushed_v1';
  if (!localStorage.getItem(SA_CACHE_FLUSHED_KEY)) {
    clearCache('sa_').then(() => localStorage.setItem(SA_CACHE_FLUSHED_KEY, '1'));
  }

  createRoot(document.getElementById("root")!).render(<App />);
  