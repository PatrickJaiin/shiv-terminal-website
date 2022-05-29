import React from "react";
import Terminal from "../components/Terminal";

export default function Home() {
  return (
    <div className=" bg-bck bg-cover h-screen w-full flex justify-center items-center">
      <div className=" bg-terminal h-[69%] w-[54%] bg-cover x opacity-80">
        <div className=" py-12 px-5 text-white font-heading text-6xl">shiv: $ type help to start</div>
        <div className=" px-9"><Terminal /></div>
      </div>
      <div className=" flex justify-between w-1/12 absolute right-0 top-0 mt-3 mr-6"><a href="/project"><img src="https://cdn.discordapp.com/attachments/941126999278231672/978239991849304134/unknown.png" width="42" height="42"></img></a><button><img src="/images/logo.png" width="42" height="42"/></button></div>
    </div>
  )
}