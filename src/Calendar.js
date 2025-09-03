import React from 'react';

// Function to get the seed for the day
function getDailySeed() {
  const now = new Date();
  // Using YYYYMMDD as the seed
  const dateStr = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return dateStr;
}

function Calendar({ dailyScores, bestScoreDate }) {
    const today = getDailySeed();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const getDaysInMonth = (year, month) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getDayInfo = (day) => {
        const dateKey = currentYear * 10000 + (currentMonth + 1) * 100 + day;
        return dailyScores[dateKey] || null;
    };

    const totalDays = getDaysInMonth(currentYear, currentMonth);
    const calendarDays = Array.from({ length: totalDays }, (_, i) => i + 1);

    return (
        <div className="calendar-container">
            <h3>{now.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
            <div className="calendar-grid">
                {calendarDays.map((day) => {
                    const info = getDayInfo(day);
                    const dateKey = `${currentYear}${String(currentMonth + 1).padStart(2, '0')}${String(day).padStart(2, '0')}`;
                    const isBestDay = dateKey === bestScoreDate;
                    const isToday = today === getDailySeed(currentYear, currentMonth, day);
                    return (
                        <div
                          key={day}
                          className={`calendar-day ${info ? 'completed' : ''} ${isToday ? 'today' : ''} ${isBestDay ? 'best-day' : ''}`}
                        >
                            <span className="day-number">{day}</span>
                            {info && (
                                <div className="day-info">
                                    <span className="day-time">{info.time}s</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default Calendar;
