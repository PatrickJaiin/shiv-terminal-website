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
        'bck': "url('https://cdn.discordapp.com/attachments/941091409509896283/951093872702939196/catalina.jpg')",
        'icon': "url('https://cdn.discordapp.com/attachments/941126999278231672/978239991849304134/unknown.png')",
        'terminal': "url('https://cdn.discordapp.com/attachments/941091409509896283/951112392991985694/macos-terminal-edited.png')",
        'dark': "url('https://cdn.discordapp.com/attachments/941091409509896283/951204549069271040/brightness-button-brightness-option-circle-contrast-control-symbol-number-text-logo-transparent-png-1703693.png')"
      }
    },
  },
  plugins: [],
}