"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/src/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-[var(--fg-mut)] transition hover:bg-[var(--card)] hover:text-[var(--fg)]"
      onClick={async () => {
        await signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
