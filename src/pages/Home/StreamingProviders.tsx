interface Provider {
  logo_path: string;
  provider_name: string;
  provider_id: number;
}

interface StreamingProvidersProps {
  watchProviders: {
    link?: string;
    flatrate?: Provider[];
    rent?: Provider[];
    buy?: Provider[];
  } | null;
  movieTitle: string;
}

export default function StreamingProviders({
  watchProviders,
  movieTitle,
}: StreamingProvidersProps) {
  if (!watchProviders) {
    // Fallback to JustWatch search if no providers found
    return (
      <div className="mt-4">
        <a
          href={`https://www.justwatch.com/us/search?q=${encodeURIComponent(
            movieTitle
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm md:text-base"
        >
          Find Where to Watch
        </a>
      </div>
    );
  }

  const streamingServices = watchProviders.flatrate || [];
  const rentalServices = watchProviders.rent || [];
  const purchaseServices = watchProviders.buy || [];

  // Combine all services, prioritizing streaming
  const allServices = [
    ...streamingServices,
    ...rentalServices.filter(
      (r) => !streamingServices.some((s) => s.provider_id === r.provider_id)
    ),
    ...purchaseServices.filter(
      (p) =>
        !streamingServices.some((s) => s.provider_id === p.provider_id) &&
        !rentalServices.some((r) => r.provider_id === p.provider_id)
    ),
  ];

  if (allServices.length === 0) {
    return (
      <div className="mt-4">
        <a
          href={`https://www.justwatch.com/us/search?q=${encodeURIComponent(
            movieTitle
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm md:text-base"
        >
          Find Where to Watch
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h3 className="text-lg md:text-xl font-semibold mb-2 font-eerie">
        Where to Watch
      </h3>
      <div className="flex flex-wrap gap-3 items-center justify-center">
        {allServices.slice(0, 6).map((provider) => (
          <a
            key={provider.provider_id}
            href={watchProviders.link || `https://www.justwatch.com/us/search?q=${encodeURIComponent(movieTitle)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative"
            title={provider.provider_name}
          >
            <img
              src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
              alt={provider.provider_name}
              className="w-12 h-12 md:w-14 md:h-14 rounded-lg shadow-md transition-transform group-hover:scale-110"
            />
          </a>
        ))}
        {watchProviders.link && (
          <a
            href={watchProviders.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-700 hover:text-orange-800 underline text-sm md:text-base font-eerie"
          >
            View All
          </a>
        )}
      </div>
    </div>
  );
}
