import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

try {
	const gitStatus = execSync('git status --porcelain').toString().trim();

	if (gitStatus.length > 0) {
		console.error('\n[Qwant Filter] BUILD FAILED: Working directory is not clean.');
		console.error(
			'[Qwant Filter] Please commit or stash the following changes before packaging the source:\n'
		);
		console.error(gitStatus, '\n');
		process.exit(1);
	}

	const pkgPath = new URL('../package.json', import.meta.url);
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

	const safeName = pkg.name.replace(/-/g, '_');
	const filename = `${safeName}-${pkg.version}-source.zip`;

	console.log(`[Qwant Filter] Packaging source code into dist/${filename}...`);

	execSync(`git archive -o dist/${filename} HEAD`, { stdio: 'inherit' });
	console.log('[Qwant Filter] Source packaged successfully!');
} catch (error) {
	console.error('[Qwant Filter] Failed to build source archive:', error);
	process.exit(1);
}
