import Link from "next/link";
import { listAccounts } from "@/src/db/accounts";
import { getProfile } from "@/src/db/profile";
import { AccountsManager, type ClientAccount } from "./_components/accounts-manager";

export const dynamic = "force-dynamic";

// The "financial reality map": the user's banks / fintech apps / exchanges /
// wallets / cash. Set up once, rarely changed. (Lives under /money.)
export default async function AccountsPage() {
  const [rows, profile] = await Promise.all([listAccounts({ includeArchived: true }), getProfile()]);
  const accounts: ClientAccount[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    institution: a.institution,
    currentBalance: a.currentBalance,
    notes: a.notes,
    archived: a.archived ? a.archived.toISOString() : null,
  }));
  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-5 pb-8 md:max-w-lg md:px-6 md:pt-7">
      <div className="wf-rise">
        <Link href="/money" className="text-[12px] text-[var(--fg-mut)] underline-offset-2 hover:underline">← Money</Link>
        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="font-display text-xl font-semibold tracking-tight">Accounts</h1>
          <span className="text-[11px] text-[var(--fg-faint)]">
            display {profile.displayCurrencyPref} · home {profile.homeCurrency}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-[var(--fg-mut)]">
          Every bank, fintech app, exchange, wallet and cash stash you use. Balances update as you upload
          screenshots — enter rough current balances here to start.
        </p>
      </div>
      <AccountsManager initialAccounts={accounts} />
    </div>
  );
}
