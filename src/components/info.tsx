"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ShieldCheck,
  Compass,
  Users,
  Trophy,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { ChessArt } from "./ui";
import { useApp } from "./provider";
import { api } from "@/lib/supabase";
export function About() {
  return (
    <div className="page">
      <div className="about-hero">
        <div className="eyebrow">CHESS. ELEVATED.</div>
        <h1>
          For the love of the game.
          <br />
          <span className="orange-text">And the thrill of the next one.</span>
        </h1>
        <p>
          Knightfall is a home for competitive chess communities. We make
          finding, organizing, and entering online tournaments feel as good as
          playing them.
        </p>
        <Link className="button" href="/tournaments">
          Find your arena
          <ArrowUpRight size={17} />
        </Link>
        <ChessArt hero />
      </div>
      <div className="about-values">
        {[
          {
            icon: Compass,
            title: "Discover your challenge",
            body: "Find events by pace, rating, format, and entry fee. Every event gives you the details you need before you register.",
          },
          {
            icon: Users,
            title: "Bring your people",
            body: "Website accounts and Chess.com players are separate. Register yourself, a friend, or a club player with their permission.",
          },
          {
            icon: ShieldCheck,
            title: "Compete with confidence",
            body: "Clear eligibility checks, secure payments, and organizer-reviewed results keep the focus on the board.",
          },
        ].map((v) => (
          <div className="panel" key={v.title}>
            <v.icon size={27} />
            <h2>{v.title}</h2>
            <p>{v.body}</p>
          </div>
        ))}
      </div>
      <div className="panel about-explainer">
        <div>
          <div className="eyebrow">ONE SIMPLE WORKFLOW</div>
          <h2>
            Organized here.
            <br />
            Played on Chess.com.
          </h2>
        </div>
        <div>
          <p>
            We handle registration, eligibility, payments, check-in, and
            tournament information. Chess.com handles pairings, clocks, games,
            and its own fair play systems.
          </p>
          <p>
            Organizers create the event on Chess.com and publish its lobby link
            on Knightfall. Players must join the Chess.com lobby separately;
            registration here never grants access to someone’s Chess.com
            account.
          </p>
          <p className="muted">
            Knightfall is independent and is not affiliated with or endorsed by
            Chess.com.
          </p>
        </div>
      </div>
    </div>
  );
}
const faqs = [
  [
    "How do I register for a tournament?",
    "Choose a tournament, sign in, and enter the Chess.com username of the player you want to register. We check the public profile and eligibility. Accept the rules and complete payment if required. Your dashboard shows the entry status.",
  ],
  [
    "Can I register another player?",
    "Yes. Your website account is separate from the Chess.com player. You can register any eligible player with their permission. The same player cannot have multiple active entries in the same tournament.",
  ],
  [
    "Where are the games played?",
    "All games are played on Chess.com. Open the organizer’s tournament lobby link and join separately before the first round. You must have access to the Chess.com account that will play.",
  ],
  [
    "What happens after I pay?",
    "Razorpay processes the payment. Our server verifies the signature and captured payment before confirming an entry. If approval is manual, the entry remains pending until the organizer reviews it.",
  ],
  [
    "How does check-in work?",
    "Approved entries can check in from My registrations during the 30 minutes before the event. Check-in on Knightfall does not join the Chess.com tournament; open the lobby link too.",
  ],
  [
    "Can I cancel or request a refund?",
    "Withdraw an active entry from your dashboard before the tournament starts. Paid entries move to refund review. The organizer issues approved refunds to the original payment method through Razorpay. See the refund policy for details.",
  ],
  [
    "What if a payment or Chess.com lookup fails?",
    "Never pay again without checking My registrations. An incomplete checkout can be resumed during the 15-minute reservation window. If Chess.com is unavailable, wait and retry; unverified players cannot enter live events.",
  ],
  [
    "How are standings updated?",
    "Organizers import reviewed results after the event. Standings are not automatically synchronized with Chess.com. The published table ranks by score, then tie-break.",
  ],
  [
    "How can I host a tournament?",
    "An administrator must grant your website account organizer access. Organizers can create drafts, set entry rules and fees, add their Chess.com lobby, manage entries, and publish reviewed results.",
  ],
];
export function Help() {
  const app = useApp();
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (!app.demo)
      api("settings/public")
        .then((s) => setEmail(s.support_email))
        .catch(() => {});
  }, [app.demo]);
  return (
    <div className="page narrow-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">A LITTLE HELP WITH YOUR NEXT MOVE</div>
          <h1>
            We’ve got your back<span className="orange-text">.</span>
          </h1>
          <p>
            Everything you need to get from registration to the first round.
          </p>
        </div>
      </div>
      <div className="faq-list">
        {faqs.map(([q, a]) => (
          <details key={q}>
            <summary>
              {q}
              <ChevronDown size={18} />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <div className="panel help-contact">
        <h2>Need a human?</h2>
        <p>
          For event-specific questions, contact the organizer listed on the
          tournament page. Include the event name, Chess.com username, and your
          registration ID. Never send passwords or payment credentials.
        </p>
        {email ? (
          <a className="button secondary" href={"mailto:" + email}>
            Contact support
            <ArrowUpRight size={16} />
          </a>
        ) : (
          <Link className="button secondary" href="/community">
            Ask the community
            <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
const legal: Record<string, { title: string; sections: [string, string][] }> = {
  privacy: {
    title: "Privacy policy",
    sections: [
      [
        "What we collect",
        "Website account details, registrations you submit, public Chess.com profile information used for eligibility, community content, and payment references are stored to operate the platform. Razorpay handles payment details; Knightfall does not collect card numbers or banking passwords.",
      ],
      [
        "How information is used",
        "We use this information to manage entries, prevent duplicate registrations, check eligibility, communicate event updates, support refunds, and moderate the community. Approved player usernames and ratings may appear in participant lists and standings.",
      ],
      [
        "Service providers",
        "Supabase supplies authentication and database storage. Vercel hosts the application. Razorpay processes payments. Chess.com provides public player information and independently hosts games. Each provider has its own privacy terms.",
      ],
      [
        "Your choices",
        "Update your display name in account settings. Contact the organizer or configured support address for data access, correction, or deletion requests. Some payment and audit records may need to be retained to resolve disputes or meet applicable obligations.",
      ],
      [
        "Demo mode",
        "Demo entries, posts, and account preferences are stored in your browser. Clearing browser storage removes them. Demo mode does not process real payments or create live registrations.",
      ],
      [
        "Operator details",
        "Before accepting live registrations, the platform operator must publish their legal name, contact address, support email, jurisdiction, and specific retention schedule. These operational details are not configured in this preview.",
      ],
    ],
  },
  terms: {
    title: "Terms of participation",
    sections: [
      [
        "The platform",
        "Knightfall manages event discovery, registrations, payments, and tournament information. Actual games, pairings, clocks, and Chess.com account access are handled on Chess.com. Knightfall is independent of Chess.com.",
      ],
      [
        "Accounts and player permission",
        "Provide accurate website account information. You may register any eligible Chess.com player with their permission. Registering a player does not establish ownership of their Chess.com account.",
      ],
      [
        "Entry and eligibility",
        "An entry is confirmed only when required payment is captured and eligibility and organizer approval requirements are satisfied. Rating, account age, deadline, capacity, and duplicate-entry checks apply.",
      ],
      [
        "Event rules",
        "Join the published Chess.com lobby on time. Follow the organizer’s rules and Chess.com fair play requirements. No engines, outside assistance, harassment, or manipulated ratings.",
      ],
      [
        "Prizes and results",
        "Organizer-published prize distribution, reviewed standings, tie-break rules, eligibility, and payout terms govern an event. Prize amounts in the demo are illustrative and are not offers of real prizes.",
      ],
      [
        "Changes and cancellations",
        "Organizers must communicate material changes and cancellation decisions. Paid withdrawals and canceled events are reviewed under the refund policy.",
      ],
      [
        "Live launch requirements",
        "The operating entity must publish its legal identity, contact details, applicable jurisdiction, age/consent rules, and any required event-specific terms before opening paid events. This preview is for evaluating the product.",
      ],
    ],
  },
  refunds: {
    title: "Refund & cancellation policy",
    sections: [
      [
        "Before an event",
        "Use My registrations to withdraw before the tournament starts. An eligible paid withdrawal is recorded as refund requested. The organizer reviews and initiates the refund; withdrawing does not instantly transfer funds.",
      ],
      [
        "Organizer cancellation",
        "Cancelling an event withdraws active entries and queues paid entries for full refund. Organizers initiate refunds through the organizer studio. Players receive a status update when the refund is processed.",
      ],
      [
        "Failed or delayed payments",
        "Unpaid reservations last 15 minutes. A captured payment received after the reservation expires is flagged for a refund instead of silently confirming an oversold entry. Check your dashboard before retrying payment.",
      ],
      [
        "Refund method and timing",
        "Approved refunds are sent through Razorpay to the original payment method. Processing time depends on the payment provider and bank; no fixed settlement date is guaranteed by this preview.",
      ],
      [
        "After play begins",
        "After the scheduled start, dashboard withdrawal is closed. Contact the organizer to discuss disconnections, no-shows, fair play decisions, or other disputes under the published event rules.",
      ],
      [
        "Contact",
        "Use the support contact configured by the operator or the organizer contact in the tournament description. Provide your registration ID and payment reference, never card or account credentials.",
      ],
    ],
  },
  "fair-play": {
    title: "Our fair play promise",
    sections: [
      [
        "Play your own moves",
        "No engines, assistance from another player, opening-book consultation during games where prohibited, or shared account access. Chess.com’s fair play requirements apply to every game.",
      ],
      [
        "Respect the field",
        "No sandbagging, deliberate rating manipulation, abusive messages, or attempts to enter the same player multiple times. Organizers may review public profile information when checking eligibility.",
      ],
      [
        "Review before reward",
        "Organizers review results before awarding prizes. Suspicious results can be withheld while the organizer and applicable platform review them. Knightfall does not claim to operate its own chess cheat-detection engine.",
      ],
      [
        "Raise concerns responsibly",
        "Report relevant facts privately to the event organizer or through Chess.com’s reporting tools. Avoid public accusations or sharing personal information.",
      ],
    ],
  },
};
export function Legal({ slug }: { slug: string }) {
  const page = legal[slug] || legal.terms;
  const app = useApp();
  return (
    <div className="page narrow-page">
      <div className="eyebrow">THE RULES OF OUR ARENA</div>
      <h1>{page.title}</h1>
      <p className="muted">Last updated 31 October 2026</p>
      {app.settings?.operator_name && (
        <div className="panel prose">
          <p>
            Operated by <strong>{app.settings.operator_name}</strong>
          </p>
          <p>{app.settings.jurisdiction}</p>
          <p>
            Support:{" "}
            <a href={"mailto:" + app.settings.support_email}>
              {app.settings.support_email}
            </a>
          </p>
          <p>
            Retention review period: {app.settings.retention_days} days.
            Payment, audit and dispute records may be retained as required by
            applicable law.
          </p>
        </div>
      )}
      <div className="panel prose">
        {page.sections
          .filter(
            ([title]) =>
              !app.settings?.operator_name ||
              !["Operator details", "Live launch requirements"].includes(title),
          )
          .map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
      </div>
    </div>
  );
}
