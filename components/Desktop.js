import React, { useState, useEffect } from 'react';
import MenuBar from './MenuBar';
import Dock from './Dock';
import Window from './Window';
import Terminal from './Terminal';

export default function Desktop() {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [maxZIndex, setMaxZIndex] = useState(1);

    // Mac-style background images
    const macBackgrounds = {
        light: {
            background: "url('/images/catalina.png')",
            overlay: 'rgba(255, 255, 255, 0.1)'
        },
        dark: {
            background: "url('/images/dark.jpg')",
            overlay: 'rgba(0, 0, 0, 0.3)'
        }
    };

    const currentTheme = isDarkMode ? macBackgrounds.dark : macBackgrounds.light;

    // Icons
    const icons = {
        terminal: (
            <svg className="w-full h-full text-gray-800 dark:text-gray-200 p-2 bg-gray-400 rounded-xl" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
        spotify: (
            <svg className="w-full h-full text-green-500 p-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
        ),
        youtube: (
            <svg className="w-full h-full text-red-600 p-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
        ),
        resume: (
            <svg className="w-full h-full text-blue-600 p-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
        theme: (
            <img src="/images/logo.png" className="w-full h-full object-cover p-1" alt="Theme Toggle" />
        )
    };

    const [apps, setApps] = useState([
        {
            id: 'terminal',
            title: 'Terminal',
            icon: (
                <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
                    <path d="M128 128h768v768H128z" fill="#333333" />
                    <path d="M256 320l192 192-192 192M512 704h256" stroke="#00FF00" strokeWidth="64" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
            ),
            isOpen: true,
            isMin: false,
            isMax: false,
            zIndex: 1,
            component: <Terminal />
        },

        {
            id: 'spotify',
            title: 'Spotify',
            icon: icons.spotify,
            component: <iframe className="" src="https://open.spotify.com/embed/playlist/2cjWtrYMSLligtdAJDx6IP?utm_source=generator&theme=0" width="100%" height="100%" allowFullScreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style={{ border: 'none' }}></iframe>,
            isOpen: false,
            isMin: false,
            isMax: false,
            zIndex: 0
        },
        {
            id: 'youtube',
            title: 'YouTube',
            icon: icons.youtube,
            component: <iframe width="100%" height="100%" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ border: 'none' }} />,
            isOpen: false,
            isMin: false,
            isMax: false,
            zIndex: 0
        },
        {
            id: 'resume',
            title: 'Resume',
            icon: icons.resume,
            component: <iframe width="100%" height="100%" src="https://drive.google.com/file/d/1a4Yq58WDfRUaT0xHzQjiSsuoJ8U8sCxa/preview" title="Resume - Shiv Gupta" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen style={{ border: 'none' }} />,
            isOpen: false,
            isMin: false,
            isMax: false,
            zIndex: 0
        },
        {
            id: 'theme',
            title: 'Theme',
            icon: icons.theme,
            component: null, // Special case
            isOpen: false,
            isMin: false,
            isMax: false,
            zIndex: 0
        }
    ]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    const handleAppClick = (id) => {
        if (id === 'theme') {
            setIsDarkMode(!isDarkMode);
            return;
        }

        setApps(apps.map(app => {
            if (app.id === id) {
                // Case 1: App is already focused -> Minimize it
                if (app.isOpen && !app.isMin && app.zIndex === maxZIndex) {
                    return { ...app, isMin: true };
                }
                // Case 2: App is minimized -> Restore it
                if (app.isOpen && app.isMin) {
                    return { ...app, isMin: false, zIndex: maxZIndex + 1 };
                }
                // Case 3: App is open but in background -> Bring to front
                if (app.isOpen && !app.isMin) {
                    return { ...app, zIndex: maxZIndex + 1 };
                }
                // Case 4: App is closed -> Open it
                return { ...app, isOpen: true, isMin: false, zIndex: maxZIndex + 1 };
            }
            return app;
        }));
        setMaxZIndex(maxZIndex + 1);
    };

    const closeApp = (id) => {
        setApps(apps.map(app => app.id === id ? { ...app, isOpen: false } : app));
    };

    const minimizeApp = (id) => {
        setApps(apps.map(app => app.id === id ? { ...app, isMin: true } : app));
    };

    const maximizeApp = (id) => {
        setApps(apps.map(app => app.id === id ? { ...app, isMax: !app.isMax } : app));
    };

    const focusApp = (id) => {
        setApps(apps.map(app => {
            if (app.id === id) {
                return { ...app, zIndex: maxZIndex + 1 };
            }
            return app;
        }));
        setMaxZIndex(maxZIndex + 1);
    };

    return (
        <div
            className="w-full h-screen overflow-hidden bg-cover bg-center relative transition-all duration-500"
            style={{
                backgroundImage: currentTheme.background,
            }}
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
                    zIndex: 0,
                    pointerEvents: 'none'
                }}
            />

            <MenuBar />

            {/* Desktop Area */}
            <div className="relative w-full h-full pt-8 pb-20 z-10">
                {apps.map(app => {
                    if (app.id === 'theme') return null;
                    return (
                        <Window
                            key={app.id}
                            id={app.id}
                            title={app.title}
                            isOpen={app.isOpen}
                            isMin={app.isMin}
                            isMax={app.isMax}
                            zIndex={app.zIndex}
                            onClose={closeApp}
                            onMinimize={minimizeApp}
                            onMaximize={maximizeApp}
                            onFocus={focusApp}
                        >
                            {app.component}
                        </Window>
                    );
                })}
            </div>

            <Dock apps={apps} onAppClick={handleAppClick} />
        </div>
    );
}
