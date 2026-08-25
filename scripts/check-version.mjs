import { readFileSync } from 'node:fs';

const pkgPath = new URL('../package.json', import.meta.url);
const manifestPath = new URL('../src/manifest.json', import.meta.url);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (pkg.version !== manifest.version) {
	console.error(`\n[Qwant Filter] BUILD FAILED: Version mismatch!`);
	console.error(
		`package.json is at ${pkg.version} but manifest.json is at ${manifest.version}\n`
	);
	process.exit(1);
}

console.log(`[Qwant Filter] Versions match (${pkg.version}). Proceeding...`);
