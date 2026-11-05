import React from "react";

// The Wayside Interactive hologram logo with god rays swinging behind it: a 4 s seamless loop on black that fades to
// black well inside its edges, screen-blended so the black drops out and only the light shows over the page, with no
// square. The blend sits on the fixed wrapper: z-index makes it a stacking context, and a blend on the video inside
// it would only mix with the empty wrapper. Bump ?v= when the video changes.
const LoadingSpinner: React.FC = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none mix-blend-screen" role="status" aria-label="Loading">
      <video
        src="/images/loading.mp4?v=2"
        poster="/images/loading-poster.jpg?v=2"
        autoPlay
        loop
        muted
        playsInline
        className="w-[min(60vmin,480px)] aspect-square"
      />
    </div>
  );
};

export default LoadingSpinner;
