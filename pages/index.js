import React,{useState} from "react";
import Draggable from 'react-draggable'; //used to make the terminal window draggable
import Terminal from "../components/Terminal";
import row from "./row.js";

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
  const [showResume, setShowRes] = useState(false);
  const [showYouTube, setShowYT] = useState(false);
  function hide(){
    setShowMe(false);
  }
  function hideRes(){
    setShowRes(false);
  }
  function hideYT(){
    setShowYT(false);
  }
  function show(){
    setShowMe(true);
    setShowRes(false);
    setShowYT(false);
  }
  function showRes(){
    setShowMe(false);
    setShowYT(false);
    setShowRes(true);
  }
  function showYT(){
    setShowMe(false);
    setShowRes(false);
    setShowYT(true);
  }
  const [type, setType] = useState('cover');
  let BackgroundImage;
    switch (image) {
      case 'https://github.com/PatrickJaiin/PatrickJaiin/blob/main/images/dark.jpg?raw=true':
        BackgroundImage = <div style={{ background: `url(${image})`, backgroundSize: `cover`}} className=" h-screen w-full flex justify-center" ></div>;
        break;
      case 'https://cdn.discordapp.com/attachments/941091409509896283/951093872702939196/catalina.jpg':
        BackgroundImage = <div style={{ background: `url(${image})`, backgroundSize: 'cover'}} className=" h-screen w-full flex justify-center" ></div>;
        break;
   }
  return (
    <div style={{ backgroundImage: `url(${image})`, backgroundSize: `${type}`}} className=" h-screen w-full flex justify-center">
      <div className=" pt-24 flex-col h-[78%] w-[54%]">
        <Draggable>
        <div style={{display: showMe?"block":'none'}} className="h-[100%] bg-gray-800 opacity-70 rounded-3xl">
          <div className=" h-[6%] bg-gray-700 rounded-t-3xl flex">
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-800 rounded-full" onClick={hide}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-orange-600 rounded-full"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-700 rounded-full"/>
          </div>
          <div className=" py-12 px-5 text-white font-heading text-6xl">shiv: $ type help to start</div>
          <div className=" px-9"><Terminal /></div>
        </div>
        </Draggable>
        <Draggable>
        <div style={{display: showYouTube?"block":'none'}} className="h-[100%] bg-gray-800 opacity-70 rounded-3xl">
          <div className=" h-[6%] bg-gray-700 rounded-t-3xl flex">
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-800 rounded-full" onClick={hideYT}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-orange-600 rounded-full"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-700 rounded-full"/>
          </div>
          <iframe className="" src="https://open.spotify.com/embed/playlist/2cjWtrYMSLligtdAJDx6IP?utm_source=generator&theme=0" width="99.9%" height="90%" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </div>
        </Draggable>
        <Draggable>
        <div style={{display: showResume?"block":'none'}} className="h-[100%] bg-gray-800 opacity-70 rounded-3xl">
          <div className=" h-[6%] bg-gray-700 rounded-t-3xl flex">
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-800 rounded-full" onClick={hideRes}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-orange-600 rounded-full"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-700 rounded-full"/>
          </div>
          <iframe width="99.9%" height='90%' src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen/>
        </div>
        </Draggable>
      </div>
      <div className="flex justify-around absolute bottom-0 bg-slate-400 rounded-t-3xl opacity-70 w-[70%] h-[9%]">
        <div className=" pt-2"><button onClick={()=>show()}><img src="https://cdn.discordapp.com/attachments/941126999278231672/981940200123039815/unknown.png" width="69" height="69"></img></button></div>
        <div className=" pt-3 opacity-100">
          <button onClick={()=> showYT()}><img src="https://cdn.discordapp.com/attachments/941091409509896283/1020747948507799643/Spotify_icon.svg.png" width="57" height="57"/></button> 
        </div>
        <div className=" pt-3 opacity-100">
          <button onClick={()=> showRes()}><img src="https://cdn.discordapp.com/attachments/941091409509896283/1020737312080007188/png-clipart-youtube-play-button-computer-icons-youtube-youtube-logo-angle-rectangle-thumbnail-removebg-preview.png" width="69" height="69"/></button> 
        </div>
        <div className="pt-3 opacity-100">
          <button onClick={()=> changeImage()}><img src="/images/logo.png" width="69" height="69"/></button>
        </div>
      </div>
      <div className=" flex justify-between w-1/12 absolute right-0 top-0 mt-3 mr-6"></div>
      </div>
  )
}
