import React from "react";
import { motion } from "framer-motion";

interface ErrorDisplayProps {
  message: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message }) => {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md max-w-md w-full mx-4 flex flex-col justify-center items-center flex-wrap gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <svg
              className="h-6 w-6 text-red-500 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="font-semibold">Error</p>
          </div>
        </div>
        <p className="ml-2">{message}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          Refresh Page
        </button>
      </motion.div>
    </div>
  );
};

export default ErrorDisplay;
