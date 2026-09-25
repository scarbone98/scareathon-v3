import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FaCheck, FaTimes } from "react-icons/fa";
import AnimatedPage from "../../components/AnimatedPage";
import { SiteContainer } from "../../components/PageContainer";
import { arcadeApi, buttonClass, primaryButtonClass, Section } from "./ui.tsx";

// /arcade/connect?code=XXXX-XXXX: where a player approves their AI's
// scareathon-arcade-mcp server signing in as them. The MCP server shows the
// link and code; approving hands it an arcade token (see routes/arcadeCommunity.js).

type DeviceLogin = {
  userCode: string;
  clientName: string;
  status: "pending" | "approved" | "denied" | "completed" | "expired";
  createdAt: string;
};

function CodeForm({ onCode }: { onCode: (code: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onCode(value.trim().toUpperCase());
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="XXXX-XXXX"
        aria-label="Code from your AI"
        className="w-40 rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-orange-50 placeholder:text-orange-100/35"
      />
      <button type="submit" className={primaryButtonClass}>
        Continue
      </button>
    </form>
  );
}

export default function ArcadeConnect() {
  const [searchParams, setSearchParams] = useSearchParams();
  const code = searchParams.get("code") ?? "";

  const me = useQuery({ queryKey: ["arcade", "me"], queryFn: () => arcadeApi<{ username: string }>("/arcade/me") });
  const login = useQuery({
    queryKey: ["arcade", "device", code],
    enabled: Boolean(code),
    retry: false,
    queryFn: () => arcadeApi<DeviceLogin>(`/arcade/device/${encodeURIComponent(code)}`),
  });
  const answer = useMutation({
    mutationFn: (choice: "approve" | "deny") =>
      arcadeApi(`/arcade/device/${encodeURIComponent(code)}/${choice}`, { method: "POST", body: {} }).then(() => choice),
  });

  let body;
  if (!code) {
    body = (
      <>
        <p className="mb-3 text-sm text-orange-50/80">Enter the code your AI showed you.</p>
        <CodeForm onCode={(value) => setSearchParams({ code: value })} />
      </>
    );
  } else if (login.isLoading) {
    body = <p className="text-sm text-orange-100/60">Looking up the code…</p>;
  } else if (login.isError) {
    body = (
      <>
        <p className="mb-3 text-sm text-red-300">{login.error.message}. Check the code, or ask your AI to sign in again.</p>
        <CodeForm onCode={(value) => setSearchParams({ code: value })} />
      </>
    );
  } else if (answer.data === "approve") {
    body = (
      <p className="flex items-center gap-2 text-emerald-200">
        <FaCheck aria-hidden="true" /> Connected. Head back to your AI: it can submit games as {me.data?.username ?? "you"} now.
      </p>
    );
  } else if (answer.data === "deny") {
    body = <p className="text-orange-100/80">Declined. Your AI wasn't connected.</p>;
  } else if (login.data && login.data.status !== "pending") {
    body = (
      <p className="text-sm text-orange-100/70">
        {login.data.status === "expired"
          ? "This sign-in has expired. Ask your AI to sign in again for a new link."
          : "This sign-in was already answered."}
      </p>
    );
  } else if (login.data) {
    body = (
      <>
        <p className="mb-4 text-orange-50/90">
          <strong className="text-orange-200">{login.data.clientName}</strong> wants to submit arcade games as{" "}
          <strong className="text-orange-200">{me.data?.username ?? "you"}</strong>.
        </p>
        <p className="mb-1 text-sm text-orange-100/70">Check this matches the code your AI showed you:</p>
        <p className="mb-4 font-mono text-3xl tracking-widest text-orange-300">{login.data.userCode}</p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-orange-50/75">
          <li>It can submit games (always as drafts for review) and see your games.</li>
          <li>It can't spend coins, post, message anyone or change your account.</li>
          <li>You can disconnect it any time on the Make a game page.</li>
        </ul>
        <p className="mb-4 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Only approve if you just asked your own AI to sign in. If someone sent you this link, decline it.
        </p>
        {answer.isError && <p className="mb-3 text-sm text-red-300">{answer.error.message}</p>}
        <div className="flex gap-2">
          <button type="button" className={primaryButtonClass} disabled={answer.isPending} onClick={() => answer.mutate("approve")}>
            <FaCheck aria-hidden="true" /> Approve
          </button>
          <button type="button" className={buttonClass} disabled={answer.isPending} onClick={() => answer.mutate("deny")}>
            <FaTimes aria-hidden="true" /> Decline
          </button>
        </div>
      </>
    );
  }

  return (
    <AnimatedPage>
      <div className="min-h-[var(--vh)] bg-[#0a070d]">
        <SiteContainer className="max-w-xl space-y-6 py-8 text-orange-50">
          <header>
            <Link to="/arcade/create" className="text-sm text-orange-300 underline">
              ← Make a game
            </Link>
            <h1 className="mt-2 text-3xl font-extrabold text-orange-300">Connect your AI</h1>
          </header>
          <Section title="Sign-in request">{body}</Section>
        </SiteContainer>
      </div>
    </AnimatedPage>
  );
}
