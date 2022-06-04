import React,{useState} from "react";
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
  return (
    <div style={{background: `url(${image})`, backgroundSize: 'cover'}} className=" bg-cover h-screen w-full flex justify-center">
      <div className=" pt-24 flex-col h-[78%] w-[54%]">
        <Draggable>
        <div className=" bg-terminal h-[100%] bg-cover x opacity-80">
          <div className="top-0 w-auto h-10 flex">
            <div className=" bg-red-800 h-[50%] w-[2%] rounded-full"></div>
            <div></div>
            <div></div>
          </div>
          <div className=" py-12 px-5 text-white font-heading text-6xl">shiv: $ type help to start</div>
          <div className=" px-9"><Terminal /></div>
        </div>
        </Draggable>
      </div>
      <div className="flex justify-around absolute bottom-0 bg-slate-400 rounded-t-3xl opacity-70 w-[70%] h-[9%]">
        <div className=" pt-3"><button><img src="https://cdn.discordapp.com/attachments/941126999278231672/981940200123039815/unknown.png" width="69" height="69"></img></button></div>
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
