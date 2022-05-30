import React from "react";
import ReactDOM from 'react-dom';
import Draggable from 'react-draggable'; //used to make the terminal window draggable
import Terminal from "../components/Terminal";

export default function Home() {
  return (
    <div className=" bg-bck bg-cover h-screen w-full flex justify-center">
      <div className=" pt-24 flex-col h-[78%] w-[54%]">
        <Draggable>
        <div className=" bg-terminal h-[100%] bg-cover x opacity-80">
          <div className=" py-12 px-5 text-white font-heading text-6xl">shiv: $ type help to start</div>
          <div className=" px-9"><Terminal /></div>
        </div>
        </Draggable>
      </div>
      <div className="flex absolute bottom-0 bg-slate-400 rounded-t-3xl opacity-70 w-[70%] h-[9%]"></div>
      <div className=" flex justify-between w-1/12 absolute right-0 top-0 mt-3 mr-6"><a href="/project"><img src="https://cdn.discordapp.com/attachments/941126999278231672/978239991849304134/unknown.png" width="42" height="42"></img></a><button><img src="/images/logo.png" width="42" height="42"/></button></div>
    </div>
  )
}