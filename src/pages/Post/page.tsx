import { useParams, Link } from "react-router-dom";
import { fetchWithAuth } from "../../fetchWithAuth";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import AnimatedPage from "../../components/AnimatedPage";
import { useQuery } from "@tanstack/react-query";
import LoadingSpinner from "../../components/LoadingSpinner";
import ErrorDisplay from "../../components/ErrorDisplay";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import Carousel from "../../components/Carousel";

interface Comment {
  id: string;
  author: string;
  content: string;
  timestamp: Date;
  avatar?: string;
}

export default function Post() {
  const { documentId } = useParams<{ documentId: string }>();
  const [comments, setComments] = useState<Comment[]>([
    {
      id: "1",
      author: "ScareMaster",
      content: "This is absolutely terrifying! Can't wait to see what happens next year!",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      avatar: "👻"
    },
    {
      id: "2",
      author: "HorrorFan99",
      content: "The attention to detail in these scares is incredible. Keep up the amazing work!",
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
      avatar: "🎃"
    },
    {
      id: "3",
      author: "NightmareNavigator",
      content: "I'm still shaking from last year's haunted house. This year looks even better!",
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
      avatar: "💀"
    }
  ]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["post", documentId],
    queryFn: () => fetchWithAuth(`/post/${documentId}`).then((res) => res.json()),
  });

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      const comment: Comment = {
        id: Date.now().toString(),
        author: "CurrentUser", // This would come from auth context
        content: newComment,
        timestamp: new Date(),
        avatar: "👤"
      };

      setComments([comment, ...comments]);
      setNewComment("");
      setIsSubmitting(false);
    }, 1000);
  };

  if (isLoading) return <LoadingSpinner />;
  if (error || !data?.data)
    return (
      <ErrorDisplay
        message={error?.message || "Error fetching post details"}
      />
    );

  const post = data?.data;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 }
    }
  };

  return (
    <AnimatedPage className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-orange-600/30"
        >
          {/* Header */}
          <motion.div
            variants={itemVariants}
            className="relative"
          >
            {post.Image && post.Image.length > 0 && (
              <div className="relative h-[400px] overflow-hidden bg-black">
                {post.Image.length === 1 ? (
                  <img
                    src={`${import.meta.env.VITE_STRAPI_BASE_URL}${post.Image[0].url}`}
                    alt={post.Image[0].alternativeText || post.Title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="h-full">
                    <Carousel
                      images={post.Image.map(
                        (img: any) => `${import.meta.env.VITE_STRAPI_BASE_URL}${img.url}`
                      )}
                      autoPlay={true}
                      interval={5000}
                    />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent opacity-70"></div>
              </div>
            )}
          </motion.div>

          {/* Content */}
          <motion.div variants={itemVariants} className="p-8">
            {/* Title with Back Button */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center flex-1">
                <Link
                  to="/announcements"
                  className="inline-flex items-center px-4 py-2 bg-gray-800/80 backdrop-blur-sm text-orange-400 rounded-lg hover:bg-gray-700/80 transition-colors duration-200 mr-4"
                >
                  ← Back to Posts
                </Link>
                <h1 className="text-4xl font-bold text-orange-400 flex-1 text-center">
                  {post.Title}
                </h1>
              </div>
              <div className="w-32"></div> {/* Spacer to balance the back button */}
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-center text-gray-400 text-sm">
                <span>Published: {new Date(post.publishedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</span>
                <span className="mx-2">•</span>
                <span>{Math.ceil(post.Content?.length / 1000 || 1)} min read</span>
              </div>
            </div>

            <div className="prose prose-invert prose-lg max-w-none text-gray-300 mb-8">
              <BlocksRenderer content={post.Content} />
            </div>

            {/* Tags */}
            <motion.div variants={itemVariants} className="flex flex-wrap gap-2 mb-8">
              {['Scareathon', 'Horror', 'Haunted House', 'Community'].map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-orange-600/20 text-orange-400 rounded-full text-sm border border-orange-600/30"
                >
                  {tag}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Comments Section */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <div className="bg-gray-900 rounded-xl shadow-2xl p-8 border border-orange-600/30">
            <h2 className="text-2xl font-bold text-orange-400 mb-6">
              Comments ({comments.length})
            </h2>

            {/* Comment Form */}
            <motion.form
              variants={itemVariants}
              onSubmit={handleCommentSubmit}
              className="mb-8 p-6 bg-gray-800 rounded-lg border border-gray-700"
            >
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your thoughts on this post..."
                className="w-full p-4 bg-gray-900 text-gray-300 rounded-lg border border-gray-600 focus:border-orange-500 focus:outline-none resize-none min-h-[100px]"
                rows={4}
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                  className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  {isSubmitting ? "Posting..." : "Post Comment"}
                </button>
              </div>
            </motion.form>

            {/* Comments List */}
            <div className="space-y-4">
              <AnimatePresence>
                {comments.map((comment) => (
                  <motion.div
                    key={comment.id}
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="p-6 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="text-3xl">{comment.avatar}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-orange-400">
                            {comment.author}
                          </h3>
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(comment.timestamp)}
                          </span>
                        </div>
                        <p className="text-gray-300 leading-relaxed">
                          {comment.content}
                        </p>
                        <div className="mt-3 flex items-center space-x-4 text-sm">
                          <button className="text-gray-400 hover:text-orange-400 transition-colors duration-200">
                            👍 Like
                          </button>
                          <button className="text-gray-400 hover:text-orange-400 transition-colors duration-200">
                            💬 Reply
                          </button>
                          <button className="text-gray-400 hover:text-orange-400 transition-colors duration-200">
                            🚩 Report
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatedPage>
  );
}

function formatTimeAgo(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}