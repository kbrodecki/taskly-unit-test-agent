import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

const outDir = resolve(process.env.VISUAL_OUT ?? 'out/after');

export async function capture(page: Page, id: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(outDir, `${id}.png`), animations: 'disabled', caret: 'hide' });
}

export function scenarioId(testInfo: TestInfo): string {
  return testInfo.title.split(':')[0].trim();
}

export async function saveVideo(page: Page, testInfo: TestInfo): Promise<void> {
  const video = page.video();
  if (!video) return;
  mkdirSync(outDir, { recursive: true });
  await page.close();
  await video.saveAs(join(outDir, `${scenarioId(testInfo)}.webm`));
}
