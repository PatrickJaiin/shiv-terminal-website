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

                <div className=" justify-center w-[50%] bg-red-700">
                    <div className=" ">
                        <img src="https://cdn.discordapp.com/attachments/941126999278231672/980193741769953290/unknown.png" width="100%" height="auto" className=""/>
                    </div>
                    <div className=" inline bg-slate-500 text-black">
                      Hi, Im Shiv Gupta. Im a student and this is my personal blog have fun reading
                    </div>
                    <div>
                       test
                    </div>
                </div>
            </div>
    )
}

