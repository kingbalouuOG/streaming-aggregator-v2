// NATIVE-1 W2 (D-N3): the shared lib tree (../src/lib) is exposed to
// Metro via a directory junction at native/src/lib — created by
// `npm run postinstall` (scripts/link-shared.js). Metro's file map
// doesn't index files outside the project root reliably on Windows
// (watchFolders + custom resolvers both end in "Failed to get SHA-1"),
// so instead the shared tree is mounted INSIDE the project root and
// treated as a plain directory (symlink resolution disabled below).
//
// Consequences:
//  - '@/lib/*' — the alias shared lib modules already use internally —
//    resolves through the template's own tsconfig '@/*' → './src/*'
//    mapping. No custom resolver.
//  - native/src/lib is gitignored; the single source of truth stays
//    ../src/lib (ADR-014: one engine tree, three consumers).
//  - Lib deps with no native code (@supabase/supabase-js etc.) are
//    installed into native/package.json at the SAME versions as the
//    root (only one copy ends up in this bundle; version pinning is
//    the discipline).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Metro realpaths modules found through the junction, so shared-tree
// files have ../src/lib/* origins. Bare specifiers from those origins
// would walk up the REAL directory tree and miss this app's
// node_modules — pin the lookup order: native first (anything with
// native code must autolink from here), repo root as fallback. A
// "Failed to get SHA-1 ... node_modules" error means a shared dep is
// resolving to the root copy: install it into native/package.json.
const path = require('path');
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '..', 'node_modules'),
];

module.exports = withNativeWind(config, { input: './src/global.css' });
