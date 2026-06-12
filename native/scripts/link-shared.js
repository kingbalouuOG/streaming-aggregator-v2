// Postinstall fixups (NATIVE-1). Two jobs, both idempotent:
//  1. Mount the shared tree at native/src/lib (junction on Windows,
//     symlink on POSIX) — see metro.config.js for why.
//  2. Patch @react-native/gradle-plugin's pinned foojay-resolver 0.5.0
//     → 1.0.0: 0.5.0 references JvmVendorSpec.IBM_SEMERU, removed in
//     Gradle 9, so any JDK-toolchain download crashes the build
//     (NoSuchFieldError in DistributionsKt). Drop this patch when RN
//     ships a Gradle-9-compatible pin.
const fs = require('fs');
const path = require('path');

const foojaySettings = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'gradle-plugin',
  'settings.gradle.kts',
);
if (fs.existsSync(foojaySettings)) {
  const content = fs.readFileSync(foojaySettings, 'utf8');
  if (content.includes('"org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")')) {
    fs.writeFileSync(
      foojaySettings,
      content.replace(
        '"org.gradle.toolchains.foojay-resolver-convention").version("0.5.0")',
        '"org.gradle.toolchains.foojay-resolver-convention").version("1.0.0")',
      ),
    );
    console.log('[link-shared] patched foojay-resolver 0.5.0 -> 1.0.0 (Gradle 9 fix)');
  }
}

const linkPath = path.join(__dirname, '..', 'src', 'lib');
const target = path.resolve(__dirname, '..', '..', 'src', 'lib');

if (!fs.existsSync(target)) {
  console.error(`[link-shared] shared tree not found at ${target}`);
  process.exit(1);
}

try {
  const stat = fs.lstatSync(linkPath);
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    // Already mounted (junctions report as directories once followed).
    process.exit(0);
  }
} catch {
  // Doesn't exist — create it.
}

fs.symlinkSync(target, linkPath, 'junction'); // 'junction' is ignored on POSIX
console.log(`[link-shared] ${linkPath} -> ${target}`);
