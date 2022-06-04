import React,{useState} from "react";
import {useRef} from "react";
import ReactDOM from 'react-dom';
import Draggable from 'react-draggable'; //used to make the terminal window draggable
import Terminal from "../components/Terminal";

export default function Home() {
  const change="https://github.com/PatrickJaiin/PatrickJaiin/blob/main/images/dark.jpg?raw=true";
  const change2="https://cdn.discordapp.com/attachments/941091409509896283/951093872702939196/catalina.jpg";
  const [image, setImage] = useState(change2);
  let imgs = ["https://github.com/PatrickJaiin/PatrickJaiin/blob/main/images/dark.jpg?raw=true","https://cdn.discordapp.com/attachments/941091409509896283/951093872702939196/catalina.jpg"];
  let num=0;
  const changeImage = () => {
    num++;
    if(num>=imgs.length){
      num=0;
    }
    setImage(imgs[num]);
  };
  const [showMe, setShowMe] = useState(true);
  function hide(){
    setShowMe(false);
  }
  function show(){
    setShowMe(true);
  }
  return (
    <div style={{background: `url(${image})`, backgroundSize: 'cover'}} className=" bg-cover h-screen w-full flex justify-center">
      <div className=" pt-24 flex-col h-[78%] w-[54%]">
        <Draggable>
        <div style={{display: showMe?"block":"none"}} className=" bg-terminal h-[100%] bg-cover x opacity-80 visible">
          <div className="top-0 w-auto h-10 flex">
            <button className="bg-red-800 ml-2.5 mt-2.5 h-[50%] w-[2%] rounded-full" onClick={hide}/>
            <div className=" bg-orange-700 ml-2 mt-2.5 h-[50%] w-[2%] rounded-full"></div>
            <div className=" bg-green-700 ml-2 mt-2.5 h-[50%] w-[2%] rounded-full"></div>
          </div>
          <div className=" py-12 px-5 text-white font-heading text-6xl">shiv: $ type help to start</div>
          <div className=" px-9"><Terminal /></div>
        </div>
        </Draggable>
      </div>
      <div className="flex justify-around absolute bottom-0 bg-slate-400 rounded-t-3xl opacity-70 w-[70%] h-[9%]">
        <div className=" pt-2"><button onClick={show}><img src="https://cdn.discordapp.com/attachments/941126999278231672/981940200123039815/unknown.png" width="81" height="81"></img></button></div>
        <a href="/project" className=" pt-3 opacity-100">
          <img src="https://cdn.discordapp.com/attachments/941126999278231672/980853683833176154/unknown.png" width="69" height="69"/>
        </a>
        <div className="pt-3">
          <button onClick={()=> changeImage()}><img src="/images/logo.png" width="69" height="69"/></button>
        </div>
      </div>
      <div className=" flex justify-between w-1/12 absolute right-0 top-0 mt-3 mr-6"></div>
    </div>
  )
}
