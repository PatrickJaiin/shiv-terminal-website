import React from "react";
import Desktop from "../components/Desktop";
import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>ShivOS</title>
        <meta name="description" content="Shiv's macOS Portfolio" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Desktop />
    </>
  );
}
