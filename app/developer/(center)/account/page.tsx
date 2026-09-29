import { listDevelopers, requireDeveloper } from '@/lib/dev-auth';
import { ago } from '@/lib/format';
import { DevCard, DevHeader } from '@/components/developer/DevUi';
import { CreateDeveloper, DevPassword } from '@/components/developer/DevAccountForms';
import { deleteDeveloperAction } from '../../actions';

export const metadata = { title: 'Developer accounts' };

export default async function DevAccounts() {
  const me = await requireDeveloper();
  const devs = await listDevelopers();
  return (
    <>
      <DevHeader title="Developer accounts" subtitle="Separate from business staff. Recovery without email: npm run reset-developer -- <id> <new-password>." />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <DevCard title="Developers">
          <ul className="divide-y divide-white/[0.05]">
            {devs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="flex-1">
                  <span className="font-semibold text-white">{d.username}</span> {d.id === me.user.id && <span className="text-[11px] text-white/40">(you)</span>}
                  <span className="block text-[12px] text-white/45">
                    {d.email || 'no email'} · last sign-in {ago(d.last_login_at)}
                  </span>
                </span>
                {d.id !== me.user.id && devs.length > 1 && (
                  <form action={deleteDeveloperAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="text-[12px] text-red-300/80 hover:text-red-300">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </DevCard>
        <div className="space-y-4">
          <DevCard title="Add a developer">
            <CreateDeveloper />
          </DevCard>
          <DevCard title="Your password">
            <DevPassword />
          </DevCard>
        </div>
      </div>
    </>
  );
}
