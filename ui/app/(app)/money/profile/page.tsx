import Link from "next/link";
import { getProfileNormalized, COMMON_PAYMENT_RAILS } from "@/src/db/profile";
import { ProfileForm } from "./_components/profile-form";

export const dynamic = "force-dynamic";

// "Profile" — your financial reality, the parts the app can't infer: geography,
// display/home currency, and the **capability graph** (what you can realistically
// do — invest in US stocks, hold foreign currency, move money internationally, the
// payment rails you use). The agents read this and are told never to assume; what
// you set here directly shapes the suggestions.
export default async function ProfilePage() {
  const p = await getProfileNormalized();
  return (
    <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-5 pb-8 md:max-w-lg md:px-6 md:pt-7">
      <div className="wf-rise">
        <Link href="/money" className="text-[12px] text-[var(--fg-mut)] underline-offset-2 hover:underline">← Money</Link>
        <h1 className="mt-2 font-display text-xl font-semibold tracking-tight">Your financial reality</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-mut)]">
          The things the app can&apos;t infer. The strategist reads this and is told <span className="text-[var(--fg-dim)]">never to assume</span> —
          if something here says &quot;not sure&quot;, it&apos;ll ask instead of guessing. Be honest; this is what makes the ideas grounded.
        </p>
      </div>
      <ProfileForm
        initial={{
          geography: p.geography ?? "",
          displayCurrencyPref: p.displayCurrencyPref,
          homeCurrency: p.homeCurrency,
          capabilityGraph: p.capabilityGraph,
        }}
        commonRails={[...COMMON_PAYMENT_RAILS]}
      />
    </div>
  );
}
