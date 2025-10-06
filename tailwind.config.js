module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily:{
        'heading': ['Secular One', 'sans-serif'],
        'name': ['Comfortaa', 'cursive'],
      },
      backgroundImage: {
        'bck': "url('/images/catalina.png')",
        'icon': "url('/images/logo.png')",
        'terminal': "url('/images/logo.png')",
        'dark': "url('/images/logo.png')"
      }
    },
  },
  plugins: [],
}