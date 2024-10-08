import { fetchWithAuth } from "../../fetchWithAuth";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import AnimatedPage from "../../components/AnimatedPage";
import { useQuery } from "@tanstack/react-query";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import Carousel from "../../components/Carousel";

export default function Announcements() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["posts"],
    refetchInterval: 1000 * 60 * 5,
    queryFn: () => fetchWithAuth("/posts").then((res) => res.json()),
    staleTime: 1000 * 60 * 60 * 1,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error.message} />;

  return (
    <AnimatedPage className="mx-auto px-4 py-8 text-gray-300 news-background font-fancy">
      <div className="news-gradient" />
      <div className="relative z-10">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-bold mb-8 pt-8 text-center text-[rgba(221,129,8,0.9)]"
        >
          The Scareathon Post
        </motion.h1>
        <div className="columns-1 md:columns-2 gap-6 max-w-[1200px] mx-auto">
          {data?.data?.map((post: any) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gray-900 shadow-lg rounded-lg overflow-hidden border border-[rgba(221,129,8,0.9)] mb-6 break-inside-avoid"
            >
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-2 text-[rgba(221,129,8,0.9)]">
                  {post.Title}
                </h2>
                {post.Image && post.Image.length > 0 && (
                  <div className="mb-4 overflow-hidden rounded bg-black">
                    {post.Image.length === 1 ? (
                      <img
                        src={`https://api.firststreetstudios.com/${post.Image[0].url}`}
                        alt={post.Image[0].alternativeText || post.Title}
                        className="w-full h-auto max-h-[300px] object-contain"
                      />
                    ) : (
                      <Carousel
                        images={post.Image.map(
                          (img: any) =>
                            `https://api.firststreetstudios.com/${img.url}`
                        )}
                        autoPlay={true}
                        interval={5000}
                      />
                    )}
                  </div>
                )}
                {post.Content && <ContentWithReadMore content={post.Content} />}
                <p className="text-sm text-gray-500 mt-4">
                  Published: {new Date(post.publishedAt).toLocaleDateString()}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  );
}

function ContentWithReadMore({ content }: { content: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showReadMore, setShowReadMore] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleResize() {
      if (contentRef.current) {
        const isOverflowing = contentRef.current.scrollHeight > 190;
        setShowReadMore(isOverflowing);
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [content]);

  return (
    <div className="text-gray-300 relative list-disc list-inside">
      <div
        ref={contentRef}
        className={`relative ${
          isExpanded ? "" : "max-h-[200px] overflow-hidden"
        }`}
      >
        {!isExpanded && showReadMore && (
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-gray-900 to-transparent"></div>
        )}
        <div
          className={`prose prose-invert ${
            isExpanded ? "" : "max-h-[200px] overflow-hidden"
          }`}
        >
          <BlocksRenderer
            content={content}
            blocks={{
              list: ({ children }) => (
                <ul className="list-disc list-inside">{children}</ul>
              ),
              link: ({ children, url }) => (
                <a
                  href={url}
                  className="text-[rgba(221,129,8,0.9)] hover:text-[rgba(221,129,8,1)] transition-colors duration-200"
                >
                  {children}
                </a>
              ),
            }}
          />
        </div>
      </div>
      {showReadMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-[rgba(221,129,8,0.9)] hover:text-[rgba(221,129,8,1)] transition-colors duration-200 absolute bottom-[-20px] right-0 bg-gray-900"
        >
          {isExpanded ? "Read Less" : "Read More"}
        </button>
      )}
    </div>
  );
}
