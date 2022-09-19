import React,{useState} from "react";
import Draggable from 'react-draggable'; //used to make the terminal window draggable
import Terminal from "../components/Terminal";
import row from "./row.js";

export default function Home() {
  const change="https://github.com/PatrickJaiin/PatrickJaiin/blob/main/images/dark.jpg?raw=true";
  const change2="https://cdn.discordapp.com/attachments/941091409509896283/951093872702939196/catalina.jpg";
  const [image, setImage] = useState(change2);
  let imgs = ["https://cdn.discordapp.com/attachments/941091409509896283/1020754126012956712/WhatsApp_Image_2022-09-17_at_11.22.11_PM.jpeg","https://cdn.discordapp.com/attachments/941091409509896283/951093872702939196/catalina.jpg"];
  let num=0;
  const changeImage = () => {
    num++;
    if(num>=imgs.length){
      num=0;
    }
    setImage(imgs[num]);
  };
  const [showMe, setShowMe] = useState(true);
<<<<<<< Updated upstream
  function hide(){
    setShowMe(false);
  }
  function show(){
    setShowMe(true);
=======
  const [showResume, setShowRes] = useState(false);
  const [showYouTube, setShowYT] = useState(false);
  const [showSpotify, setShowSp] = useState(false);
  function hide(){
    setShowMe(false);
  }
  function hideRes(){
    setShowRes(false);
  }
  function hideYT(){
    setShowYT(false);
  }
  function hideSp(){
    setShowSp(false);
  }
  function show(){
    setShowMe(true);
    setShowRes(false);
    setShowYT(false);
    setShowSp(false);
  }
  function showRes(){
    setShowMe(false);
    setShowYT(false);
    setShowRes(true);
    setShowSp(false);
  }
  function showYT(){
    setShowMe(false);
    setShowRes(false);
    setShowYT(true);
    setShowSp(false);
  }
  function showSp(){
    setShowMe(false);
    setShowRes(false);
    setShowYT(false);
    setShowSp(true);
>>>>>>> Stashed changes
  }
  const [type, setType] = useState('cover');
  return (
    <div style={{ backgroundImage: `url(${image})`, backgroundSize: `${type}`}} className=" h-screen w-full flex justify-center overflow-hidden">
      <div className=" pt-24 flex-col h-[78%] w-[54%]">
        <Draggable>
        <div style={{display: showMe?"block":"none"}} className=" bg-terminal h-[100%] bg-cover x opacity-80 visible">
          <div className="top-0 w-auto h-10 flex">
            <button className="bg-red-800 ml-[0.71%] mt-2.5 w-[2%] h-[51%] rounded-full" onClick={hide}/>
            <button className=" bg-orange-700 ml-[0.71%] mt-2.5 w-[2%] h-[51%] rounded-full"/>
            <button className=" bg-green-700 ml-[0.71%] mt-2.5 w-[2%] h-[51%] rounded-full"/>
          </div>
          <div className=" py-12 px-5 text-white font-heading text-6xl">shiv: $ type help to start</div>
          <div className=" px-9"><Terminal /></div>
        </div>
        </Draggable>
<<<<<<< Updated upstream
      </div>
      <div className="flex justify-around absolute bottom-0 bg-slate-400 rounded-t-3xl opacity-70 w-[70%] h-[9%]">
        <div className=" pt-2"><button onClick={show}><img src="https://cdn.discordapp.com/attachments/941126999278231672/981940200123039815/unknown.png" width="81" height="81"></img></button></div>
        <div href="/project" className=" pt-3 opacity-100">
          <link src="https://cdn.discordapp.com/attachments/941126999278231672/980853683833176154/unknown.png" width="69" height="69"/>
=======
        <Draggable>
        <div style={{display: showSpotify?"block":'none'}} className="h-[100%] bg-gray-800 opacity-70 rounded-3xl">
          <div className=" h-[6%] bg-gray-700 rounded-t-3xl flex">
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-800 rounded-full" onClick={hideSp}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-orange-600 rounded-full"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-700 rounded-full"/>
          </div>
          <iframe className="" src="https://open.spotify.com/embed/playlist/2cjWtrYMSLligtdAJDx6IP?utm_source=generator&theme=0" width="99.9%" height="90%" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </div>
        </Draggable>
        <Draggable>
        <div style={{display: showYouTube?"block":'none'}} className="h-[100%] bg-gray-800 opacity-70 rounded-3xl">
          <div className=" h-[6%] bg-gray-700 rounded-t-3xl flex">
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-800 rounded-full" onClick={hideYT}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-orange-600 rounded-full"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-700 rounded-full"/>
          </div>
          <iframe width="99.9%" height='90%' src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen/>
        </div>
        </Draggable>
        <Draggable>
        <div style={{display: showResume?"block":'none'}} className="h-[100%] bg-gray-800 opacity-70 rounded-3xl">
          <div className=" h-[6%] bg-gray-700 rounded-t-3xl flex">
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-800 rounded-full" onClick={hideRes}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-orange-600 rounded-full"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-700 rounded-full"/>
          </div>
          <iframe src=''width="99.9%" height="90%"/>
        </div>
        </Draggable>
      </div>
      <div className="flex justify-around absolute bottom-0 bg-slate-400 rounded-t-3xl opacity-70 w-[70%] h-[9%]">
        <div className=" pt-2"><button onClick={()=>show()}><img src="https://cdn.discordapp.com/attachments/941126999278231672/981940200123039815/unknown.png" width="69" height="69"></img></button></div>
        <div className=" pt-3 opacity-100">
          <button onClick={()=> showSp()}><img src="https://cdn.discordapp.com/attachments/941091409509896283/1020747948507799643/Spotify_icon.svg.png" width="57" height="57"/></button> 
        </div>
        <div className=" pt-3 opacity-100">
          <button onClick={()=> showYT()}><img src="https://cdn.discordapp.com/attachments/941091409509896283/1020737312080007188/png-clipart-youtube-play-button-computer-icons-youtube-youtube-logo-angle-rectangle-thumbnail-removebg-preview.png" width="69" height="69"/></button> 
        </div>
        <div className=" pt-3 opacity-100">
          <button onClick={()=> showRes()}><img src="https://cdn.discordapp.com/attachments/941126999278231672/980853683833176154/unknown.png" width="58" height="58"/></button> 
>>>>>>> Stashed changes
        </div>
        <div className="pt-3">
          <button onClick={()=> changeImage()}><img src="/images/logo.png" width="69" height="69"/></button>
        </div>
      </div>
      <div className=" flex justify-between w-1/12 absolute right-0 top-0 mt-3 mr-6"></div>
      </div>
  )
}
