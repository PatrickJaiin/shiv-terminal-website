import '../styles/globals.css'
import Head from 'next/head'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Shiv Gupta - Terminal Portfolio</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23111'/><text x='12' y='72' font-family='monospace' font-size='60' font-weight='bold' fill='%2300ff88'>S_</text></svg>" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
