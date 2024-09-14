import AnimatedPage from "../../components/AnimatedPage";

export default function Scareboard() {
  return (
    <AnimatedPage>
      <div className="bg-gray-100 p-4 md:p-6 lg:p-8 rounded-lg shadow-lg max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <button className="text-xl md:text-2xl lg:text-3xl text-gray-600 hover:text-gray-800 transition-colors">
            &lt;
          </button>
          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800">
            October 2023
          </h2>
          <button className="text-xl md:text-2xl lg:text-3xl text-gray-600 hover:text-gray-800 transition-colors">
            &gt;
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3">
          {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
            <div
              key={day}
              className="text-center font-semibold text-gray-600 mb-1 md:mb-2 lg:mb-3 text-xs md:text-sm lg:text-base"
            >
              {day}
            </div>
          ))}
          {[...Array(31)].map((_, index) => (
            <div
              key={index}
              className="aspect-square flex items-center justify-center bg-white rounded-lg shadow hover:bg-gray-200 transition-colors cursor-pointer text-sm md:text-base lg:text-lg p-1 md:p-2 lg:p-3"
            >
              <span className="text-gray-700">{index + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  );
}
