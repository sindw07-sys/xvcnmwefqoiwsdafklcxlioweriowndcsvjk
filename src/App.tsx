import { useMemo, useState } from 'react';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const MAX_EVENT_DOTS_IN_CELL = 4;

type CalendarDay = {
  date: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
};

type Event = {
  id: string;
  title: string;
  date: string;
  color: string;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createMonthGrid = (baseDate: Date): CalendarDay[] => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  const today = new Date();
  const cells: CalendarDay[] = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    cells.push({
      date,
      inCurrentMonth: date.getMonth() === month,
      isToday: isSameDay(date, today),
    });
  }

  return cells;
};

const formatDateKorean = (date: Date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;

const formatSelectedDate = (date: Date) => `${formatDateKorean(date)} ${WEEKDAY_NAMES[date.getDay()]}`;

function App() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  const sampleEvents = useMemo<Event[]>(() => {
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const laterInMonth = new Date(today.getFullYear(), today.getMonth(), Math.min(today.getDate() + 3, 28));
    const anotherDay = new Date(today.getFullYear(), today.getMonth(), Math.min(today.getDate() + 7, 28));

    return [
      {
        id: 'event-1',
        title: '오늘 회고 정리',
        date: formatDateKey(todayDate),
        color: '#3b82f6',
      },
      {
        id: 'event-2',
        title: '팀 주간 미팅',
        date: formatDateKey(laterInMonth),
        color: '#8b5cf6',
      },
      {
        id: 'event-3',
        title: '운동 기록 점검',
        date: formatDateKey(anotherDay),
        color: '#0ea5a4',
      },
    ];
  }, [today]);

  const eventsByDate = useMemo(() => {
    return sampleEvents.reduce<Record<string, Event[]>>((acc, event) => {
      if (!acc[event.date]) {
        acc[event.date] = [];
      }
      acc[event.date].push(event);
      return acc;
    }, {});
  }, [sampleEvents]);

  const monthCells = useMemo(() => createMonthGrid(currentMonth), [currentMonth]);

  const monthTitle = `${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월`;
  const selectedDateEvents = eventsByDate[formatDateKey(selectedDate)] ?? [];

  const goPrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  return (
    <div className="app-shell">
      <header className="calendar-header">
        <div className="brand-block">
          <h1>UpLog</h1>
          <p className="brand-subtitle">Monthly Calendar</p>
        </div>
        <div className="month-controls" aria-label="월 이동 컨트롤">
          <button type="button" onClick={goPrevMonth} aria-label="이전 달" className="icon-button">◀</button>
          <p className="month-title" aria-live="polite" aria-label="현재 표시 중인 월">{monthTitle}</p>
          <button type="button" onClick={goNextMonth} aria-label="다음 달" className="icon-button">▶</button>
          <button type="button" onClick={goToday} className="today-button">오늘</button>
        </div>
      </header>

      <main className="calendar-layout" aria-label="월간 캘린더와 선택 날짜 요약">
        <section className="calendar-card" aria-label="월간 캘린더">
          <div className="calendar-grid">
            {DAY_LABELS.map((label) => (
              <div key={label} className="day-label">{label}</div>
            ))}

            {monthCells.map((cell) => {
              const selected = isSameDay(cell.date, selectedDate);
              const cellEvents = eventsByDate[formatDateKey(cell.date)] ?? [];
              const visibleEvents = cellEvents.slice(0, MAX_EVENT_DOTS_IN_CELL);
              const hiddenEventCount = Math.max(cellEvents.length - visibleEvents.length, 0);

              return (
                <button
                  key={cell.date.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(cell.date)}
                  className={[
                    'day-cell',
                    cell.inCurrentMonth ? '' : 'muted',
                    cell.isToday ? 'today' : '',
                    selected ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selected}
                  aria-label={formatDateKorean(cell.date)}
                >
                  <div className="day-cell-top-row">
                    <span className="date-number">{cell.date.getDate()}</span>
                    {cell.isToday && <span className="badge">Today</span>}
                  </div>
                  <div className="day-events" aria-hidden="true">
                    <div className="event-dots">
                      {visibleEvents.map((event) => (
                        <span
                          key={event.id}
                          className="event-dot"
                          style={{ backgroundColor: event.color }}
                        />
                      ))}
                    </div>
                    {hiddenEventCount > 0 && <span className="event-more">+{hiddenEventCount}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="selected-day-panel" aria-live="polite" aria-label="선택한 날짜 요약">
          <p className="panel-label">선택한 날짜</p>
          <h2 className="panel-date">{formatSelectedDate(selectedDate)}</h2>
          {selectedDateEvents.length === 0 ? (
            <div className="panel-empty-state">
              <p>아직 일정 없음</p>
            </div>
          ) : (
            <ul className="panel-event-list" aria-label="선택 날짜 일정 목록">
              {selectedDateEvents.map((event) => (
                <li key={event.id}>
                  <span className="panel-event-dot" style={{ backgroundColor: event.color }} aria-hidden="true" />
                  <span>{event.title}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
