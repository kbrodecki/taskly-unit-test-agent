import { expect, test } from '@playwright/test';
import { capture, saveVideo, scenarioId } from '../src/capture.ts';
import { mockApi, SAMPLE } from '../src/mock-api.ts';

test.afterEach(async ({ page }, testInfo) => saveVideo(page, testInfo));

test('empty-list: no tasks yet', async ({ page }, testInfo) => {
  await mockApi(page, []);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New task' }).first()).toBeEnabled();
  await capture(page, scenarioId(testInfo));
});

test('task-list: open and completed tasks', async ({ page }, testInfo) => {
  await mockApi(page, SAMPLE);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: SAMPLE[0].title })).toBeVisible();
  await capture(page, scenarioId(testInfo));
});

test('form-validation: empty title is rejected', async ({ page }, testInfo) => {
  await mockApi(page, SAMPLE);
  await page.goto('/');
  await page.getByRole('button', { name: 'New task' }).first().click();
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByLabel('Task title *')).toBeVisible();
  await capture(page, scenarioId(testInfo));
});

test('edit-task: editor with an existing task', async ({ page }, testInfo) => {
  await mockApi(page, SAMPLE);
  await page.goto('/');
  await page.getByRole('button', { name: `Edit: ${SAMPLE[0].title}` }).click();
  await expect(page.getByLabel('Task title *')).toHaveValue(SAMPLE[0].title);
  await capture(page, scenarioId(testInfo));
});

test('delete-dialog: confirm before deleting', async ({ page }, testInfo) => {
  await mockApi(page, SAMPLE);
  await page.goto('/');
  await page.getByRole('button', { name: `Delete: ${SAMPLE[1].title}` }).click();
  await expect(page.getByRole('button', { name: 'Delete task' })).toBeVisible();
  await capture(page, scenarioId(testInfo));
});

test('clear-completed: remove every completed task at once @video', async ({ page }, testInfo) => {
  await mockApi(page, SAMPLE);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: SAMPLE[2].title })).toBeVisible();
  await page.getByRole('button', { name: 'Clear completed' }).click();
  await expect(page.getByText('All completed tasks will be permanently deleted.')).toBeVisible();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Clear completed' }).last().click();
  await expect(page.getByText('2 completed tasks cleared.')).toBeVisible();
  await expect(page.getByRole('heading', { name: SAMPLE[2].title })).toHaveCount(0);
  await page.waitForTimeout(600);
  await capture(page, scenarioId(testInfo));
});
