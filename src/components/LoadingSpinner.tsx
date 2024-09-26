import React from "react";

const LoadingSpinner: React.FC = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-opacity-75 z-50">
      <img src="/images/loading.gif" alt="Loading..." className="max-w-[50%] max-h-[50%] object-contain" />
    </div>
  );
};

export default LoadingSpinner;
