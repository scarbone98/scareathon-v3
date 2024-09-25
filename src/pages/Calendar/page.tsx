import AnimatedPage from "../../components/AnimatedPage";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../../components/LoadingSpinner";

export default function Calendar() {
  const { data, isLoading } = useQuery({
    queryKey: ["calendar"],
    queryFn: () =>
      fetchWithAuth("/calendar", {
        headers: { "Content-Type": "application/json" },
      }).then((res) => res.json()),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <AnimatedPage>
      <div className="bg-gray-100 p-4 md:p-6 lg:p-8 rounded-lg shadow-lg max-w-6xl mx-auto overflow-hidden">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <button className="text-xl md:text-2xl lg:text-3xl text-gray-600 hover:text-gray-800 transition-colors">
            &lt;
          </button>
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800">
            October 2024
          </h2>
          <button className="text-xl md:text-2xl lg:text-3xl text-gray-600 hover:text-gray-800 transition-colors">
            &gt;
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 md:gap-3 lg:gap-4">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
            <div
              key={`${day}-${index}`}
              className="hidden sm:block text-center font-semibold text-gray-600 mb-2 md:mb-3 lg:mb-4 text-xs md:text-sm lg:text-base"
            >
              {day}
            </div>
          ))}
          {data?.data.slice(1, 32).map((day: any, index: number) => (
            <div
              key={day.title}
              className="flex flex-col items-center justify-between bg-white rounded-lg shadow hover:bg-gray-200 transition-colors cursor-pointer p-3 h-40 w-full"
            >
              <span className="sm:hidden font-semibold text-gray-600 text-sm mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index % 7]}
              </span>
              <div className="text-gray-700 text-lg sm:text-xl md:text-2xl lg:text-3xl flex flex-col items-center space-y-2 w-full">
                <span className="font-bold">{index + 1}</span>
                <img
                  src={day.lowResUrl}
                  alt=""
                  className="w-full h-20 object-cover aspect-square"
                />
                {/* <span className="text-sm sm:text-base w-full text-center overflow-hidden overflow-ellipsis">
                  {day.title || ""}
                </span> */}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  );
}
