import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedPage from "../../components/AnimatedPage";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";

const Authentication = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/"); // Redirect to home page after successful login
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        navigate("/"); // Redirect to home page after successful login
      }
    } catch (error: any) {
      setError(error.message);
    }
  };

  const tabVariants = {
    active: { y: 0, opacity: 1 },
    inactive: { y: 5, opacity: 0.7 },
  };

  const formVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, x: 20, transition: { duration: 0.3 } },
  };

  return (
    <AnimatedPage style={{ paddingTop: 0 }}>
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-900">
        <div
          className="max-w-md w-full space-y-8 bg-gray-800 p-10 rounded-xl shadow-2xl relative"
          style={{ height: "500px" }}
        >
          <div className="flex justify-center space-x-4">
            <motion.button
              variants={tabVariants}
              animate={!isLogin ? "active" : "inactive"}
              onClick={() => setIsLogin(false)}
              className={`px-4 py-2 rounded-md transition-colors duration-200 w-32 ${
                !isLogin
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Sign Up
            </motion.button>
            <motion.button
              variants={tabVariants}
              animate={isLogin ? "active" : "inactive"}
              onClick={() => setIsLogin(true)}
              className={`px-4 py-2 rounded-md transition-colors duration-200 w-32 ${
                isLogin
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Login
            </motion.button>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : "signup"}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={formVariants}
              className="absolute top-24 left-10 right-10"
            >
              <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
                {isLogin ? "Login to your account" : "Create an account"}
              </h2>
              <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div className="rounded-md shadow-sm -space-y-px">
                  <div>
                    <label htmlFor="email-address" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="sr-only">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-600 placeholder-gray-400 text-white bg-gray-800 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-400 text-sm text-center">
                    {error}
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    {isLogin ? "Login" : "Sign Up"}
                  </button>
                </div>
                {isLogin && (
                  <p
                    className="text-sm text-center text-gray-400"
                    onClick={() => {}}
                  >
                    Forgot your password?
                  </p>
                )}
              </form>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </AnimatedPage>
  );
};

export default Authentication;
