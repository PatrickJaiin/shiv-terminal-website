module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily:{
        'heading': ['Secular One', 'sans-serif'],
      },
      backgroundImage: {
        'bck': "url('https://cdn.discordapp.com/attachments/941091409509896283/951093872702939196/catalina.jpg')",
        'terminal': "url('https://cdn.discordapp.com/attachments/941091409509896283/951112392991985694/macos-terminal-edited.png')"
      }
    },
  },
  plugins: [],
}