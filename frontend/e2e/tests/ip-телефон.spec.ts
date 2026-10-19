import { expect, test, type Page } from '@playwright/test';
import { go, login, sql, USERS } from './helpers';

/**
 * Финал: IP-телефон диспетчера ДДС.
 *
 * Обратная связь экспертов 18.10 — «виртуальный IP-телефон для
 * специалиста ДДС». Звонки старшему бригады и начальнику идут через
 * телефон на карточке: статус линии, телефонная книга, входящий с АОН,
 * журнал вызовов.
 *
 * Голоса на прогоне нет (заглушка модели и синтеза): собеседник отвечает
 * текстом, диспетчер говорит текстом — так же, как без микрофона.
 *
 * Шкала бригады на время сценария сжата до 5 с на этап, входящий звонит
 * 5 с: иначе доклада старшего ждать минуту.
 */

const ПАРАМЕТРЫ = ['ui.phone', 'brigade.start_sec', 'brigade.arrive_sec', 'brigade.work_start_sec',
  'brigade.report_delay_sec', 'phone.ring_sec', 'phone.answer_sec'];
let было: Record<string, string> = {};
let карточка = '';

const поставить = (ключ: string, значение: string) =>
  sql(`UPDATE settings SET value = '${значение}' WHERE key = '${ключ}';`);

/** Своя служба приняла карточку — бригаду можно направлять. */
const принять = (page: Page, id: string) => page.evaluate(async (cardId) => {
  const t = localStorage.getItem('arm112.token');
  const h = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
  const me = await (await fetch('/api/auth/me', { headers: h })).json();
  const r = await fetch(`/api/cards/${cardId}/responses`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ serviceId: me.serviceId, status: 'Принята', comment: 'принято' }),
  });
  return r.status;
}, id);

test.describe('IP-телефон диспетчера ДДС', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    было = Object.fromEntries(ПАРАМЕТРЫ.map((k) => [k,
      sql(`SELECT value::text FROM settings WHERE key = '${k}';`).trim()]));
    поставить('ui.phone', '1');
    for (const k of ['brigade.start_sec', 'brigade.arrive_sec', 'brigade.work_start_sec', 'phone.ring_sec']) {
      поставить(k, '5');
    }
    поставить('brigade.report_delay_sec', '0');
    поставить('phone.answer_sec', '1');
  });
  test.afterAll(() => {
    for (const [k, v] of Object.entries(было)) if (v) поставить(k, v);
  });

  test('диспетчер звонит начальнику по телефону и докладывает', async ({ page }, info) => {
    await login(page, info, USERS.mchs);
    await page.getByTestId('practice-ai').click();
    await expect(page).toHaveURL(/#\/card-dds\//, { timeout: 30_000 });
    карточка = page.url().split('/').pop()!;

    const tel = page.getByTestId('ip-phone');
    await expect(tel).toBeVisible();
    await expect(page.getByTestId('phone-status')).toContainText('доступен');
    await expect(page.getByTestId('phone-extension')).toContainText(/доб\. \d{4}/);
    // Звонков кнопками в панелях больше нет — всё через телефон
    await expect(page.getByTestId('chief-via-phone')).toBeVisible();
    await expect(page.getByTestId('chief-start')).toHaveCount(0);

    await page.getByTestId('phone-call-chief').click();
    await expect(page.getByTestId('phone-display')).toContainText('Вышестоящий начальник');
    await expect(page.getByTestId('phone-timer')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('phone-status')).toContainText('разговор');
    const реплики = page.getByTestId('phone-lines').locator('li');
    await expect(реплики.first()).toContainText('Слушаю');

    await page.getByTestId('phone-text').fill('Докладываю обстановку');
    await page.getByTestId('phone-send').click();
    await expect(реплики).toHaveCount(3, { timeout: 15_000 });

    await page.getByTestId('phone-hangup').click();
    await expect(page.getByTestId('phone-status')).toContainText('доступен');
    // Положили трубку — начальник разбирает доклад
    await expect(page.getByTestId('chief-report')).toContainText('Принял', { timeout: 15_000 });

    await page.getByTestId('phone-tab-log').click();
    await expect(page.getByTestId('phone-log-row')).toHaveCount(1);
    await expect(page.getByTestId('phone-log-outcome')).toContainText('разговор');
  });

  test('старшему бригады звонят сами, и он звонит с докладом — входящий с АОН', async ({ page }, info) => {
    await login(page, info, USERS.mchs);
    await go(page, info, `/card-dds/${карточка}`);
    await expect(page.getByTestId('ip-phone')).toBeVisible();
    // Бригады ещё нет — звонить некому
    await expect(page.getByTestId('phone-call-brigade')).toBeDisabled();

    expect(await принять(page, карточка)).toBe(201);
    await page.reload();
    await page.getByTestId('brigade-assign').click();
    await expect(page.getByTestId('brigade-via-phone')).toBeVisible();
    await expect(page.getByTestId('brigade-call')).toHaveCount(0);

    // Входящий: старший докладывает о начале работ сам
    await expect(page.getByTestId('phone-accept')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('phone-display')).toContainText('АОН');
    await expect(page.getByTestId('phone-display')).toContainText('Старший бригады № 1');
    await page.getByTestId('phone-accept').click();
    await expect(page.getByTestId('phone-timer')).toBeVisible();
    await expect(page.getByTestId('phone-lines')).toContainText(/выехали|прибыли|приступили/);
    await page.getByTestId('phone-hangup').click();

    // Исходящий: диспетчер набирает старшего по номеру из книги
    await page.getByTestId('phone-tab-book').click();
    const номер = (await page.getByTestId('phone-call-brigade').getAttribute('title'))!.replace(/\D/g, '');
    await page.getByTestId('phone-dial').fill(номер);
    await page.getByTestId('phone-dial-go').click();
    await expect(page.getByTestId('phone-timer')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('phone-lines').locator('li').first()).not.toBeEmpty();
    await page.getByTestId('phone-hangup').click();

    // Следующий доклад не берём — вызов становится пропущенным
    await expect(page.getByTestId('phone-accept')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('phone-note')).toContainText('Пропущенный', { timeout: 15_000 });

    await page.getByTestId('phone-tab-log').click();
    const исходы = page.getByTestId('phone-log-outcome');
    await expect(исходы.first()).toHaveText('пропущен');
    await expect(page.getByTestId('phone-log')).toContainText('Старший бригады № 1');
  });

  test('незнакомый номер не обслуживается', async ({ page }, info) => {
    await login(page, info, USERS.mchs);
    await go(page, info, `/card-dds/${карточка}`);
    await page.getByTestId('phone-dial').fill('1234');
    await page.getByTestId('phone-dial-go').click();
    await expect(page.getByTestId('ip-phone').getByRole('alert')).toContainText('не обслуживается');
    await expect(page.getByTestId('phone-display')).toHaveCount(0);
  });

  test('преподаватель видит журнал вызовов диспетчера', async ({ page }, info) => {
    await login(page, info, 'teacher1');
    await go(page, info, `/card-dds/${карточка}`);
    const журнал = page.getByTestId('phone-journal');
    await expect(журнал).toBeVisible();
    await expect(журнал.getByTestId('phone-log-row').first()).toBeVisible();
    await expect(журнал).toContainText('Диспетчер:');
    await expect(журнал).toContainText('Вышестоящий начальник');
    // Сам преподаватель на линии не сидит
    await expect(page.getByTestId('ip-phone')).toHaveCount(0);
  });

  test('администратор выключает телефон — звонки снова кнопками в панелях', async ({ page }, info) => {
    await login(page, info, 'admin');
    await go(page, info, '/admin');
    await page.getByTestId('admin-tab-settings').click();
    const row = page.getByTestId('setting-ui.phone');
    await row.locator('input').fill('0');
    await row.getByRole('button', { name: 'сохранить' }).click();
    await expect(row).toContainText('Сохранено');

    await login(page, info, USERS.mchs);
    await go(page, info, `/card-dds/${карточка}`);
    await expect(page.getByTestId('brigade-panel')).toBeVisible();
    await expect(page.getByTestId('ip-phone')).toHaveCount(0);
    await expect(page.getByTestId('brigade-call')).toBeVisible();
  });
});
