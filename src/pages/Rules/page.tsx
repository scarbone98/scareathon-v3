import AnimatedPage from "../../components/AnimatedPage";
import { useState } from "react";

const Rules = () => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleImageClick = () => {
    setIsAnimating(true);
    // Reset the animation after it completes (adjust timeout based on your GIF duration)
    setTimeout(() => setIsAnimating(false), 4000); // 3000ms = 3 seconds
  };

  return (
    <AnimatedPage className="animated-gradient min-h-screen flex items-center justify-center">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-4xl font-bold mb-8 text-center text-halloween-orange font-spooky">
          Rules
        </h1>
        <div className="prose prose-lg mx-auto font-spooky">
          <ul className="list-none p-0 space-y-4">
            {[
              "Every Day watch a movie on the day it is scheduled to earn 1 point.",
              "Every Week complete the themed weekly challenge by Sunday's film to earn 1 point.",
              "Wear a Costume on Halloween to earn 1 point.",
            ].map((rule, index) => (
              <li
                key={index}
                className="grid grid-cols-[auto,1fr] gap-4 items-start text-lg text-pumpkin"
              >
                <span className="font-bold text-right">Rule {index + 1}:</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-8 flex justify-center">
          <img
            src={
              isAnimating ? "/images/skelly.gif" : "/images/rip-tombstone.gif"
            }
            alt="Spooky Rules"
            className="w-64 h-64 object-cover cursor-pointer"
            onClick={handleImageClick}
          />
        </div>
      </div>
    </AnimatedPage>
  );
};

export default Rules;
