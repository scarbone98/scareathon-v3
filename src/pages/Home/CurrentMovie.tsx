import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import MovieInfo from "./MovieInfo";
import StreamingProviders from "./StreamingProviders";

export default function CurrentMovie() {
  // Get current day in EST
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dayOfMonth = today.getDate();

  const {
    data: movieData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["calendar", "day", dayOfMonth],
    queryFn: () =>
      fetchWithAuth(`/calendar/${dayOfMonth}`, {
        headers: { "Content-Type": "application/json" },
      }).then((res) => res.json()),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const currentMovie = movieData?.data;

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
    <div className="text-blood-red relative max-w-4xl mx-auto px-4">
      <h2 className="text-3xl md:text-4xl font-bold mb-6 font-spooky">
        Today's Movie
      </h2>

      {/* Movie poster with zombies */}
      <div className="relative inline-block mb-6">
        <img
          src={currentMovie.lowResUrl}
          alt={currentMovie.title}
          className="rounded-lg h-80 md:h-96 lg:h-112 relative z-10"
        />
        <img
          src="/images/popcornzombie.png"
          alt="Zombie eating popcorn"
          className="absolute top-0 -left-24 h-full w-auto object-contain transform -translate-x-full z-20 hidden lg:block"
        />
        <img
          src="/images/popcornzombie.png"
          alt="Zombie eating popcorn"
          className="absolute top-0 -right-24 h-full w-auto object-contain transform translate-x-full z-20 hidden lg:block"
        />
      </div>

      {/* Movie title */}
      <p className="text-2xl md:text-3xl font-eerie font-bold mb-4">
        {currentMovie.title}
      </p>

      {/* Movie info (runtime, year, rating, genres) */}
      <MovieInfo
        runtime={currentMovie.runtime}
        year={currentMovie.year}
        rating={currentMovie.rating}
        genres={currentMovie.genres || []}
      />

      {/* Streaming providers */}
      <StreamingProviders
        watchProviders={currentMovie.watchProviders}
        movieTitle={currentMovie.title}
      />
    </div>
  );
}
