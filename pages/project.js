import { React, useState } from "react";

export default function Home() {
    return (
        <div className="">
            <div className="flex justify-between m-10 sticky top-0">
                <div className=" font-name text-black text-2xl ">Shiv Gupta</div>
                <div className="flex justify-evenly  w-1/3">
                 <div className="text-black">Home</div>
                 <div className="text-black">Blog</div>
                </div>
            </div>
            <div className="flex justify-center bg-orange-700 ">
                <div className="flex-col bg-red-500 ">
                    <img src="https://cdn.discordapp.com/attachments/941126999278231672/980193741769953290/unknown.png" width="auto" height="auto" className=""/>
                    <div className=" inline bg-slate-500 text-black">
                      Hi, I'm Shiv Gupta. I'm a student and this is my personal blog have fun reading :)
                    </div>
                    <div>
                       test
                    </div>
                </div>
            </div>
        </div>
    )
}

