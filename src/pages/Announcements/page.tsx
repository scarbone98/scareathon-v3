import { fetchWithAuth } from "../../fetchWithAuth";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import AnimatedPage from "../../components/AnimatedPage";
import { useQuery } from "@tanstack/react-query";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";

export default function Announcements() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["posts"],
    queryFn: () => fetchWithAuth("/posts").then((res) => res.json()),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error.message} />;

  return (
    <AnimatedPage className="container mx-auto px-4 py-8 ">
      <h1 className="text-3xl font-semibold mb-4 text-center">Announcements</h1>
      <div className="columns-1 md:columns-2 lg:columns-3 gap-6">
        {data?.data?.map((post: any) => (
          <div
            key={post.id}
            className="bg-white shadow-md rounded-lg overflow-hidden flex flex-col mb-6 break-inside-avoid"
            // onClick={() => navigate(`/announcements/${post.id}`)}
          >
            <div className="p-6 text-black">
              <h2 className="text-xl font-semibold mb-2">{post.Title}</h2>
              {post.Image && post.Image.length > 0 && (
                <img
                  src={`${import.meta.env.VITE_STRAPI_BASE_URL}${
                    post.Image[0].formats.medium.url
                  }`}
                  alt={post.Image[0].alternativeText || post.Title}
                  className="w-full h-auto mb-4 rounded"
                />
              )}
              <div className="text-black">
                <BlocksRenderer content={post.Content} />
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Published: {new Date(post.publishedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </AnimatedPage>
  );
}
