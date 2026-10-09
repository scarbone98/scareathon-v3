import { useState } from "react";
import Sheet from "../Sheet.tsx";
import { serif, typewriter } from "../style/theme.ts";

// DRAFT: the site owner must review these Privacy and Terms papers and supply contact details.
export default function LegalPapers({ signup = false }: { signup?: boolean }) {
  const [paper, setPaper] = useState<"Privacy" | "Terms" | null>(null);
  const link = "underline underline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";
  return (
    <>
      <p className="mt-3 text-sm">
        {signup ? "By signing up you agree to the " : "Papers at the ticket counter: "}
        <button type="button" className={link} onClick={() => setPaper("Terms")}>Terms</button>
        {signup ? " and " : " · "}
        <button type="button" className={link} onClick={() => setPaper("Privacy")}>Privacy</button>.
      </p>
      <Sheet sheet={paper ? { id: `legal-${paper}`, title: paper, body: (
        <article className="space-y-3 text-[15px] leading-relaxed text-[#2a1d14]" style={typewriter}>
          <h2 className="text-3xl" style={serif}>{paper}</h2>
          <p className="text-sm">Draft for the site owner to review · Last updated October 9, 2026</p>
          {paper === "Privacy" ? <>
            <p>Wayside Station stores your email and username to run your account, and your avatar and items, scores, coins and transactions, watched films, posts, photos, inbox mail, and chat to make the station work. Some live chat stays only in memory.</p>
            <p>Your email and private inbox are private. Your username, avatar, scores, standings, posts, shared photos, and lounge chat can be seen by other riders. Supabase hosts accounts and files; our hosting providers run the site and API.</p>
            <p>We do not sell your data or run ads. We use account and session information to keep you signed in and protect the station.</p>
            <p>In Settings, choose “Download my data” for a JSON copy, or “Close your account” to erase private data and free your email. Public scores, standings and past match results remain under “Deleted rider,” with no avatar. Copies other people downloaded cannot be recalled.</p>
            <p>Questions or requests? Contact the site owner. Owner review: add a public contact address before finalizing this paper.</p>
          </> : <>
            <p>The station is a place to play games, share posts and photos, and join the Scareathon. Keep your password and agent keys safe. Only upload content you have permission to share.</p>
            <p>Be kind to other riders. Do not harass people, post illegal material, cheat, or disrupt the service. The owner may remove harmful content or suspend abusive accounts.</p>
            <p>Coins and items are for use in the station. They have no cash value. Features, games and rewards may change, and the service may sometimes be unavailable.</p>
            <p>You can download your data or close your account in Settings. Private data is erased; public scores and results remain anonymously as “Deleted rider.” Read the Privacy paper for what we store and why.</p>
            <p>For help or concerns, contact the site owner. Owner review: add contact details and review these draft terms before finalizing.</p>
          </>}
        </article>
      ) } : null} onClose={() => setPaper(null)} above />
    </>
  );
}
