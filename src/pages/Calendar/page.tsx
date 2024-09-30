import React, { useState, useEffect } from "react";
import AnimatedPage from "../../components/AnimatedPage";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";
import AnimatedMovieDetail from "./AnimatedMovieDetail";
import { AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

export default function Calendar() {
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState<any | null>(null);
  const [initialPosition, setInitialPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Adjust this breakpoint as needed
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["calendar"],
    queryFn: () =>
      fetchWithAuth("/calendar", {
        headers: { "Content-Type": "application/json" },
      }).then((res) => res.json()),
    staleTime: 1000 * 60 * 60 * 1,
    initialData: () => {
      // Use the previous cached data if available
      return queryClient.getQueryData(["calendar"]);
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error.message} />;

  // Get the current year and set the month to October (9 because months are 0-indexed)
  const currentDate = new Date();
  currentDate.setMonth(9); // Set to October
  currentDate.setDate(1); // Set to the first day of the month

  const getFirstDayOfMonth = (date: Date) => {
    return date.getDay();
  };

  const generateEmptyCells = (date: Date) => {
    const firstDay = getFirstDayOfMonth(date);
    return Array(firstDay)
      .fill(null)
      .map((_, index) => (
        <div key={`empty-${index}`} className="hidden sm:block"></div>
      ));
  };

  const handleDayClick = (
    day: any,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (isMobile) return; // Don't do anything on mobile

    const rect = event.currentTarget.getBoundingClientRect();
    setInitialPosition({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    setSelectedDay(day);
  };

  return (
    <AnimatedPage className="calendar-background pb-8">
      <div className="calendar-gradient"></div>
      <div className="p-4 md:p-6 lg:p-8 rounded-lg shadow-lg max-w-6xl mx-auto overflow-hidden">
        <div className="flex justify-center items-center mb-4 md:mb-6">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-orange-800">
            {currentDate.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 md:gap-3 lg:gap-4">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
            (day, index) => (
              <div
                key={`${day}-${index}`}
                className="hidden sm:block text-center font-semibold text-orange-700 mb-2 md:mb-3 lg:mb-4 text-xs md:text-sm lg:text-base"
              >
                {day}
              </div>
            )
          )}
          {generateEmptyCells(currentDate)}
          {data?.data.slice(1, 32).map((day: any, index: number) => (
            <div key={day.title} className="flex justify-center">
              <div
                className="flex flex-col items-center justify-between rounded-lg shadow-md hover:bg-orange-200 transition-colors cursor-pointer p-3 h-[450px] md:h-[225px] w-3/4 md:w-full"
                onClick={(e) => handleDayClick(day, e)}
              >
                <span className="font-semibold text-orange-700 mb-2 flex flex-row justify-center space-x-1.5 w-full text-xl relative">
                  <div className="md:hidden">
                    {
                      [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ][(index + getFirstDayOfMonth(currentDate)) % 7]
                    }
                  </div>
                  <div className="md:absolute md:bg-white md:bg-opacity-50 md:backdrop-blur-sm md:rounded-lg md:p-2 md:top-0 md:left-0 md:z-10">
                    {index + 1}
                    {index + 1 === 1
                      ? "st"
                      : index + 1 === 2
                      ? "nd"
                      : index + 1 === 3
                      ? "rd"
                      : "th"}
                  </div>
                </span>
                <div className="text-orange-800 text-lg sm:text-xl md:text-2xl lg:text-3xl flex flex-col items-center w-full h-full">
                  <div className="flex-[5] w-full relative md:flex-2">
                    <img
                      src={day.lowResUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-fit rounded-md"
                    />
                  </div>
                  <div className="text-orange-700 text-lg w-full overflow-hidden text-ellipsis whitespace-nowrap items-center">
                    {day.title}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {!isMobile && selectedDay && (
          <AnimatedMovieDetail
            day={selectedDay}
            onClose={() => setSelectedDay(null)}
            initialPosition={initialPosition}
          />
        )}
      </AnimatePresence>
    </AnimatedPage>
  );
}
