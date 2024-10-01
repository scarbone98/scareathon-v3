import AnimatedPage from "../../components/AnimatedPage";
import { useState } from "react";

const Rules = () => {
  const [isAlternateImage, setIsAlternateImage] = useState(false);

  const handleImageClick = () => {
    setIsAlternateImage(!isAlternateImage);
  };

  return (
    <AnimatedPage className="rules-background flex items-center justify-center relative">
      <div className="rules-gradient"></div>
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-2xl rounded-lg">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Rules
        </h1>
        <div className="prose prose-lg mx-auto">
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
          <div className={`relative ${isAlternateImage ? 'glow' : ''} bobbing-animation`}>
            <img
              src={
                isAlternateImage
                  ? "/images/candleskull.gif"
                  : "/images/candleskulldead.gif"
              }
              alt="Spooky Rules"
              className="w-64 h-64 object-cover cursor-pointer rounded-full relative z-10"
              onClick={handleImageClick}
            />
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
};

export default Rules;
