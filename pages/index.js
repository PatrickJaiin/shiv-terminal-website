import React from "react";
import Terminal from "../components/Terminal";
export default function Home() {
  return (
    <div className=" bg-bck bg-cover h-screen w-full flex justify-center items-center">
      
      <div className=" bg-terminal h-[81%] w-[60%] bg-cover opacity-80">
        <div className=" py-12 px-5 text-white font-heading text-6xl">shiv: $ type help to start</div>
        <div className=" px-9"><Terminal /></div>
      </div>
      <div className=" absolute right-0 top-0 mt-3 mr-6"><img src="/images/logo.png" width="42" height="42"/></div>
    </div>
  )
}

