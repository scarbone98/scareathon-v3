import { useEffect, useState } from "react";
import { fetchWithAuth } from "../../fetchWithAuth";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";

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
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Announcements</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data?.data?.map((post: any) => (
          <div
            key={post.id}
            className="bg-white shadow-md rounded-lg overflow-hidden"
          >
            <div className="p-6 text-black">
              <h2 className="text-xl font-semibold mb-2">{post.Title}</h2>
              <BlocksRenderer content={post.Content} />
              <p className="text-sm mt-4">
                Published: {new Date(post.publishedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
