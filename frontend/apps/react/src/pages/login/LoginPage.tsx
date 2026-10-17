import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/entities/session/model';
import { useStand } from '@/entities/stand/model';
import type { DemoAccount } from '@/shared/api';
import s from './LoginPage.module.scss';

/** Кто это и что у него смотреть — подпись учётной записи стенда. */
const роль = (a: DemoAccount): [string, string] => {
  if (a.role === 'teacher') return ['Преподаватель', 'учебный материал и карточки от ИИ, занятия, аналитика'];
  if (a.role === 'admin') return ['Администратор', 'учётные записи, классификатор, параметры, журнал аудита'];
  if (a.duty === 'dds') return [`Диспетчер ДДС · ${a.service ?? ''}`, 'лента службы, статусы, бригада, тренировка с ИИ'];
  return ['Оператор 112', 'приём вызова и заполнение карточки 112'];
};

/**
 * Учебные учётные записи стенда — вход одним щелчком.
 *
 * Эксперты 18.10: «пароли и логины вывести на переднюю панель, чтобы мы
 * не искали их внутри технических решений». Список даёт сервер и только
 * на демонстрационном стенде; в рабочей установке его нет.
 */
const DemoAccess = ({ onPick, busy }: {
  onPick: (login: string, password: string) => void; busy: boolean;
}) => {
  const demo = useStand((st) => st.demo);
  if (!demo || demo.accounts.length === 0) return null;
  return (
    <section className={s.demo} aria-label="Учебные учётные записи" data-testid="demo-access">
      <h2 className={s.demoTitle}>Учебный стенд — войти одним щелчком</h2>
      <p className={s.demoHint}>
        Пароль у всех учётных записей: <code className={s.demoCode}>{demo.password}</code>
      </p>
      <ul className={s.demoList}>
        {demo.accounts.map((a) => {
          const [title, what] = роль(a);
          return (
            <li key={a.login}>
              <button type="button" className={s.demoBtn} disabled={busy}
                      data-testid={`demo-${a.login}`}
                      onClick={() => onPick(a.login, demo.password)}>
                <span className={s.demoRole}>{title}</span>
                <code className={s.demoLogin}>{a.login}</code>
                <span className={s.demoWhat}>{what}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Экран входа. Композиция повторяет боевой: иллюстрация города и форма справа. */
export const LoginPage = () => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [workstation, setWorkstation] = useState('4');
  const [busy, setBusy] = useState(false);
  const signIn = useSession((st) => st.signIn);
  const error = useSession((st) => st.error);
  const nav = useNavigate();

  const enter = async (who: string, secret: string) => {
    setBusy(true);
    const ok = await signIn(who, secret, workstation);
    setBusy(false);
    if (ok) nav('/journal');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await enter(login, password);
  };

  // Щелчок по учётной записи стенда заполняет форму и сразу входит:
  // видно, какой логин и пароль ушли, и не нужно жать «Войти»
  const pick = (who: string, secret: string) => {
    setLogin(who);
    setPassword(secret);
    void enter(who, secret);
  };

  return (
    <div className={s.page}>
      <div className={s.art} aria-hidden>
        <div className={s.sky} />
        <div className={s.city}>
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className={s.tower} style={{ ['--i' as string]: i }} />
          ))}
        </div>
      </div>

      <DemoAccess onPick={pick} busy={busy} />

      <form className={s.form} onSubmit={(e) => void submit(e)}>
        <h1 className={s.title}>
          <span className={s.logo}>112</span>
          <span className={s.subtitle}>ВХОД В СИСТЕМУ</span>
        </h1>

        <label className={s.field}>
          <span>логин:</span>
          <input value={login} onChange={(e) => setLogin(e.target.value)}
                 name="login" autoComplete="username" />
        </label>

        <label className={s.field}>
          <span>пароль:</span>
          <input type="password" value={password} name="password"
                 autoComplete="current-password"
                 onChange={(e) => setPassword(e.target.value)} />
        </label>

        <label className={s.field}>
          <span>номер АРМ:</span>
          <input value={workstation} onChange={(e) => setWorkstation(e.target.value)}
                 name="workstation" inputMode="numeric" />
        </label>

        {error && <div className={s.error} role="alert" data-testid="login-error">{error}</div>}

        <button className={s.submit} type="submit" disabled={busy}
                data-testid="login-submit">{busy ? '…' : 'ВОЙТИ'}</button>

        <div className={s.support}>
          <div className={s.supportTitle}>Техподдержка</div>
          <div>+7 (495) 197-89-81 (многоканальный)</div>
          <a className={s.mail} href="mailto:hd-112@mos.ru">hd-112@mos.ru</a>
        </div>
      </form>
    </div>
  );
};
