import { FormEvent, useEffect, useMemo, useState } from 'react';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const MAX_EVENT_DOTS_IN_CELL = 4;
const STORAGE_KEY = 'uplog-events';
const EVENT_COLOR_PRESETS = ['#3b82f6', '#8b5cf6', '#0ea5a4', '#f97316', '#ec4899'];

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

const chineseLunarFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('ko-KR-u-ca-chinese', {
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    return null;
  }
})();

const getLunarDateText = (date: Date, withLabel = false): string => {
  if (!chineseLunarFormatter) {
    return '';
  }

  const parts = chineseLunarFormatter.formatToParts(date);
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!month || !day) {
    return '';
  }

  if (withLabel) {
    return `음력 ${month}월 ${day}일`;
  }

  return `음 ${month}.${day}`;
};


const buildInitialEvents = (now: Date): Event[] => {
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const laterInMonth = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 3, 28));
  const anotherDay = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 7, 28));

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
};

function App() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventColor, setNewEventColor] = useState(EVENT_COLOR_PRESETS[0]);

  const initialEvents = useMemo<Event[]>(() => buildInitialEvents(today), [today]);

  const [events, setEvents] = useState<Event[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return initialEvents;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return initialEvents;
      }

      return parsed.filter(
        (item): item is Event =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.date === 'string' &&
          typeof item.color === 'string',
      );
    } catch {
      return initialEvents;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, Event[]>>((acc, event) => {
      if (!acc[event.date]) {
        acc[event.date] = [];
      }
      acc[event.date].push(event);
      return acc;
    }, {});
  }, [events]);

  const monthCells = useMemo(() => createMonthGrid(currentMonth), [currentMonth]);

  const monthTitle = `${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월`;
  const selectedDateEvents = eventsByDate[formatDateKey(selectedDate)] ?? [];
  const selectedLunarText = getLunarDateText(selectedDate, true);

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

  const openAddForm = () => {
    setNewEventTitle('');
    setNewEventColor(EVENT_COLOR_PRESETS[0]);
    setIsAddFormOpen(true);
  };

  const closeAddForm = () => {
    setIsAddFormOpen(false);
    setNewEventTitle('');
  };

  const handleAddEvent = (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newEventTitle.trim();
    if (!trimmedTitle) {
      return;
    }

    const createdEvent: Event = {
      id: `event-${Date.now()}`,
      title: trimmedTitle,
      date: formatDateKey(selectedDate),
      color: newEventColor,
    };

    setEvents((prev) => [...prev, createdEvent]);
    closeAddForm();
  };

  const handleDeleteEvent = (eventId: string) => {
    const shouldDelete = window.confirm('이 일정을 삭제할까요?');
    if (!shouldDelete) {
      return;
    }

    setEvents((prev) => prev.filter((event) => event.id !== eventId));
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
              const lunarText = getLunarDateText(cell.date);

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
                  {lunarText && (
                    <span className={`lunar-date ${cell.inCurrentMonth ? '' : 'muted'}`.trim()}>{lunarText}</span>
                  )}
                  <div className="day-events" aria-hidden="true">
                    <div className="event-dots">
                      {visibleEvents.map((event) => (
                        <span
                          key={event.id}
                          className="event-dot"
                          style={{ backgroundColor: event.color }}
                        />
                      ))}
                      {hiddenEventCount > 0 && <span className="event-more">+{hiddenEventCount}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="selected-day-panel" aria-live="polite" aria-label="선택한 날짜 요약">
          <p className="panel-label">선택한 날짜</p>
          <h2 className="panel-date">{formatSelectedDate(selectedDate)}</h2>
          {selectedLunarText && <p className="panel-lunar-date">{selectedLunarText}</p>}

          <button type="button" className="panel-add-button" onClick={openAddForm}>
            일정 추가
          </button>

          {isAddFormOpen && (
            <form className="add-event-form" onSubmit={handleAddEvent}>
              <label htmlFor="new-event-title" className="form-label">일정 제목</label>
              <input
                id="new-event-title"
                type="text"
                className="form-input"
                placeholder="예: 주간 리뷰"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                maxLength={40}
                required
              />

              <p className="form-label">색상 선택</p>
              <div className="color-options" role="radiogroup" aria-label="일정 색상 선택">
                {EVENT_COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-option ${newEventColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewEventColor(color)}
                    aria-label={`색상 ${color}`}
                    aria-pressed={newEventColor === color}
                  />
                ))}
              </div>

              <div className="form-actions">
                <button type="button" className="form-secondary" onClick={closeAddForm}>취소</button>
                <button type="submit" className="form-primary">저장</button>
              </div>
            </form>
          )}

          {selectedDateEvents.length === 0 ? (
            <div className="panel-empty-state">
              <p>아직 일정 없음</p>
            </div>
          ) : (
            <ul className="panel-event-list" aria-label="선택 날짜 일정 목록">
              {selectedDateEvents.map((event) => (
                <li key={event.id}>
                  <span className="panel-event-dot" style={{ backgroundColor: event.color }} aria-hidden="true" />
                  <span className="panel-event-title">{event.title}</span>
                  <button
                    type="button"
                    className="panel-delete-button"
                    onClick={() => handleDeleteEvent(event.id)}
                    aria-label={`${event.title} 일정 삭제`}
                  >
                    삭제
                  </button>
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
