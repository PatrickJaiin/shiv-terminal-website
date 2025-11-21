import React, { useState, useEffect, useRef } from 'react';

const CalendarPopup = () => {
    const today = new Date();
    const currentMonth = today.toLocaleString('default', { month: 'long' });
    const currentYear = today.getFullYear();
    const daysInMonth = new Date(currentYear, today.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, today.getMonth(), 1).getDay();

    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        days.push(<div key={`empty-${i}`} className="w-8 h-8"></div>);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        const isToday = i === today.getDate();
        days.push(
            <div
                key={i}
                className={`w-8 h-8 flex items-center justify-center rounded-full text-xs ${isToday ? 'bg-blue-500 text-white font-bold' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
                {i}
            </div>
        );
    }

    return (
        <div className="absolute top-10 right-10 bg-gray-100 dark:bg-gray-800 bg-opacity-90 backdrop-blur-md rounded-xl shadow-2xl border border-gray-300 dark:border-gray-700 p-4 w-64 z-50 text-black dark:text-white">
            <div className="text-center font-bold mb-4">{currentMonth} {currentYear}</div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2 text-xs font-medium text-gray-500">
                <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {days}
            </div>
        </div>
    );
};

const WorldClockPopup = () => {
    const [times, setTimes] = useState({});

    useEffect(() => {
        const updateTimes = () => {
            const now = new Date();
            setTimes({
                'Pittsburgh': now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }),
                'Delhi': now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
                'New York': now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }),
                'London': now.toLocaleTimeString('en-US', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }),
                'Tokyo': now.toLocaleTimeString('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }),
                'Sydney': now.toLocaleTimeString('en-US', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' }),
            });
        };
        updateTimes();
        const interval = setInterval(updateTimes, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="absolute top-10 right-4 bg-gray-100 dark:bg-gray-800 bg-opacity-90 backdrop-blur-md rounded-xl shadow-2xl border border-gray-300 dark:border-gray-700 p-4 w-48 z-50 text-black dark:text-white">
            <div className="text-center font-bold mb-3 border-b border-gray-300 dark:border-gray-600 pb-2">World Clock</div>
            <div className="space-y-2">
                {Object.entries(times).map(([city, time]) => (
                    <div key={city} className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{city}</span>
                        <span className="font-mono">{time}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function MenuBar() {
    const [time, setTime] = useState(new Date());
    const [showCalendar, setShowCalendar] = useState(false);
    const [showWorldClock, setShowWorldClock] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowCalendar(false);
                setShowWorldClock(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatTime = (date) => {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    const toggleCalendar = () => {
        setShowCalendar(!showCalendar);
        setShowWorldClock(false);
    };

    const toggleWorldClock = () => {
        setShowWorldClock(!showWorldClock);
        setShowCalendar(false);
    };

    return (
        <div ref={menuRef} className="w-full h-8 bg-gray-200 dark:bg-gray-900 bg-opacity-50 dark:bg-opacity-50 backdrop-blur-md flex items-center justify-between px-4 text-xs font-medium text-black dark:text-white select-none z-50 fixed top-0 shadow-sm">
            <div className="flex items-center space-x-4">
                <span className="font-bold text-sm pl-2 cursor-default">ShivOS</span>
                <span className="hidden md:inline px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">File</span>
                <span className="hidden md:inline px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">Edit</span>
                <span className="hidden md:inline px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">View</span>
                <span className="hidden md:inline px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">Go</span>
                <span className="hidden md:inline px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">Window</span>
                <span className="hidden md:inline px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">Help</span>
            </div>

            <div className="flex items-center space-x-4">
                <div className="hidden md:flex items-center space-x-2 px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                    {/* Wifi Icon */}
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.077 13.308-5.077 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.242 0 1 1 0 01-1.415-1.415 5 5 0 017.072 0 1 1 0 01-1.415 1.415zM9 16a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className="hidden md:flex items-center space-x-2 px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                    {/* Battery Icon */}
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2v-2h2v-4h-2V6a2 2 0 00-2-2H4zm10 10H4V6h10v8z" clipRule="evenodd" />
                        <path d="M5 7h8v6H5V7z" />
                    </svg>
                </div>
                <span
                    className={`px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors ${showCalendar ? 'bg-gray-300 dark:bg-gray-700' : ''}`}
                    onClick={toggleCalendar}
                >
                    {formatDate(time)}
                </span>
                <span
                    className={`px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 cursor-pointer transition-colors ${showWorldClock ? 'bg-gray-300 dark:bg-gray-700' : ''}`}
                    onClick={toggleWorldClock}
                >
                    {formatTime(time)}
                </span>
            </div>

            {showCalendar && <CalendarPopup />}
            {showWorldClock && <WorldClockPopup />}
        </div>
    );
}
