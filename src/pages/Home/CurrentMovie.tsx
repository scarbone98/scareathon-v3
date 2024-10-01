import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";

export default function CurrentMovie() {
  const {
    data: calendarData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["calendar"],
    queryFn: () =>
      fetchWithAuth("/calendar", {
        headers: { "Content-Type": "application/json" },
      }).then((res) => res.json()),
    staleTime: 1000 * 60 * 60 * 1, // 1 hour
  });

  const getCurrentMovie = () => {
    if (!calendarData) return null;
    
    // Create a date object for the current time in EST
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dayOfMonth = today.getDate();
    return calendarData.data[dayOfMonth];
  };

  const currentMovie = getCurrentMovie();

  if (isLoading) {
    return (
      <p className="text-xl md:text-2xl text-blood-red font-eerie">
        Loading today's movie...
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-xl md:text-2xl text-blood-red font-eerie">
        Error loading movie data.
      </p>
    );
  }

  if (!currentMovie) {
    return (
      <p className="text-xl md:text-2xl text-blood-red font-eerie">
        No movie data available for today.
      </p>
    );
  }

  return (
    <div className="text-blood-red relative">
      <h2 className="text-3xl md:text-4xl font-bold mb-4 font-spooky">
        Today's Movie
      </h2>
      <div className="relative inline-block mb-4">
        <img
          src={currentMovie.lowResUrl}
          alt={currentMovie.title}
          className="rounded-lg h-80 md:h-96 lg:h-112 relative z-10" // Added z-index
        />
        <img
          src="/images/popcornzombie.png"
          alt="Zombie eating popcorn"
          className="absolute top-0 -left-24 h-full w-auto object-contain transform -translate-x-full z-20" // Added z-index
        />
        <img
          src="/images/popcornzombie.png"
          alt="Zombie eating popcorn"
          className="absolute top-0 -right-24 h-full w-auto object-contain transform translate-x-full z-20" // Added z-index
        />
      </div>
      <p className="text-xl md:text-2xl font-eerie">{currentMovie.title}</p>
    </div>
  );
}
