import React, { useState, useRef } from 'react';
import Draggable from 'react-draggable';

export default function Window({
  id,
  title,
  children,
  isOpen,
  isMin,
  isMax,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  zIndex
}) {
  const nodeRef = useRef(null);

  if (!isOpen) return null;

  return (
    <Draggable
      nodeRef={nodeRef}
      onMouseDown={() => onFocus(id)}
      disabled={isMax} // Disable dragging when maximized
    >
      <div
        ref={nodeRef}
        className={`absolute flex flex-col bg-gray-100 dark:bg-gray-900 bg-opacity-90 dark:bg-opacity-90 backdrop-blur-md rounded-xl shadow-2xl border border-gray-300 dark:border-gray-700 overflow-hidden transition-all duration-200 ease-in-out ${isMin ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
          } ${isMax ? 'top-8 left-0 w-full h-[calc(100vh-2rem)] rounded-none' : 'top-[10%] left-[5%] md:left-[20%] w-[90%] md:w-[60%] h-[60%] md:h-[70%]'
          }`}
        style={{
          zIndex: zIndex,
          display: isMin ? 'none' : 'flex',
        }}
      >
        {/* Window Header */}
        <div className="window-header h-8 bg-gray-200 dark:bg-gray-800 flex items-center px-4 cursor-move select-none border-b border-gray-300 dark:border-gray-700">
          <div className="flex space-x-2 group">
            <button
              onClick={(e) => { e.stopPropagation(); onClose(id); }}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-xs text-red-900 opacity-100"
            >
              {/* Hover icon could go here */}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMinimize(id); }}
              className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600"
            />
            <button
              onClick={(e) => { e.stopPropagation(); onMaximize(id); }}
              className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600"
            />
          </div>
          <div className="flex-1 text-center text-xs font-semibold text-gray-600 dark:text-gray-300">
            {title}
          </div>
          <div className="w-14" /> {/* Spacer for centering title */}
        </div>

        {/* Window Content */}
        <div className="flex-1 overflow-auto relative">
          {children}
        </div>
      </div>
    </Draggable>
  );
}
