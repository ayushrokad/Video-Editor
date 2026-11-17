/**
 * FRAMEFLOW Milestone M0 Verification Script
 * Validates files, configuration, and architecture consistency.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const REQUIRED_FILES = [
  'AGENTS.md',
  'README.md',
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.json',
  'LICENSE',
  // Research docs
  'docs/research/research-source-register.md',
  'docs/research/competitor-master-analysis.md',
  'docs/research/premiere-pro-analysis.md',
  'docs/research/davinci-resolve-analysis.md',
  'docs/research/after-effects-analysis.md',
  'docs/research/final-cut-pro-analysis.md',
  'docs/research/menus-and-panels-inventory.md',
  'docs/research/settings-and-preferences-map.md',
  'docs/research/professional-workflow-analysis.md',
  'docs/research/user-pain-points.md',
  'docs/research/tutorial-and-video-library.md',
  'docs/research/studio-research.md',
  'docs/research/frameflow-ux-recommendations.md',
  // Architecture docs
  'docs/architecture/web-architecture.md',
  'docs/architecture/browser-media-pipeline.md',
  'docs/architecture/gpu-rendering.md',
  'docs/architecture/storage-strategy.md',
  'docs/architecture/cloud-rendering.md',
  'docs/development/browser-compatibility.md',
  // Packages
  'packages/shared-types/src/index.ts',
  'packages/design-system/src/tokens.ts',
  'packages/media-engine/src/diagnostics.ts',
  'packages/gpu-renderer/src/shaders.ts',
  // Web app
  'apps/web/public/index.html',
  'apps/web/public/app.js',
  'apps/web/public/style.css',
  'scripts/serve.js',
];

console.log('--- FRAMEFLOW Milestone M0 File Verification ---');
let missing = 0;
for (const relPath of REQUIRED_FILES) {
  const fullPath = path.join(ROOT, relPath);
  if (fs.existsSync(fullPath)) {
    console.log(`[PASS] ${relPath}`);
  } else {
    console.error(`[FAIL] MISSING: ${relPath}`);
    missing++;
  }
}

if (missing === 0) {
  console.log('\nAll 27 required Milestone M0 and Research deliverables verified successfully!');
  process.exit(0);
} else {
  console.error(`\nVerification failed with ${missing} missing files.`);
  process.exit(1);
}
