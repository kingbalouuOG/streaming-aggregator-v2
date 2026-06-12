// Creates the native/src/lib mount of the shared tree (../../src/lib).
// Windows: directory junction (no admin rights needed). POSIX: symlink.
// Runs on postinstall; safe to re-run.
const fs = require('fs');
const path = require('path');

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
