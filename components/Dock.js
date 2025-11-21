import React from 'react';

export default function Dock({ apps, onAppClick }) {
    return (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-auto max-w-full px-2">
            <div className="flex items-end space-x-2 bg-gray-200 dark:bg-gray-800 bg-opacity-50 dark:bg-opacity-50 backdrop-blur-xl border border-gray-300 dark:border-gray-700 rounded-2xl p-2 shadow-2xl transition-all duration-300 ease-in-out">
                {apps.map((app) => (
                    <button
                        key={app.id}
                        onClick={() => onAppClick(app.id)}
                        className="group relative flex flex-col items-center transition-all duration-200 ease-in-out transform hover:-translate-y-2 hover:scale-110"
                    >
                        {/* Tooltip */}
                        <span className="absolute -top-10 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
                            {app.title}
                        </span>

                        {/* App Icon */}
                        <div className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center overflow-hidden rounded-xl shadow-lg bg-white bg-opacity-20 backdrop-blur-sm">
                            {app.icon}
                        </div>

                        {/* Active Indicator */}
                        <div className={`w-1 h-1 bg-gray-500 dark:bg-gray-400 rounded-full mt-1 ${app.isOpen ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                ))}
            </div>
        </div>
    );
}
