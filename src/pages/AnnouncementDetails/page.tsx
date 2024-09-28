import { useParams } from "react-router-dom";
import { fetchWithAuth } from "../../fetchWithAuth";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import AnimatedPage from "../../components/AnimatedPage";
import { useQuery } from "@tanstack/react-query";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";

export default function AnnouncementDetails() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["post", id],
    queryFn: () => fetchWithAuth(`/post/${id}`).then((res) => res.json()),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !data?.data) return <ErrorDisplay message={error?.message || "Error fetching announcement details"} />;

  const post = data?.data;

  return (
    <AnimatedPage className="container mx-auto px-4 py-8">
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="p-6 text-black">
          <h1 className="text-3xl font-semibold mb-4">{post.Title}</h1>
          {post.Image && post.Image.length > 0 && (
            <img
              src={`${import.meta.env.VITE_STRAPI_BASE_URL}${
                post.Image[0].formats.large.url
              }`}
              alt={post.Image[0].alternativeText || post.Title}
              className="w-full h-auto mb-6 rounded"
            />
          )}
          <div className="text-black text-lg">
            <BlocksRenderer content={post.Content} />
          </div>
          <p className="text-sm text-gray-500 mt-6">
            Published: {new Date(post.publishedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </AnimatedPage>
  );
}
