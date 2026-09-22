import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';

import { readRepoEnv } from './fixtures/repo-env';

/**
 * Prepares the database the journey stack needs, using the same commands the
 * README documents for local setup. Migrations are not applied on API startup
 * and the demo seed is a separate command, so both run here. Re-seeding is a
 * no-op once the Acme marker exists.
 */
export default function globalSetup(config: FullConfig): void {
  // rootDir is apps/web/e2e; the repository root is three levels above it.
  const repoRoot = resolve(config.rootDir, '../../..');
  // Design-time EF and the seed command both need the connection string.
  const repoEnv = readRepoEnv(repoRoot);

  run(repoRoot, 'docker', ['compose', 'up', '-d', 'postgres']);
  waitForDatabase(repoRoot);
  run(repoRoot, 'dotnet', [
    'ef',
    'database',
    'update',
    '--project',
    'src/OpsBoard.Infrastructure',
    '--startup-project',
    'src/OpsBoard.Api',
  ], repoEnv);
  run(
    repoRoot,
    'dotnet',
    ['run', '--project', 'src/OpsBoard.Api', '--no-launch-profile', '--', '--seed-demo'],
    { ...repoEnv, ASPNETCORE_ENVIRONMENT: 'Development' },
  );
}

function run(
  cwd: string,
  command: string,
  args: string[],
  env: Record<string, string> = {},
): void {
  try {
    execFileSync(command, args, {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, ...env },
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer; stdout?: Buffer });
    const detail = [
      error instanceof Error ? error.message : String(error),
      output.stderr?.toString().trim(),
      output.stdout?.toString().trim(),
    ]
      .filter((part) => part !== undefined && part !== '')
      .join('\n');
    throw new Error(
      'The browser tier could not prepare its stack.\n' +
        `Failed: ${command} ${args.join(' ')}\n` +
        `${detail}\n` +
        'See the local setup section of README.md: Docker must be running, ' +
        'migrations applied and the demo seed present.',
    );
  }
}

function waitForDatabase(cwd: string): void {
  for (let attempt = 0; attempt < 30; attempt++) {
    const status = execFileSync(
      'docker',
      ['inspect', '-f', '{{.State.Health.Status}}', 'opsboard-postgres'],
      { cwd, stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
    if (status === 'healthy') {
      return;
    }
    execFileSync('sleep', ['2']);
  }

  throw new Error('opsboard-postgres did not become healthy within 60 seconds.');
}
