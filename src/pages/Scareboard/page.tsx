import AnimatedPage from "../../components/AnimatedPage";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import { motion, AnimatePresence } from "framer-motion";

export default function Scareboard() {
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
  });

  if (error) return <div>Error: {error.message}</div>;
  if (isLoading) return <LoadingSpinner />;

  // Get the keys from the first data item, excluding 'name'
  const keys = data?.leaderboard?.data?.[0]
    ? Object.keys(data.leaderboard.data[0]).filter((key) => key !== "name")
    : [];

  const tableRowVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: index < 3 ? (index + 1) * 0.5 : 1.5 + (index - 3 + 1) * 0.05,
        duration: index < 3 ? 0.8 : 0.5,
      },
      scale: index < 3 ? [1, 1.075 - 0.025 * index, 1] : 1,
    }),
  };

  const getRowStyle = (index: number) => {
    if (index === 0) return "bg-yellow-100 text-yellow-800 font-bold";
    if (index === 1) return "bg-gray-100 text-gray-800 font-semibold";
    if (index === 2) return "bg-orange-100 text-orange-800 font-semibold";
    return index % 2 === 0 ? "bg-gray-50" : "bg-white";
  };

  const getRankStyle = (index: number) => {
    if (index === 0) return "bg-yellow-500 text-white";
    if (index === 1) return "bg-gray-400 text-white";
    if (index === 2) return "bg-orange-500 text-white";
    return "text-gray-900";
  };

  const getPastWinYear = (name: string) => {
    const winner = data?.pastWinners?.data?.find(
      (winner: any) => winner.name === name
    );
    return winner ? winner.year.slice(2, 4) : null;
  };

  const StarWithYear = ({ year }: { year: number }) => (
    <svg
      className="h-6 w-6 text-yellow-400 ml-2"
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
    <AnimatedPage>
      <motion.div
        layout
        className="p-2 md:p-4 lg:p-6 rounded-lg shadow-lg max-w-4xl mx-auto"
      >
        <div className="overflow-x-auto">
          <table className="w-full bg-white shadow-md rounded-lg overflow-hidden">
            <thead className="bg-gray-200">
              <tr>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Rank
                </th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Player
                </th>
                {keys.map((key) => (
                  <th
                    key={key}
                    className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <AnimatePresence>
                {data?.leaderboard?.data?.map((user: any, index: number) => (
                  <motion.tr
                    key={user.name}
                    className={getRowStyle(index)}
                    variants={tableRowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    custom={index}
                    layout
                  >
                    <td
                      className={`py-4 px-4 whitespace-nowrap text-sm font-medium ${getRankStyle(
                        index
                      )}`}
                    >
                      {index + 1}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap text-sm text-gray-500 flex items-center">
                      {user.name}
                      {(() => {
                        const winYear = getPastWinYear(user.name);
                        return winYear ? <StarWithYear year={winYear} /> : null;
                      })()}
                    </td>
                    {keys.map((key) => (
                      <td
                        key={key}
                        className="py-4 px-4 whitespace-nowrap text-sm text-gray-500"
                      >
                        {user[key]}
                      </td>
                    ))}
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
