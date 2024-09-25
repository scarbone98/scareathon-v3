/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'halloween-orange': '#FF6600',
        'halloween-purple': '#6B0099',
        'halloween-green': '#00FF00',
        'halloween-black': '#1A1A1A',
        'pumpkin': '#FF7518',
        'ghost-white': '#F8F8FF',
        'witch-black': '#2D2D2D',
        'blood-red': '#8B0000',
      },
      fontFamily: {
        'spooky': ['Creepster', 'cursive'],
        'eerie': ['Nosifer', 'cursive'],
      },
      backgroundImage: {
        'spider-web': "url('/images/spider-web.svg')",
        'haunted-house': "url('/images/haunted-house.svg')",
      },
      boxShadow: {
        'glow': '0 0 10px 5px rgba(255, 102, 0, 0.5)',
      },
      flex: {
        '2': '2 2 0%'
      }
    },
  },
  plugins: [],
}
