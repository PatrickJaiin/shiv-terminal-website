import React from "react";
import Desktop from "../components/Desktop";
import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>ShivOS</title>
        <meta name="description" content="Shiv's macOS Portfolio" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🫡</text></svg>" />
      </Head>
      <Desktop />
    </>
  );
}
