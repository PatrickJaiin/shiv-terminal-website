import '../styles/globals.css'
import Head from 'next/head'

// Runs before React hydrates so the dark class is on <html> before first paint,
// avoiding a flash of light content on dark-mode reloads.
const themeInitScript = `(function(){try{var s=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Shiv Gupta - Terminal Portfolio</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
