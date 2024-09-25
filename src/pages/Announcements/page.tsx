import { useEffect, useState } from "react";
import { fetchWithAuth } from "../../fetchWithAuth";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import AnimatedPage from "../../components/AnimatedPage";
export default function Announcements() {
  const [data, setData] = useState<any>([]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetchWithAuth("/posts");
        const data = await response.json();
        setData(data);
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

  console.log(data);

  return (
    <AnimatedPage className="container mx-auto px-4 py-8">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data?.data?.map((post: any) => (
          <div
            key={post.id}
            className="bg-white shadow-md rounded-lg overflow-hidden"
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
