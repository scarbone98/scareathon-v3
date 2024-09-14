import AnimatedPage from "../../components/AnimatedPage";

const Rules = () => {
  return (
    <AnimatedPage>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Rules</h1>
        <div className="prose prose-lg">
          <h2>Game Rules</h2>
          <p>Here you can explain the rules of your game or application.</p>
          <ul>
            <li>Rule 1: Explanation of the first rule</li>
            <li>Rule 2: Explanation of the second rule</li>
            <li>Rule 3: Explanation of the third rule</li>
          </ul>
          {/* Add more content as needed */}
        </div>
      </div>
    </AnimatedPage>
  );
};

export default Rules;