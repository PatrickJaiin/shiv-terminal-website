import React,{useState, useEffect} from "react";
import Draggable from 'react-draggable'; //used to make the terminal window draggable
import Terminal from "../components/Terminal";
import row from "./row.js";
import dark from '../public/images/dark.jpg'
import light from '../public/images/catalina.png'
//deployed on vercel
export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [image, setImage] = useState(light);
  
  // Mac-style background images
  const macBackgrounds = {
    light: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      overlay: 'rgba(255, 255, 255, 0.1)'
    },
    dark: {
      background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
      overlay: 'rgba(0, 0, 0, 0.3)'
    }
  };
  
  const changeImage = () => {
    setIsDarkMode(!isDarkMode);
    setImage(isDarkMode ? light : dark);
  };

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  const [showMe, setShowMe] = useState(true);
  const [showResume, setShowRes] = useState(false);
  const [showYouTube, setShowYT] = useState(false);
  const [showResumePDF, setShowResumePDF] = useState(false);
  function hide(){
    setShowMe(false);
  }
  function hideRes(){
    setShowRes(false);
  }
  function hideYT(){
    setShowYT(false);
  }
  function hideResumePDF(){
    setShowResumePDF(false);
  }
  function show(){
    setShowMe(true);
    setShowRes(false);
    setShowYT(false);
    setShowResumePDF(false);
  }
  function showRes(){
    setShowMe(false);
    setShowYT(false);
    setShowRes(true);
    setShowResumePDF(false);
  }
  function showYT(){
    setShowMe(false);
    setShowRes(false);
    setShowYT(true);
    setShowResumePDF(false);
  }
  function openResumePDF(){
    setShowMe(false);
    setShowRes(false);
    setShowYT(false);
    setShowResumePDF(true);
  }
  const currentTheme = isDarkMode ? macBackgrounds.dark : macBackgrounds.light;
  
  return (
    <div 
      style={{ 
        background: currentTheme.background,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        height: '100vh',
        position: 'relative'
      }} 
      className="w-full flex justify-center"
    >
      {/* Mac-style overlay */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: currentTheme.overlay,
          zIndex: 0
        }}
      />
      <div className=" pt-24 flex-col h-[78%] w-[54%] relative z-10">
        <Draggable>
        <div style={{display: showMe?"block":'none'}} className={`h-[100%] ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} bg-opacity-80 backdrop-blur-sm rounded-3xl shadow-2xl border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
          <div className={`h-[6%] ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-t-3xl flex`}>
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full transition-colors" onClick={hide}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-colors"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-500 hover:bg-green-600 rounded-full transition-colors"/>
          </div>
          <div className={`py-12 px-5 ${isDarkMode ? 'text-white' : 'text-gray-800'} font-heading text-6xl`}>shiv: $ type help to start</div>
          <div className=" px-9"><Terminal /></div>
        </div>
        </Draggable>
        <Draggable>
        <div style={{display: showYouTube?"block":'none'}} className={`h-[100%] ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} bg-opacity-80 backdrop-blur-sm rounded-3xl shadow-2xl border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
          <div className={`h-[6%] ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-t-3xl flex`}>
            <button className=" ml-[3%] mt-[1.5%] w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full transition-colors" onClick={hideYT}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-colors"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-500 hover:bg-green-600 rounded-full transition-colors"/>
          </div>
          <iframe className="" src="https://open.spotify.com/embed/playlist/2cjWtrYMSLligtdAJDx6IP?utm_source=generator&theme=0" width="99.9%" height="90%" allowFullScreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </div>
        </Draggable>
        <Draggable>
        <div style={{display: showResume?"block":'none'}} className={`h-[100%] ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} bg-opacity-80 backdrop-blur-sm rounded-3xl shadow-2xl border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
          <div className={`h-[6%] ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-t-3xl flex`}>
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full transition-colors" onClick={hideRes}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-colors"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-500 hover:bg-green-600 rounded-full transition-colors"/>
          </div>
          <iframe width="99.9%" height='90%' src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>
        </div>
        </Draggable>
        <Draggable>
        <div style={{display: showResumePDF?"block":'none'}} className={`h-[100%] ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} bg-opacity-80 backdrop-blur-sm rounded-3xl shadow-2xl border ${isDarkMode ? 'border-gray-700' : 'border-gray-300'} overflow-hidden`}>
          <div className={`h-[6%] ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} rounded-t-3xl flex`}>
            <button className=" ml-[5%] mt-[1.5%] w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full transition-colors" onClick={hideResumePDF}/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-yellow-500 hover:bg-yellow-600 rounded-full transition-colors"/>
            <button className=" ml-[2%] mt-[1.5%] w-5 h-5 bg-green-500 hover:bg-green-600 rounded-full transition-colors"/>
          </div>
          <div className="h-[94%] w-full overflow-hidden rounded-b-3xl">
            <iframe 
              width="100%" 
              height="100%" 
              src="https://drive.google.com/file/d/1a4Yq58WDfRUaT0xHzQjiSsuoJ8U8sCxa/preview" 
              title="Resume - Shiv Gupta"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              className="rounded-b-3xl"
              style={{ border: 'none' }}
            />
          </div>
        </div>
        </Draggable>
      </div>
      <div className={`flex justify-around absolute bottom-0 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-200'} bg-opacity-80 backdrop-blur-sm rounded-t-3xl w-[70%] h-[9%] border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-300'} shadow-lg`}>
        <button onClick={() => show()} className="flex items-center justify-center w-18 h-18">
          <svg className="w-16 h-16 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm2 2h10v1H7V7zm0 2h10v1H7V9zm0 2h8v1H7v-1zm0 2h6v1H7v-1zm0 2h4v1H7v-1z"/>
            <circle cx="6" cy="6.5" r="0.5" fill="currentColor"/>
            <circle cx="8" cy="6.5" r="0.5" fill="currentColor"/>
            <circle cx="10" cy="6.5" r="0.5" fill="currentColor"/>
          </svg>
        </button>
        <button onClick={() => showYT()} className="flex items-center justify-center w-18 h-18">
          <svg className="w-16 h-16 text-green-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </button>
        <button onClick={() => showRes()} className="flex items-center justify-center w-18 h-18">
          <svg className="w-16 h-16 text-red-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </button>
        <button onClick={() => openResumePDF()} className="flex items-center justify-center w-18 h-18">
          <svg className="w-16 h-16 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
          </svg>
        </button>
        <button onClick={() => changeImage()} className="flex items-center justify-center w-18 h-18">
          <img src="/images/logo.png" className="w-16 h-16"/>
        </button>
      </div>
      <div className=" flex justify-between w-1/12 absolute right-0 top-0 mt-3 mr-6"></div>
      </div>
  )
}
