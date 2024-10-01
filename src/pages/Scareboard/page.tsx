import AnimatedPage from "../../components/AnimatedPage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

export default function Scareboard() {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const [leaderboardRes, pastWinnersRes] = await Promise.all([
        fetchWithAuth("/leaderboard"),
        fetchWithAuth("/past-winners"),
      ]);
      const leaderboard = await leaderboardRes.json();
      const pastWinners = await pastWinnersRes.json();
      return { leaderboard, pastWinners };
    },
    initialData: () => {
      // Use the previous cached data if available
      return queryClient.getQueryData(["leaderboard"]);
    },
    staleTime: 1000 * 60 * 60 * 1,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error?.message} />;

  // Get the keys from the first data item, excluding 'name'
  const keys = data?.leaderboard?.data?.[0]
    ? Object.keys(data.leaderboard.data[0]).filter((key) => key !== "name")
    : [];

  const totalKey = "total"; // Assume 'total' is the key for the total column
  const otherKeys = keys.filter(
    (key) => key !== totalKey && key !== "name" && key !== "rank"
  );

  const tableRowVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: index < 3 ? (index + 1) * 0.5 : 1.5 + index * 0.075,
        duration: index < 3 ? 0.8 : 0.5,
      },
      scale: index < 3 ? [1, 1.075 - 0.025 * index, 1] : 1,
    }),
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "text-yellow-300 glow-text-yellow";
    if (rank === 2) return "text-silver-300 glow-text-silver";
    if (rank === 3) return "text-bronze-300 glow-text-bronze";
    return "text-red-500";
  };

  const getPastWinYear = (name: string) => {
    const winner = data?.pastWinners?.data?.find(
      (winner: any) => winner.name === name
    );
    return winner ? winner.year.slice(2, 4) : null;
  };

  const StarWithYear = ({ year }: { year: number }) => (
    <svg
      className="h-6 w-6 text-yellow-500 ml-2 star-pulse"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      <text
        x="12"
        y="13"
        fontSize="8"
        fill="black"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {year}
      </text>
    </svg>
  );

  return (
    <AnimatedPage className="calendar-background">
      <div className="calendar-gradient"></div>
      <motion.div
        layout
        className="p-2 md:p-4 lg:p-6 max-w-4xl mx-auto tracking-widest"
      >
        <div className="overflow-x-auto">
          <table className="w-full shadow-md rounded-lg overflow-hidden">
            <thead className="bg-gray-900 bg-opacity-50">
              <tr>
                <th className="py-3 px-4 text-left text-lg font-semibold text-red-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="py-3 px-4 text-left text-lg font-semibold text-red-500 uppercase tracking-wider">
                  Player
                </th>
                {otherKeys.map((header) => (
                  <th
                    key={header}
                    className="py-3 px-4 text-left text-lg font-semibold text-red-500 uppercase tracking-wider hidden md:table-cell"
                  >
                    {header}
                  </th>
                ))}
                <th className="py-3 px-4 text-left text-lg font-semibold text-red-500 uppercase tracking-wider">
                  {totalKey}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              <AnimatePresence>
                {data?.leaderboard?.data?.map((user: any, index: number) => (
                  <motion.tr
                    key={user.name}
                    className="bg-gray-950 bg-opacity-50 transition-colors"
                    variants={tableRowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    custom={index}
                    layout
                  >
                    <td
                      className={`py-4 px-4 whitespace-nowrap text-lg font-medium ${getRankStyle(
                        user.rank
                      )}`}
                    >
                      {user.rank}
                    </td>
                    <td
                      className={`py-4 px-4 whitespace-nowrap text-lg font-medium flex items-center ${getRankStyle(
                        user.rank
                      )}`}
                    >
                      {user.name}
                      {(() => {
                        const winYear = getPastWinYear(user.name);
                        return winYear ? <StarWithYear year={winYear} /> : null;
                      })()}
                    </td>
                    {otherKeys.map((key) => (
                      <td
                        key={key}
                        className="py-4 px-4 whitespace-nowrap text-lg text-red-500 hidden md:table-cell"
                      >
                        {user[key]}
                      </td>
                    ))}
                    <td className="py-4 px-4 whitespace-nowrap text-lg text-red-500">
                      {user[totalKey]}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </motion.div>
    </AnimatedPage>
  );
}
