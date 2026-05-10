import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  FaBookOpen,
  FaCalendarAlt,
  FaFilm,
  FaListOl,
  FaTrophy,
} from "react-icons/fa";
import AnimatedPage from "../../components/AnimatedPage";
import { SiteContainer } from "../../components/PageContainer";

const eventMonth = 9;

function getScareathonState() {
  const now = new Date();
  const isOctober = now.getMonth() === eventMonth;
  const year = now.getFullYear();
  const startsAt = new Date(year, eventMonth, 1);
  const nextStart = now > new Date(year, eventMonth + 1, 0, 23, 59, 59)
    ? new Date(year + 1, eventMonth, 1)
    : startsAt;
  const daysUntilStart = Math.max(
    0,
    Math.ceil((nextStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return { isOctober, daysUntilStart, year: nextStart.getFullYear() };
}

type SectionCard = {
  title: string;
  description: string;
  path: string;
  icon: ReactNode;
  active: boolean;
};

export default function Scareathon() {
  const { isOctober, daysUntilStart, year } = getScareathonState();
  const sections: SectionCard[] = [
    {
      title: "Today's Movie",
      description: "The daily watch pick with movie details and streaming options.",
      path: "/scareathon/today",
      icon: <FaFilm />,
      active: isOctober,
    },
    {
      title: "Calendar",
      description: "The full October movie schedule.",
      path: "/scareathon/calendar",
      icon: <FaCalendarAlt />,
      active: isOctober,
    },
    {
      title: "Scareboard",
      description: isOctober
        ? "Live movie scores, ranks, and past winner marks."
        : "Historical movie scores and past winner marks.",
      path: "/scareathon/scareboard",
      icon: <FaListOl />,
      active: true,
    },
    {
      title: "Rules",
      description: "How the October event works.",
      path: "/scareathon/rules",
      icon: <FaBookOpen />,
      active: true,
    },
  ];
  const sortedSections = [...sections].sort(
    (a, b) => Number(b.active) - Number(a.active)
  );

  return (
    <AnimatedPage className="calendar-background">
      <div className="calendar-gradient"></div>
      <SiteContainer
        as="main"
        className="relative z-10 flex flex-col gap-5 py-2 md:py-4"
      >
        <section className="grid gap-6 rounded-lg border border-red-950/70 bg-black/60 p-5 shadow-2xl md:grid-cols-[1fr,auto] md:items-center md:p-7">
          <div>
            <p className="font-zombie text-3xl tracking-wide text-red-500 md:text-4xl">
              Scareathon
            </p>
            <h1 className="mt-3 text-3xl font-bold text-orange-100 md:text-5xl">
              {isOctober ? "The October event is live" : `${year} event season`}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-orange-100/80">
              {isOctober
                ? "Daily movies, scoring, the calendar, and rules now live in one dedicated section."
                : ""}
            </p>
          </div>
          <div className="flex min-w-48 flex-col items-center justify-center rounded border border-amber-500/60 bg-amber-950/30 px-6 py-5 text-center text-amber-100">
            <FaTrophy className="mb-3 text-4xl text-amber-300" />
            <span className="text-sm uppercase tracking-widest text-amber-200">
              {isOctober ? "Status" : "Starts in"}
            </span>
            <span className="mt-1 text-3xl font-bold text-amber-300">
              {isOctober ? "Live" : `${daysUntilStart}d`}
            </span>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sortedSections.map((section) => {
            const card = (
              <div
                className={`flex h-full min-h-44 flex-col justify-between rounded-lg border p-5 transition ${
                  section.active
                    ? "border-red-900 bg-gray-950/80 hover:border-red-600 hover:bg-red-950/40"
                    : "border-gray-800 bg-gray-950/60 opacity-60"
                }`}
              >
                <div>
                  <div className="mb-4 flex items-center gap-3 text-3xl text-red-500">
                    {section.icon}
                    <h2 className="text-2xl font-bold text-orange-100">
                      {section.title}
                    </h2>
                  </div>
                  <p className="text-base text-orange-100/75">
                    {section.description}
                  </p>
                </div>
                <span className="mt-6 text-sm uppercase tracking-widest text-red-300">
                  {section.active ? "Open" : "Opens in October"}
                </span>
              </div>
            );

            return section.active ? (
              <Link key={section.title} to={section.path}>
                {card}
              </Link>
            ) : (
              <div key={section.title}>{card}</div>
            );
          })}
        </section>
      </SiteContainer>
    </AnimatedPage>
  );
}
