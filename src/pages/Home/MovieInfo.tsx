interface Genre {
  id: number;
  name: string;
}

interface MovieInfoProps {
  runtime: number | null;
  year: number | null;
  rating: number | null;
  genres: Genre[];
}

export default function MovieInfo({
  runtime,
  year,
  rating,
  genres,
}: MovieInfoProps) {
  const formatRuntime = (minutes: number | null) => {
    if (!minutes) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const infoItems = [
    year && { label: "Year", value: year },
    runtime && { label: "Runtime", value: formatRuntime(runtime) },
    rating && {
      label: "Rating",
      value: (
        <span className="flex items-center gap-1">
          <span className="text-yellow-500">★</span>
          {rating}/10
        </span>
      ),
    },
  ].filter(Boolean);

  if (infoItems.length === 0 && genres.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Info row */}
      {infoItems.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center text-sm md:text-base font-eerie">
          {infoItems.map((item: any, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-orange-700 font-semibold">
                {item.label}:
              </span>
              <span className="text-orange-900">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Genres */}
      {genres.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {genres.map((genre) => (
            <span
              key={genre.id}
              className="bg-orange-200 text-orange-800 px-3 py-1 rounded-full text-xs md:text-sm font-semibold"
            >
              {genre.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
