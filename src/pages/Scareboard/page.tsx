import AnimatedPage from "../../components/AnimatedPage";
import LoadingSpinner from "../../components/LoadingSpinner";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";

export default function Scareboard() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchWithAuth("/leaderboard").then((res) => res.json()),
  });

  if (error) return <div>Error: {error.message}</div>;
  if (isLoading) return <LoadingSpinner />;

  // Get the keys from the first data item, excluding 'name'
  const keys = data?.data?.[0]
    ? Object.keys(data.data[0]).filter((key) => key !== "name")
    : [];

  return (
    <AnimatedPage>
      <div className="bg-gray-100 p-4 md:p-6 lg:p-8 rounded-lg shadow-lg max-w-4xl mx-auto">
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
              {data?.data?.map((user: any, index: number) => (
                <tr
                  key={index}
                  className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}
                >
                  <td className="py-4 px-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {index + 1}
                  </td>
                  <td className="py-4 px-4 whitespace-nowrap text-sm text-gray-500">
                    {user.name}
                  </td>
                  {keys.map((key) => (
                    <td
                      key={key}
                      className="py-4 px-4 whitespace-nowrap text-sm text-gray-500"
                    >
                      {user[key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AnimatedPage>
  );
}
